import { config } from 'dotenv';
import pg from 'pg';
config({ path: '../.env', quiet: true });
const q = (name) => '"' + name.replaceAll('"', '""') + '"';
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const admin = new pg.Client({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: 'frontdesk',
  password: process.env.POSTGRES_PASSWORD,
  database: 'frontdesk',
});
await admin.connect();
try {
  const targets = [['MIGRATION_DATABASE_URL', 'DATABASE_URL', 'frontdesk']];
  if (process.env.TEST_DATABASE_OWNER_URL && process.env.TEST_DATABASE_URL)
    targets.push(['TEST_DATABASE_OWNER_URL', 'TEST_DATABASE_URL', 'frontdesk_test']);
  for (const [ownerKey, runtimeKey, database] of targets) {
    const owner = new URL(process.env[ownerKey]),
      runtime = new URL(process.env[runtimeKey]);
    for (const identity of [owner, runtime]) {
      const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [
        identity.username,
      ]);
      if (!exists.rowCount)
        await admin.query(
          `CREATE ROLE ${q(identity.username)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD ${literal(decodeURIComponent(identity.password))}`,
        );
    }
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
    if (!found.rowCount)
      await admin.query(`CREATE DATABASE ${q(database)} OWNER ${q(owner.username)}`);
    if (database === 'frontdesk')
      await admin.query(`ALTER DATABASE frontdesk OWNER TO ${q(owner.username)}`);
    await admin.query(`REVOKE ALL ON DATABASE ${q(database)} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${q(database)} TO ${q(runtime.username)}`);
    const db = new pg.Client({ connectionString: owner.toString() });
    await db.connect();
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query(`GRANT USAGE ON SCHEMA public TO ${q(runtime.username)}`);
    await db.end();
    console.log(`${database}: separate owner/runtime provisioned; existing data preserved.`);
  }
} finally {
  await admin.end();
}
