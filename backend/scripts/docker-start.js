const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.hostname = process.env.POSTGRES_HOST || 'postgres';
databaseUrl.port = process.env.POSTGRES_PORT || '5432';
process.env.DATABASE_URL = databaseUrl.toString();
await import('../src/server.js');
