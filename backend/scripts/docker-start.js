const databaseUrl = new URL(process.env.DATABASE_URL);
if (process.env.POSTGRES_HOST) {
  databaseUrl.hostname = process.env.POSTGRES_HOST;
}

if (process.env.POSTGRES_PORT) {
  databaseUrl.port = process.env.POSTGRES_PORT;
}

process.env.DATABASE_URL = databaseUrl.toString();
await import('../src/server.js');
