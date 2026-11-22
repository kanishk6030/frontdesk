import session from 'express-session';
import connectPg from 'connect-pg-simple';
import pg from 'pg';
import argon2 from 'argon2';
import { csrfSync } from 'csrf-sync';
import { rateLimit } from 'express-rate-limit';
import { login, empty, identity } from './contracts.js';
import { DomainError } from './errors.js';
const save = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
export function installAuth(app, db, config) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
    options: '-c timezone=UTC',
  });
  const Store = connectPg(session);
  const store = new Store({ pool, createTableIfMissing: false, pruneSessionInterval: 900 });
  app.use(
    '/api',
    session({
      name: 'frontdesk.sid',
      secret: config.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: false,
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 3600000,
      },
    }),
  );
  const { generateToken, csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => req.get('X-CSRF-Token'),
  });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('Origin') !== config.APP_ORIGIN) return next(new DomainError(403, 'CSRF_FAILED'));
    if (!req.is('application/json')) return next(new DomainError(400, 'INVALID_INPUT'));
    csrfSynchronisedProtection(req, res, next);
  });
  app.get('/api/auth/csrf', async (req, res) => {
    const csrf_token = generateToken(req);
    await save(req);
    res.json({ data: { csrf_token } });
  });
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 10,
    keyGenerator: (req) =>
      typeof req.body?.username === 'string'
        ? req.body.username.trim().toLowerCase().slice(0, 150)
        : 'invalid',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new DomainError(429, 'RATE_LIMITED')),
  });
  // Hash once: nonexistent users still pay Argon2 verification cost.
  const dummy = argon2.hash('unused-' + config.SESSION_SECRET, { type: argon2.argon2id });
  app.post('/api/auth/login', limiter, async (req, res) => {
    const input = login.parse(req.body);
    const user = await db.user.findUnique({ where: { username: input.username } });
    const valid = await argon2.verify(user?.passwordHash || (await dummy), input.password);
    if (!valid || !user?.isActive) throw new DomainError(401, 'INVALID_CREDENTIALS');
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = user.id;
    req.session.authExpires = Date.now() + 8 * 3600000;
    req.session.cookie.maxAge = 8 * 3600000;
    const csrf_token = generateToken(req, true);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await save(req);
    res.json({
      data: {
        user: identity.parse({ id: user.id, display_name: user.displayName, role: user.role }),
        csrf_token,
      },
    });
  });
  app.use('/api', async (req, _res, next) => {
    if (!req.session.userId || !req.session.authExpires || Date.now() >= req.session.authExpires)
      throw new DomainError(401, 'AUTH_REQUIRED');
    const user = await db.user.findUnique({ where: { id: req.session.userId } });
    if (!user?.isActive) throw new DomainError(401, 'AUTH_REQUIRED');
    req.user = user;
    req.session.cookie.maxAge = Math.max(0, req.session.authExpires - Date.now());
    next();
  });
  app.get('/api/auth/me', (req, res) =>
    res.json({
      data: identity.parse({
        id: req.user.id,
        display_name: req.user.displayName,
        role: req.user.role,
      }),
    }),
  );
  app.post('/api/auth/logout', async (req, res) => {
    empty.parse(req.body);
    await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
    res
      .clearCookie('frontdesk.sid', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
      })
      .status(204)
      .end();
  });
  return async () => {
    store.close();
    await pool.end();
  };
}
