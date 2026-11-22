import { beforeAll, afterAll, expect, test } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db, owner, testConfig, users, signIn, post, password } from './helpers.js';
let app, close, accounts;
beforeAll(async () => {
  accounts = await users();
  ({ app, close } = createApp({ db, config: testConfig }));
});
afterAll(async () => {
  await close();
  await db.$disconnect();
  await owner.$disconnect();
});
test('T-AUTH / T-SECURITY: CSRF, rotation, identity, logout and unknown credentials', async () => {
  const agent = request.agent(app);
  expect(
    (await agent.post('/api/auth/login').send({ username: accounts[0].username, password })).status,
  ).toBe(403);
  const first = await agent.get('/api/auth/csrf');
  const cookie = first.headers['set-cookie'][0];
  const login = await post(agent, first.body.data.csrf_token, '/api/auth/login', {
    username: accounts[0].username,
    password,
  });
  expect(login.status).toBe(200);
  expect(login.headers['set-cookie'][0]).not.toBe(cookie);
  expect(login.body.data.csrf_token).not.toBe(first.body.data.csrf_token);
  expect((await agent.get('/api/auth/me')).body.data.role).toBe('AGENT');
  expect((await post(agent, first.body.data.csrf_token, '/api/auth/logout', {})).status).toBe(403);
  expect((await post(agent, login.body.data.csrf_token, '/api/auth/logout', {})).status).toBe(204);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrf_token;
  expect(
    (await post(agent, token, '/api/auth/login', { username: 'absent', password })).status,
  ).toBe(401);
});
test('T-AUTH: inactive user rejected on subsequent requests; strict body', async () => {
  const agent = request.agent(app);
  const token = await signIn(agent, accounts[1]);
  expect((await post(agent, token, '/api/auth/logout', { role: 'AGENT' })).status).toBe(400);
  await owner.user.update({ where: { id: accounts[1].id }, data: { isActive: false } });
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});
test('T-INC0318 foundation: runtime has no evidence rewrite or owner powers', async () => {
  const [row] =
    await db.$queryRaw`SELECT has_table_privilege(current_user,'entries','UPDATE') AS entry_update, has_table_privilege(current_user,'audit_events','TRUNCATE') AS audit_truncate, pg_has_role(current_user,'frontdesk_test_owner','MEMBER') AS owner_member`;
  expect(row).toEqual({ entry_update: false, audit_truncate: false, owner_member: false });
  await expect(db.$executeRaw`UPDATE audit_events SET actor_label='changed'`).rejects.toThrow();
  await expect(db.$executeRaw`DELETE FROM entries`).rejects.toThrow();
  await expect(db.$executeRaw`TRUNCATE audit_events`).rejects.toThrow();
});
test('T-AUTH / T-SECURITY: absolute expiry, exact Origin, body limits and safe headers', async () => {
  const agent = request.agent(app);
  const token = await signIn(agent, accounts[0]);
  const me = await agent.get('/api/auth/me');
  expect(me.headers['cache-control']).toBe('no-store');
  expect(me.headers['x-content-type-options']).toBe('nosniff');
  expect(me.headers['access-control-allow-origin']).toBeUndefined();
  expect(
    (
      await agent
        .post('/api/auth/logout')
        .set('Origin', 'https://untrusted.invalid')
        .set('X-CSRF-Token', token)
        .send({})
    ).status,
  ).toBe(403);
  expect(
    (
      await agent
        .post('/api/auth/logout')
        .set('Origin', testConfig.APP_ORIGIN)
        .set('X-CSRF-Token', token)
        .set('Content-Type', 'application/json')
        .send('{bad')
    ).status,
  ).toBe(400);
  expect((await post(agent, token, '/api/auth/logout', { extra: 'x'.repeat(70000) })).status).toBe(
    413,
  );
  await owner.$executeRaw`UPDATE session SET sess=jsonb_set(sess::jsonb,'{authExpires}', '1'::jsonb)::json WHERE sess->>'userId'=${accounts[0].id}`;
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});
test('T-SECURITY: ten normalized-username attempts per minute', async () => {
  const agent = request.agent(app),
    token = (await agent.get('/api/auth/csrf')).body.data.csrf_token;
  for (let i = 0; i < 10; i++)
    expect(
      (
        await post(agent, token, '/api/auth/login', {
          username: i % 2 ? ' Absent-Limit ' : 'absent-limit',
          password: 'wrong',
        })
      ).status,
    ).toBe(401);
  expect(
    (await post(agent, token, '/api/auth/login', { username: 'ABSENT-LIMIT', password: 'wrong' }))
      .status,
  ).toBe(429);
});
test('T-SECURITY: production proxy protocol yields Secure host-only cookies', async () => {
  const production = createApp({
    db,
    config: {
      ...testConfig,
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS: 1,
      APP_ORIGIN: 'https://frontdesk.example.org',
    },
  });
  try {
    const bootstrap = await request(production.app)
      .get('/api/auth/csrf')
      .set('X-Forwarded-Proto', 'https');
    const cookie = bootstrap.headers['set-cookie'][0];
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Domain=');
    const login = await request(production.app)
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://frontdesk.example.org')
      .set('Cookie', cookie.split(';')[0])
      .set('X-CSRF-Token', bootstrap.body.data.csrf_token)
      .send({ username: accounts[0].username, password });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie'][0]).toContain('Secure');
  } finally {
    await production.close();
  }
});
test('T-DEPLOY local persistence: session survives replacing the Express application', async () => {
  const first = createApp({ db, config: testConfig });
  let cookie;
  try {
    const bootstrap = await request(first.app).get('/api/auth/csrf');
    const login = await request(first.app)
      .post('/api/auth/login')
      .set('Origin', testConfig.APP_ORIGIN)
      .set('Cookie', bootstrap.headers['set-cookie'][0].split(';')[0])
      .set('X-CSRF-Token', bootstrap.body.data.csrf_token)
      .send({ username: accounts[0].username, password });
    expect(login.status).toBe(200);
    cookie = login.headers['set-cookie'][0].split(';')[0];
  } finally {
    await first.close();
  }
  const restarted = createApp({ db, config: testConfig });
  try {
    expect(
      (await request(restarted.app).get('/api/auth/me').set('Cookie', cookie)).body.data.id,
    ).toBe(accounts[0].id);
  } finally {
    await restarted.close();
  }
});
