import { config } from 'dotenv';
import pg from 'pg';

async function provisionProduction(mode) {
  const requiredUrl = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required production provisioning setting: ${name}`);
    const url = new URL(value);
    if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error(`${name} must be a PostgreSQL URL.`);
    return url;
  };
  const nameOf = (url) => decodeURIComponent(url.pathname.replace(/^\//, ''));
  const roleOf = (name, url) => {
    const role = decodeURIComponent(url.username);
    if (!/^[a-z_]{3,63}$/.test(role))
      throw new Error(`${name} username must use only lowercase letters and underscores.`);
    return role;
  };
  const passwordOf = (name, url) => {
    const password = decodeURIComponent(url.password);
    if (password.length < 24) throw new Error(`${name} password must contain at least 24 characters.`);
    return password;
  };
  const sameTarget = (left, right) =>
    left.hostname === right.hostname &&
    (left.port || '5432') === (right.port || '5432') &&
    nameOf(left) === nameOf(right);
  const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;

  const adminUrl = requiredUrl('ADMIN_DATABASE_URL');
  const migrationUrl = requiredUrl('MIGRATION_DATABASE_URL');
  const runtimeUrl = requiredUrl('DATABASE_URL');
  if (!sameTarget(adminUrl, migrationUrl) || !sameTarget(adminUrl, runtimeUrl))
    throw new Error('All three production URLs must target the same server and existing database.');
  const databaseName = nameOf(adminUrl);
  const adminRole = roleOf('ADMIN_DATABASE_URL', adminUrl);
  const migrationRole = roleOf('MIGRATION_DATABASE_URL', migrationUrl);
  const runtimeRole = roleOf('DATABASE_URL', runtimeUrl);
  if (new Set([adminRole, migrationRole, runtimeRole]).size !== 3)
    throw new Error('Administrator, migration and runtime roles must be different.');

  const insecureLocal =
    process.env.PROVISION_ALLOW_INSECURE_LOCAL === 'true' &&
    ['127.0.0.1', 'localhost'].includes(adminUrl.hostname);
  for (const [name, url] of [
    ['ADMIN_DATABASE_URL', adminUrl],
    ['MIGRATION_DATABASE_URL', migrationUrl],
    ['DATABASE_URL', runtimeUrl],
  ]) {
    if (!insecureLocal && !['require', 'verify-full'].includes(url.searchParams.get('sslmode')))
      throw new Error(`${name} must use sslmode=require or verify-full.`);
  }
  const migrationPassword = mode === '--apply' ? passwordOf('MIGRATION_DATABASE_URL', migrationUrl) : null;
  const runtimePassword = mode === '--apply' ? passwordOf('DATABASE_URL', runtimeUrl) : null;

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rows: identities } = await admin.query(`SELECT
      current_user AS current_user, current_database() AS current_database,
      current_setting('server_version') AS server_version,
      role.rolsuper, role.rolcreaterole,
      pg_get_userbyid(database.datdba) AS database_owner,
      has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
      has_schema_privilege(current_user,'public','CREATE') AS schema_create
      FROM pg_roles role JOIN pg_database database ON database.datname=current_database()
      WHERE role.rolname=current_user`);
    const identity = identities[0];
    if (!identity) throw new Error('Unable to inspect the connected production administrator.');
    if (identity.current_database !== databaseName || identity.current_user !== adminRole)
      throw new Error('Connected database or administrator does not match ADMIN_DATABASE_URL.');
    if (!identity.rolsuper && !identity.rolcreaterole)
      throw new Error('Connected administrator cannot manage PostgreSQL roles.');
    if (!identity.rolsuper && identity.database_owner !== identity.current_user)
      throw new Error('Connected administrator does not own the existing database.');
    if (!identity.schema_usage || !identity.schema_create)
      throw new Error('Connected administrator lacks required public-schema permissions.');

    const { rows: roles } = await admin.query(
      `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname=ANY($1::text[])`,
      [[migrationRole, runtimeRole]],
    );
    if (
      roles.some(
        (role) =>
          role.rolsuper ||
          role.rolcreatedb ||
          role.rolcreaterole ||
          role.rolreplication ||
          role.rolbypassrls,
      )
    )
      throw new Error('An existing migration/runtime role exceeds the approved privilege baseline.');
    const { rows: memberships } = await admin.query(
      `SELECT 1 FROM pg_auth_members membership
       JOIN pg_roles member ON member.oid=membership.member
       WHERE member.rolname=ANY($1::text[])`,
      [[migrationRole, runtimeRole]],
    );
    if (memberships.length)
      throw new Error('Existing migration/runtime roles have unexpected role memberships.');
    let adminIsMigrationMember = false;
    if (roles.some((role) => role.rolname === migrationRole)) {
      const { rows: membershipCheck } = await admin.query(
        'SELECT pg_has_role(current_user, $1, $2) AS allowed',
        [migrationRole, 'MEMBER'],
      );
      adminIsMigrationMember = membershipCheck[0]?.allowed === true;
    }

    const relationNames = [
      '_prisma_migrations',
      'compatibility_probe',
      'users',
      'tickets',
      'entries',
      'audit_events',
      'audit_events_id_seq',
      'session',
    ];
    const { rows: objects } = await admin.query(
      `SELECT object.relname AS name, pg_get_userbyid(object.relowner) AS owner
       FROM pg_class object JOIN pg_namespace schema ON schema.oid=object.relnamespace
       WHERE schema.nspname='public' AND object.relname=ANY($1::text[])
       UNION ALL
       SELECT function.proname AS name, pg_get_userbyid(function.proowner) AS owner
       FROM pg_proc function JOIN pg_namespace schema ON schema.oid=function.pronamespace
       WHERE schema.nspname='public' AND function.proname=ANY($2::text[])`,
      [relationNames, ['reject_evidence_rewrite', 'stamp_audit_recorded_at']],
    );
    const wrongOwners = objects.filter((object) => object.owner !== migrationRole);
    if (wrongOwners.length)
      throw new Error(
        `Existing Frontdesk objects are not owned by '${migrationRole}': ${wrongOwners.map((object) => object.name).join(', ')}.`,
      );

    console.log(
      `PASS production preflight: PostgreSQL ${identity.server_version}; identity, permissions and ${objects.length} existing Frontdesk object owners are acceptable.`,
    );
    console.log(
      `Default privileges will be configured by '${migrationRole}' itself${adminIsMigrationMember ? '; administrator membership is not used' : '; administrator is not authorized to alter that role\'s defaults directly'}.`,
    );
    if (mode === '--preflight') {
      console.log(
        `DRY RUN: would create or harden roles '${migrationRole}' and '${runtimeRole}' in the existing database.`,
      );
      return;
    }

    const database = identifier(databaseName);
    const migration = identifier(migrationRole);
    const runtime = identifier(runtimeRole);
    const existing = new Set(roles.map((role) => role.rolname));
    await admin.query('BEGIN');
    try {
      if (existing.has(migrationRole))
        await admin.query(
          `ALTER ROLE ${migration} WITH LOGIN NOINHERIT PASSWORD ${literal(migrationPassword)}`,
        );
      else
        await admin.query(
          `CREATE ROLE ${migration} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(migrationPassword)}`,
        );
      if (existing.has(runtimeRole))
        await admin.query(
          `ALTER ROLE ${runtime} WITH LOGIN NOINHERIT PASSWORD ${literal(runtimePassword)}`,
        );
      else
        await admin.query(
          `CREATE ROLE ${runtime} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(runtimePassword)}`,
        );
      await admin.query(`REVOKE ${migration} FROM ${runtime}`);
      await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${migration}, ${runtime}`);
      await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await admin.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${migration}`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO ${runtime}`);
      await admin.query(`REVOKE CREATE ON SCHEMA public FROM ${runtime}`);
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
    console.log(
      `PASS production apply: roles '${migrationRole}' and '${runtimeRole}' are hardened; the existing database and application objects were not created, dropped, reset, renamed or re-owned.`,
    );
  } finally {
    await admin.end();
  }

  const migration = new pg.Client({ connectionString: migrationUrl.toString() });
  const runtime = new pg.Client({ connectionString: runtimeUrl.toString() });
  let probeOpen = false;
  try {
    await migration.connect();
    await migration.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC',
    );
    await migration.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC',
    );
    await migration.query('BEGIN');
    probeOpen = true;
    await migration.query('CREATE TABLE frontdesk_provision_permission_probe(id integer)');
    await migration.query('ROLLBACK');
    probeOpen = false;
    await runtime.connect();
    const { rows } = await runtime.query(
      `SELECT current_user AS identity, current_database() AS database,
       has_schema_privilege(current_user,'public','CREATE') AS schema_create`,
    );
    if (
      rows[0]?.identity !== runtimeRole ||
      rows[0]?.database !== databaseName ||
      rows[0]?.schema_create
    )
      throw new Error('Runtime identity or schema privilege verification failed.');
    console.log(
      'PASS production role verification: migration can create migration objects; runtime can connect but cannot create schema objects.',
    );
  } finally {
    if (probeOpen) await migration.query('ROLLBACK').catch(() => {});
    await migration.end().catch(() => {});
    await runtime.end().catch(() => {});
  }
}

const production = process.argv.includes('--production');
if (production) {
  const modes = ['--preflight', '--apply'].filter((flag) => process.argv.includes(flag));
  if (modes.length !== 1)
    throw new Error('Production provisioning requires exactly one mode: --preflight or --apply.');
  await provisionProduction(modes[0]);
} else {
  if (process.argv.includes('--preflight') || process.argv.includes('--apply'))
    throw new Error('--preflight and --apply require --production.');
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
}
