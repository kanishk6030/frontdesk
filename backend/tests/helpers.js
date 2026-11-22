import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { createDatabase } from '../src/db.js';
config({ path: '../.env', quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL);
if (target.pathname !== '/frontdesk_test' || !['localhost', '127.0.0.1'].includes(target.hostname))
  throw new Error('Tests require isolated local frontdesk_test database');
export const db = createDatabase(process.env.TEST_DATABASE_URL);
export const owner = createDatabase(process.env.TEST_DATABASE_OWNER_URL);
export const testConfig = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  JOB_TOKEN: 'test-job-secret-at-least-32-characters',
  APP_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
  TRUST_PROXY_HOPS: 0,
  FRONTDESK_HOLIDAYS: '[]',
};
export const password = 'Test-Only-Password-123!';
export async function users() {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  return Promise.all(
    ['AGENT', 'AGENT', 'CUSTOMER', 'CUSTOMER'].map((role, i) =>
      owner.user.create({
        data: {
          username: randomUUID(),
          displayName: `Test ${role} ${i}`,
          passwordHash: hash,
          role,
        },
      }),
    ),
  );
}
export async function signIn(agent, user) {
  const bootstrap = await agent.get('/api/auth/csrf');
  const response = await agent
    .post('/api/auth/login')
    .set('Origin', testConfig.APP_ORIGIN)
    .set('X-CSRF-Token', bootstrap.body.data.csrf_token)
    .send({ username: user.username, password });
  if (response.status !== 200) throw new Error('Login failed: ' + JSON.stringify(response.body));
  return response.body.data.csrf_token;
}
export const post = (agent, token, path, body) =>
  agent.post(path).set('Origin', testConfig.APP_ORIGIN).set('X-CSRF-Token', token).send(body);
