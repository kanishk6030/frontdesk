import { config } from 'dotenv';
import { spawn } from 'node:child_process';
config({ path: '.env', quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/frontdesk') {
  throw new Error('This inspection command permits only the local development database.');
}
url.searchParams.set('options', '-c default_transaction_read_only=on');
const child = spawn(
  process.execPath,
  [
    '--import',
    './scripts/loopback-only.js',
    'node_modules/prisma/build/index.js',
    'studio',
    '--port',
    '5555',
    '--browser',
    'none',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url.toString(), MIGRATION_DATABASE_URL: url.toString() },
  },
);
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.once('SIGINT', () => child.kill());
process.once('SIGTERM', () => child.kill());
