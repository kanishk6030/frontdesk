import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3 }),
});
try {
  const result =
    await db.$queryRaw`SELECT current_user AS identity, current_database() AS database, current_setting('server_version') AS version`;
  console.log(JSON.stringify(result));
  const [permissions] = await db.$queryRaw`SELECT
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_table_privilege(current_user,'entries','UPDATE,DELETE,TRUNCATE') AS entry_rewrite,
    has_table_privilege(current_user,'audit_events','UPDATE,DELETE,TRUNCATE') AS audit_rewrite,
    has_table_privilege(current_user,'tickets','DELETE,TRUNCATE') AS ticket_delete,
    pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='tickets'::regclass),'MEMBER') AS owner_member`;
  if (Object.values(permissions).some(Boolean))
    throw new Error('Runtime role exceeds the approved privilege boundary.');
  console.log(
    'PASS: runtime cannot create schema objects, assume ticket owner, rewrite evidence or delete tickets.',
  );
} finally {
  await db.$disconnect();
}
