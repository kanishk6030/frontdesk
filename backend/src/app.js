import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { installAuth } from './auth.js';
import { DomainError } from './errors.js';
export function createApp({ db, config, installRoutes = () => {}, installInternal = () => {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    });
    next();
  });
  app.use(express.json({ limit: '64kb', strict: true }));
  app.get('/healthz', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ data: { status: 'ok' } });
    } catch {
      res
        .status(503)
        .json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' } });
    }
  });
  installInternal(app);
  const close = installAuth(app, db, config);
  installRoutes(app);
  app.use((req, _res, next) => {
    const known =
      /^\/api\/auth\/(csrf|login|me|logout)$|^\/api\/(agent|customer)\/tickets(?:\/[0-9a-f-]+(?:\/(entries|audit|claim|replies|notes|priority|reopen))?)?$/.test(
        req.path,
      );
    next(new DomainError(known ? 405 : 404, known ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND'));
  });
  app.use((error, req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Check the supplied fields.',
          fields: Object.fromEntries(
            error.issues.map((i) => [
              i.path.join('.') || 'request',
              'Invalid value or unexpected field',
            ]),
          ),
        },
      });
    if (error instanceof DomainError)
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error.code === 'EBADCSRFTOKEN')
      return res
        .status(403)
        .json({ error: { code: 'CSRF_FAILED', message: 'Refresh your session and retry.' } });
    if (error.type === 'entity.too.large')
      return res
        .status(413)
        .json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request exceeds 64 KiB.' } });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid JSON.' } });
    const databaseCode = error.meta?.driverAdapterError?.cause?.originalCode || error.meta?.code;
    const unavailable =
      ['P1001', 'P1002', 'P2024', 'P2028', 'P2034'].includes(error.code) ||
      ['55P03', '57014', '40001'].includes(databaseCode);
    const correlation = randomUUID();
    console.error(
      JSON.stringify({
        event: 'request_failure',
        correlation,
        code: error.code || error.name,
        method: req.method,
      }),
    );
    res.status(unavailable ? 503 : 500).json({
      error: {
        code: unavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
        message: 'Request failed. Reference ' + correlation,
      },
    });
  });
  return { app, close };
}
