import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export function createDatabase(connectionString) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
      options: '-c timezone=UTC',
    }),
    transactionOptions: { maxWait: 5000, timeout: 10000 },
  });
}
export async function databaseTime(tx) {
  const [row] = await tx.$queryRaw`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
  return row.now;
}
