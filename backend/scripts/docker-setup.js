import { spawnSync } from 'node:child_process';

const databaseHost = process.env.POSTGRES_HOST || 'postgres';
for (const key of [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'TEST_DATABASE_URL',
  'TEST_DATABASE_OWNER_URL',
]) {
  if (!process.env[key]) continue;
  const value = new URL(process.env[key]);
  value.hostname = databaseHost;
  value.port = process.env.POSTGRES_PORT || '5432';
  process.env[key] = value.toString();
}

const commands = [
  ['node', ['scripts/provision-local.js']],
  ['npx', ['prisma', 'migrate', 'deploy']],
  ['node', ['scripts/grant-runtime.js']],
  ['node', ['scripts/seed-demo.js']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { env: process.env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
