import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(resolve(root, '.env')))
  throw new Error('Existing .env preserved; configure manually.');
const secret = () => randomBytes(32).toString('hex');
const url = (user, db) => `postgresql://${user}:${secret()}@127.0.0.1:5432/${db}`;
const values = {
  POSTGRES_PASSWORD: secret(),
  DATABASE_URL: url('frontdesk_runtime', 'frontdesk'),
  MIGRATION_DATABASE_URL: url('frontdesk_owner', 'frontdesk'),
  TEST_DATABASE_URL: url('frontdesk_test_runtime', 'frontdesk_test'),
  TEST_DATABASE_OWNER_URL: url('frontdesk_test_owner', 'frontdesk_test'),
  SESSION_SECRET: secret(),
  JOB_TOKEN: secret(),
  APP_ORIGIN: 'http://localhost:5173',
  FRONTDESK_HOLIDAYS: '[]',
  NODE_ENV: 'development',
  TZ: 'UTC',
  PORT: '3000',
  TRUST_PROXY_HOPS: '0',
  DEMO_AGENT_PASSWORD: secret().slice(0, 20),
  DEMO_CUSTOMER_PASSWORD: secret().slice(0, 20),
};
writeFileSync(
  resolve(root, '.env'),
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
);
const runtime = Object.fromEntries(
  Object.entries(values).filter(([k]) => !/POSTGRES|MIGRATION|TEST_|DEMO_/.test(k)),
);
mkdirSync(resolve(root, 'backend'), { recursive: true });
writeFileSync(
  resolve(root, 'backend/.env'),
  Object.entries(runtime)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
);
console.log(
  'Created ignored operator and restricted runtime environment files; no secrets printed.',
);
