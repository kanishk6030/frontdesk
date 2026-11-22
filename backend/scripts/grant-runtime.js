import pg from 'pg';
import { config } from 'dotenv';
config({ path: '../.env', quiet: true });
export async function grantRuntime(ownerUrl, runtimeUrl) {
  const role = new URL(runtimeUrl).username;
  if (!/^[a-z_]+$/.test(role)) throw new Error('Invalid role identifier');
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, "${role}";
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, "${role}";
      REVOKE CREATE ON SCHEMA public FROM PUBLIC, "${role}";
      GRANT USAGE ON SCHEMA public TO "${role}";
      GRANT SELECT ON users TO "${role}";
      GRANT UPDATE(password_hash,last_login_at) ON users TO "${role}";
      GRANT SELECT,INSERT,UPDATE ON tickets TO "${role}";
      GRANT SELECT,INSERT ON entries,audit_events TO "${role}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON session TO "${role}";
      GRANT USAGE ON SEQUENCE audit_events_id_seq TO "${role}";`);
    console.log('Applied restricted runtime grants to ' + new URL(runtimeUrl).pathname);
  } finally {
    await client.end();
  }
}
if (process.argv[1]?.endsWith('grant-runtime.js')) {
  const test = process.argv.includes('--test');
  await grantRuntime(
    process.env[test ? 'TEST_DATABASE_OWNER_URL' : 'MIGRATION_DATABASE_URL'],
    process.env[test ? 'TEST_DATABASE_URL' : 'DATABASE_URL'],
  );
}
