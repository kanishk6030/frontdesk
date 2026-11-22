import { config } from 'dotenv';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/db.js';
import { createReads } from '../src/reads.js';
import { createTicketService } from '../src/tickets.js';
config({ path: '../.env', quiet: true });
const target = new URL(process.env.TEST_DATABASE_OWNER_URL);
if (target.pathname !== '/frontdesk_test' || !['localhost', '127.0.0.1'].includes(target.hostname))
  throw new Error('Performance fixtures require local isolated test database.');
const owner = createDatabase(target.toString()),
  db = createDatabase(process.env.TEST_DATABASE_URL);
try {
  const agent = await owner.user.create({
    data: {
      username: randomUUID(),
      displayName: 'Performance agent',
      role: 'AGENT',
      passwordHash: 'not-a-login-fixture',
    },
  });
  const customer = await owner.user.create({
    data: {
      username: randomUUID(),
      displayName: 'Performance customer',
      role: 'CUSTOMER',
      passwordHash: 'not-a-login-fixture',
    },
  });
  const now = new Date('2100-01-04T04:00:00.000Z'),
    service = createTicketService({ db, clock: async () => now, fixture: true });
  const { ticket } = await service.create(customer, {
    subject: '[PERF TEST] Representative queue',
    description: 'Isolated test-only fixture',
    priority: 'MEDIUM',
  });
  const { customer: _customer, assignee: _assignee, ...scalar } = ticket;
  await owner.ticket.createMany({
    data: Array.from({ length: 2000 }, (_, i) => ({
      ...scalar,
      id: randomUUID(),
      subject: '[PERF TEST] ' + i,
      status: 'IN_PROGRESS',
      assigneeId: agent.id,
    })),
  });
  const reads = createReads(db, async () => now),
    q = { scope: 'mine', status: 'active', sla: 'all', page: 1, page_size: 25 };
  await reads.list(agent, q);
  const measurements = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    const result = await reads.list(agent, q);
    if (result.pagination.total !== 2000) throw new Error('Fixture count mismatch');
    measurements.push(performance.now() - start);
  }
  console.log(
    JSON.stringify({
      tickets: 2000,
      warm_queries: 10,
      min_ms: Math.round(Math.min(...measurements)),
      max_ms: Math.round(Math.max(...measurements)),
      average_ms: Math.round(measurements.reduce((a, b) => a + b, 0) / measurements.length),
      scope: 'Local runtime-role queue query and DTO projection; not a production load test',
    }),
  );
} finally {
  await owner.$disconnect();
  await db.$disconnect();
}
