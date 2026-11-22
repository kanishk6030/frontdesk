import { readConfig } from './config.js';
import { createDatabase } from './db.js';
import { makeCalendar } from './calendar.js';
import { createTicketService } from './tickets.js';
import { createApp } from './app.js';
import { ticketRoutes, maintenanceRoute } from './routes.js';
const config = readConfig();
const db = createDatabase(config.DATABASE_URL);
const service = createTicketService({
  db,
  calendar: makeCalendar(JSON.parse(config.FRONTDESK_HOLIDAYS)),
});
const { app, close } = createApp({
  db,
  config,
  installRoutes: ticketRoutes(db, service),
  installInternal: maintenanceRoute(service, config),
});
await db.$queryRaw`SELECT 1`;
const server = app.listen(config.PORT, () =>
  console.log(`Frontdesk API listening on port ${config.PORT}`),
);
async function shutdown() {
  server.close(async () => {
    await close();
    await db.$disconnect();
    process.exit(0);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
