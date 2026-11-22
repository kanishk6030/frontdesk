import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
config({ path: '../.env', quiet: true });
const target = new URL(process.env.TEST_DATABASE_OWNER_URL);
if (target.pathname !== '/frontdesk_test' || !['127.0.0.1', 'localhost'].includes(target.hostname))
  throw new Error('Only the isolated local test database is allowed.');
const result = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { stdio: 'inherit', env: { ...process.env, MIGRATION_DATABASE_URL: target.toString() } },
);
process.exitCode = result.status ?? 1;
