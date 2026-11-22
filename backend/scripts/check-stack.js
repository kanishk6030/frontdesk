import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const forbidden = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.tools', '.local', 'dist'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(ts|tsx|py)$|^tsconfig.*\.json$/.test(entry.name)) forbidden.push(path);
  }
}
scan('..');
if (forbidden.length) throw new Error('Forbidden application source: ' + forbidden.join(', '));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const name of ['@prisma/client', '@prisma/adapter-pg'])
  if (pkg.dependencies[name] !== '7.0.0') throw new Error('Unexpected Prisma pin');
if (pkg.devDependencies.prisma !== '7.0.0' || pkg.dependencies.pg !== '8.16.3')
  throw new Error('Unexpected CLI/driver pin');
if (!process.version.startsWith('v24.')) throw new Error('Node 24 required');
console.log(
  'PASS: Node 24; exact Prisma 7.0.0 / pg 8.16.3 pins; project source/configuration JavaScript-only.',
);
