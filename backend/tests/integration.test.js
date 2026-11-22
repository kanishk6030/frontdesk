import { beforeAll, afterAll, expect, test } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { createTicketService } from '../src/tickets.js';
import { ticketRoutes, maintenanceRoute } from '../src/routes.js';
import { makeCalendar, HOUR, slaProjection } from '../src/calendar.js';
import { auditDTO } from '../src/projections.js';
import { db, owner, testConfig, users, signIn, post } from './helpers.js';
const at = (s) => DateTime.fromISO(s, { zone: 'Asia/Kolkata' }).toJSDate();
let now, accounts, app, close, service, agents, tokens;
const clock = async () => now;
const setTime = (s) => {
  now = at(s);
};
function application(svc, database = db) {
  return createApp({
    db: database,
    config: testConfig,
    installRoutes: ticketRoutes(database, svc, clock),
    installInternal: maintenanceRoute(svc, testConfig),
  });
}
beforeAll(async () => {
  accounts = await users();
  service = createTicketService({ db, clock });
  ({ app, close } = application(service));
  agents = accounts.map(() => request.agent(app));
  tokens = await Promise.all(agents.map((a, i) => signIn(a, accounts[i])));
});
afterAll(async () => {
  await close();
  await db.$disconnect();
  await owner.$disconnect();
});
const send = (index, path, body) => post(agents[index], tokens[index], path, body);
async function create(priority = 'MEDIUM') {
  const res = await send(2, '/api/customer/tickets', {
    subject: '[TEST] Order cannot be completed',
    description: 'Original customer problem',
    priority,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.ticket;
}
async function detail(id) {
  const res = await agents[0].get('/api/agent/tickets/' + id);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}
async function action(t, route, body = {}, index = 0) {
  const result = await send(index, `/api/agent/tickets/${t.id}/${route}`, {
    expected_version: t.version,
    ...body,
  });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data.ticket;
}
async function claimed(priority = 'MEDIUM') {
  const t = await create(priority);
  return action({ ...t, version: 1 }, 'claim');
}
test('T-INC0291: independent PostgreSQL sessions contend; one owner, loser cannot reply, retry no-op', async () => {
  setTime('2026-11-23T09:30');
  for (const reverse of [false, true]) {
    const t = await create();
    const secondDb = createDatabase(process.env.TEST_DATABASE_URL);
    let arrived = 0,
      release;
    const ready = new Promise((resolve) => {
      release = resolve;
    });
    const pids = new Set();
    const barrier = async (tx) => {
      const [row] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      pids.add(row.pid);
      if (++arrived === 2) release();
      await ready;
    };
    const a = application(createTicketService({ db, clock, beforeLock: barrier }));
    const b = application(
      createTicketService({ db: secondDb, clock, beforeLock: barrier }),
      secondDb,
    );
    try {
      const clients = [request.agent(a.app), request.agent(b.app)];
      const csrf = await Promise.all(clients.map((c, i) => signIn(c, accounts[i])));
      const order = reverse ? [1, 0] : [0, 1];
      const results = await Promise.all(
        order.map((i) =>
          post(clients[i], csrf[i], `/api/agent/tickets/${t.id}/claim`, { expected_version: 1 }),
        ),
      );
      expect(pids.size).toBe(2);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = order[results.findIndex((r) => r.status === 200)],
        loser = 1 - winner;
      expect(results.find((r) => r.status === 409).body.error.code).toBe('ALREADY_CLAIMED');
      expect(
        (
          await send(loser, `/api/agent/tickets/${t.id}/replies`, {
            expected_version: 2,
            body: 'Not allowed',
            action: 'reply',
          })
        ).status,
      ).toBe(403);
      expect(
        (await send(winner, `/api/agent/tickets/${t.id}/claim`, { expected_version: 1 })).status,
      ).toBe(200);
      expect(
        await db.auditEvent.count({ where: { ticketId: t.id, eventType: 'TICKET_CLAIMED' } }),
      ).toBe(1);
      expect(
        (
          await send(winner, `/api/agent/tickets/${t.id}/replies`, {
            expected_version: 2,
            body: 'Owner response',
            action: 'reply',
          })
        ).status,
      ).toBe(200);
    } finally {
      await a.close();
      await b.close();
      await secondDb.$disconnect();
    }
  }
});
test('T-INC0304 / T-SLA06: internal note canary absent from every public representation and pagination', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed();
  const before = await agents[2].get(`/api/customer/tickets/${t.id}`);
  t = await action(t, 'notes', { body: 'PRIVATE-CANARY-INC0304-ONLY-STAFF' });
  const note = await db.entry.findFirst({ where: { ticketId: t.id, kind: 'INTERNAL_NOTE' } });
  expect(t.sla.first_response.completed_at).toBeNull();
  const after = await agents[2].get(`/api/customer/tickets/${t.id}`);
  expect(after.body).toEqual(before.body);
  t = await action(t, 'replies', { body: 'Public answer', action: 'reply' });
  for (const path of [
    '/api/customer/tickets',
    `/api/customer/tickets/${t.id}`,
    `/api/customer/tickets/${t.id}/entries?limit=1`,
  ]) {
    const res = await agents[2].get(path);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const forbidden of [
      'PRIVATE-CANARY',
      note.id,
      'INTERNAL_NOTE',
      'updated_at',
      'version',
      'assignee',
      'audit',
    ])
      expect(text).not.toContain(forbidden);
  }
  const entries = await agents[2].get(`/api/customer/tickets/${t.id}/entries?limit=1`);
  expect(entries.body.data).toHaveLength(1);
  expect(entries.body.pagination.next_cursor).toBeNull();
  expect((await agents[0].get(`/api/agent/tickets/${t.id}/entries`)).text).toContain(
    'PRIVATE-CANARY',
  );
  expect((await agents[3].get(`/api/customer/tickets/${t.id}`)).status).toBe(404);
  for (const path of [`/api/agent/tickets/${t.id}`, `/api/agent/tickets/${t.id}/audit`])
    expect((await agents[2].get(path)).status).toBe(403);
  expect((await agents[2].get('/api/customer/tickets/export')).status).toBe(404);
  expect((await agents[2].get(`/api/customer/tickets/${t.id}/export`)).status).toBe(404);
  expect(
    (await agents[2].get(`/api/customer/tickets/${t.id}/entries?kind=INTERNAL_NOTE`)).status,
  ).toBe(400);
  expect(
    (await send(2, `/api/agent/tickets/${t.id}/notes`, { expected_version: t.version, body: 'no' }))
      .status,
  ).toBe(403);
});
test('T-INC0318: actual evidence immutable through Prisma and SQL; recorded time forced by database', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed();
  setTime('2026-11-23T10:10');
  t = await action(t, 'replies', { body: 'Response after forty minutes', action: 'reply' });
  const entry = await db.entry.findFirst({ where: { ticketId: t.id } }),
    event = await db.auditEvent.findFirst({
      where: { ticketId: t.id, eventType: 'PUBLIC_REPLY_ADDED' },
    });
  expect(event.actorId).toBe(accounts[0].id);
  expect(event.occurredAt).toEqual(now);
  expect(entry.createdAt).toEqual(now);
  expect(event.entryId).toBe(entry.id);
  await expect(
    db.entry.update({ where: { id: entry.id }, data: { body: 'rewritten' } }),
  ).rejects.toThrow();
  await expect(db.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  for (const query of [
    db.$executeRaw`UPDATE audit_events SET actor_label='x' WHERE id=${event.id}`,
    db.$executeRaw`DELETE FROM entries WHERE id=${entry.id}`,
    db.$executeRaw`TRUNCATE entries`,
    db.$executeRaw`TRUNCATE audit_events`,
  ])
    await expect(query).rejects.toThrow();
  await expect(
    owner.entry.update({ where: { id: entry.id }, data: { body: 'owner ordinary update' } }),
  ).rejects.toThrow();
  const { id: _id, recordedAt: _recorded, ...copy } = event;
  const inserted = await db.auditEvent.create({
    data: { ...copy, recordedAt: new Date('2000-01-01') },
  });
  expect(inserted.recordedAt.getUTCFullYear()).toBeGreaterThan(2020);
  expect(auditDTO({ ...inserted, id: 9007199254740993n }).id).toBe('9007199254740993');
  expect((await agents[0].delete(`/api/agent/tickets/${t.id}/entries`)).status).toBe(403);
  expect((await db.entry.findUnique({ where: { id: entry.id } })).body).toBe(
    'Response after forty minutes',
  );
});
test('T-ATOMIC: injected audit failure rolls back claim and reply/wait', async () => {
  setTime('2026-11-23T09:30');
  const t = await create();
  const broken = createTicketService({
    db,
    clock,
    beforeAudit: async () => {
      throw new Error('Injected audit failure');
    },
  });
  await expect(
    broken.command(t.id, accounts[0], 'claim', { expected_version: 1 }),
  ).rejects.toThrow();
  expect((await db.ticket.findUnique({ where: { id: t.id } })).assigneeId).toBeNull();
  let claimedTicket = await action({ ...t, version: 1 }, 'claim');
  await expect(
    broken.command(t.id, accounts[0], 'replies', {
      expected_version: claimedTicket.version,
      body: 'Question',
      action: 'wait',
    }),
  ).rejects.toThrow();
  expect(await db.entry.count({ where: { ticketId: t.id } })).toBe(0);
  expect((await detail(t.id)).status).toBe('IN_PROGRESS');
});
test('T-INC0291 / T-CONTRACT: a blocked row lock returns 503 without a partial claim', async () => {
  setTime('2026-11-23T09:30');
  const t = await create();
  let locked, release;
  const ready = new Promise((resolve) => {
      locked = resolve;
    }),
    held = new Promise((resolve) => {
      release = resolve;
    });
  const holding = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM tickets WHERE id=${t.id}::uuid FOR UPDATE`;
      locked();
      await held;
    },
    { timeout: 15000 },
  );
  await ready;
  try {
    const response = await send(0, `/api/agent/tickets/${t.id}/claim`, { expected_version: 1 });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  } finally {
    release();
    await holding;
  }
  expect((await db.ticket.findUnique({ where: { id: t.id } })).assigneeId).toBeNull();
  expect(
    await db.auditEvent.count({ where: { ticketId: t.id, eventType: 'TICKET_CLAIMED' } }),
  ).toBe(0);
});
test('T-SLA07/08/14: wait/resume retains snapshot, followups and notes do not reset cutoff', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed();
  setTime('2026-11-23T11:30');
  t = await action(t, 'replies', { body: 'Order number?', action: 'wait' });
  expect(t.auto_close_due_at).toBe(at('2026-11-30T11:30').toISOString());
  expect(t.sla.resolution.remaining_seconds).toBe(25 * 3600);
  expect(t.sla.resolution.due_at).toBeNull();
  const cutoff = t.auto_close_due_at,
    fr = t.sla.first_response;
  setTime('2026-11-24T12:00');
  t = await action(t, 'notes', { body: 'Internal investigation' });
  t = await action(t, 'replies', { body: 'Still waiting', action: 'reply' });
  expect(t.auto_close_due_at).toBe(cutoff);
  expect(t.sla.first_response).toEqual(fr);
  expect(
    (
      await send(0, `/api/agent/tickets/${t.id}/replies`, {
        expected_version: t.version,
        body: 'again',
        action: 'wait',
      })
    ).status,
  ).toBe(409);
  setTime('2026-11-25T10:30');
  const res = await send(2, `/api/customer/tickets/${t.id}/replies`, { body: 'Order 123' });
  expect(res.status).toBe(200);
  t = await detail(t.id);
  expect(t.sla.resolution.due_at).toBe(at('2026-11-27T17:30').toISOString());
  expect(t.calendar.holidays).toEqual([]);
});
test('T-SLA09/10/11: priority preserves original elapsed budget and old breaches', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed('LOW');
  setTime('2026-11-24T10:30');
  t = await action(t, 'priority', { priority: 'HIGH', reason: 'Cannot work' });
  expect(t.sla.resolution.state).toBe('OVERDUE');
  expect(t.sla.resolution.remaining_seconds).toBe(-3600);
  expect(t.sla.first_response.ever_breached).toBe(true);
  t = await action(t, 'priority', { priority: 'LOW', reason: 'Workaround' });
  expect(t.sla.resolution.state).toBe('PENDING');
  expect(t.sla.resolution.ever_breached).toBe(true);
  t = await action(t, 'replies', { body: 'Need evidence', action: 'wait' });
  const cutoff = t.auto_close_due_at,
    fr = t.sla.first_response;
  t = await action(t, 'priority', { priority: 'HIGH', reason: 'Tighten while waiting' });
  expect(t.sla.resolution.due_at).toBeNull();
  expect(t.sla.resolution.remaining_seconds).toBe(-3600);
  expect(t.auto_close_due_at).toBe(cutoff);
  expect(t.sla.first_response).toEqual(fr);
  expect(
    await db.auditEvent.count({ where: { ticketId: t.id, eventType: 'RESOLUTION_BREACHED' } }),
  ).toBe(1);
  setTime('2026-11-23T09:30');
  let high = await claimed('HIGH');
  setTime('2026-11-23T18:30:00.001');
  high = await action(high, 'priority', { priority: 'LOW', reason: 'Relax missed target' });
  expect(high.sla.resolution.ever_breached).toBe(true);
  expect(high.sla.first_response.ever_breached).toBe(true);
});
test('T-SLA05: completion before, at and after fixed deadline; weekend breach', async () => {
  for (const delta of [-1, 0, 1]) {
    setTime('2026-11-23T09:30');
    let t = await claimed('HIGH');
    now = new Date(at('2026-11-23T11:30').getTime() + delta);
    t = await action(t, 'replies', { body: 'First reply', action: 'reply' });
    expect(t.sla.first_response.state).toBe(delta > 0 ? 'MISSED' : 'MET');
    setTime('2026-11-23T09:30');
    let resolved = await claimed('HIGH');
    resolved = await action(resolved, 'replies', { body: 'Early response', action: 'reply' });
    now = new Date(at('2026-11-23T18:30').getTime() + delta);
    resolved = await action(resolved, 'replies', {
      body: 'Resolved at boundary',
      action: 'resolve',
    });
    expect(resolved.sla.resolution.state).toBe(delta > 0 ? 'MISSED' : 'MET');
  }
  setTime('2026-11-20T18:00');
  let t = await claimed('HIGH');
  setTime('2026-11-22T12:00');
  t = await detail(t.id);
  expect(t.sla.resolution.state).toBe('OVERDUE');
  expect(t.sla.resolution.remaining_seconds).toBe(0);
});
test('T-SLA12/13 and T-REOPEN: remaining budget, inclusive cutoff, terminal permissions', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed('HIGH');
  setTime('2026-11-23T12:30');
  t = await action(t, 'replies', { body: 'Fixed', action: 'resolve' });
  const fr = t.sla.first_response;
  expect(
    (await send(2, `/api/customer/tickets/${t.id}/replies`, { body: 'Still broken' })).body.error
      .code,
  ).toBe('REOPEN_REQUIRED');
  setTime('2026-11-24T10:30');
  expect(
    (await send(2, `/api/customer/tickets/${t.id}/reopen`, { body: 'Still broken' })).status,
  ).toBe(200);
  t = await detail(t.id);
  expect(t.sla.resolution.due_at).toBe(at('2026-11-24T16:30').toISOString());
  expect(t.sla.first_response).toEqual(fr);
  t = await action(t, 'replies', { body: 'Need context', action: 'wait' });
  setTime('2026-11-25T10:30');
  t = await action(t, 'replies', { body: 'Fixed while paused', action: 'resolve' });
  expect(t.sla.resolution.due_at).toBeNull();
  expect(t.sla.resolution.remaining_seconds).toBe(6 * 3600);
  now = new Date(t.reopen_until);
  expect(
    (await send(2, `/api/customer/tickets/${t.id}/reopen`, { body: 'At cutoff' })).status,
  ).toBe(200);
  t = await detail(t.id);
  t = await action(t, 'replies', { body: 'Fixed again', action: 'resolve' });
  now = new Date(new Date(t.reopen_until).getTime() + 1);
  expect(
    (await send(2, `/api/customer/tickets/${t.id}/reopen`, { body: 'Too late' })).body.error.code,
  ).toBe('REOPEN_WINDOW_EXPIRED');
  expect(
    (await send(3, `/api/customer/tickets/${t.id}/reopen`, { body: 'Other user' })).status,
  ).toBe(404);
  t = await action(t, 'notes', { body: 'Terminal note permitted' });
  expect(t.status).toBe('RESOLVED');
});
test('T-CLOSE / T-ATOMIC: GET read-only; exact cutoff commits closure then rejects message', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed();
  setTime('2026-11-23T11:30');
  t = await action(t, 'replies', { body: 'Please respond', action: 'wait' });
  now = new Date(t.auto_close_due_at);
  const events = await db.auditEvent.count({ where: { ticketId: t.id } });
  expect((await detail(t.id)).closure_pending).toBe(true);
  expect(await db.auditEvent.count({ where: { ticketId: t.id } })).toBe(events);
  const res = await send(2, `/api/customer/tickets/${t.id}/replies`, { body: 'At cutoff' });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('CUSTOMER_TIMEOUT');
  t = await detail(t.id);
  expect(t.status).toBe('CLOSED');
  expect(t.sla.resolution.state).toBe('CANCELLED');
  expect(await db.entry.count({ where: { ticketId: t.id } })).toBe(1);
  expect(
    (await send(2, `/api/customer/tickets/${t.id}/reopen`, { body: 'No' })).body.error.code,
  ).toBe('NEW_TICKET_REQUIRED');
  expect(
    await db.auditEvent.count({ where: { ticketId: t.id, eventType: 'TICKET_AUTO_CLOSED' } }),
  ).toBe(1);
});
test('T-CLOSE / T-JOB: delayed processing, concurrent sweeps, credentials and just-before reply', async () => {
  setTime('2026-11-23T09:30');
  let a = await claimed(),
    b = await claimed();
  a = await action(a, 'replies', { body: 'Question', action: 'wait' });
  b = await action(b, 'replies', { body: 'Question', action: 'wait' });
  now = new Date(new Date(a.auto_close_due_at).getTime() - 1);
  expect(
    (await send(2, `/api/customer/tickets/${a.id}/replies`, { body: 'Before cutoff' })).status,
  ).toBe(200);
  now = new Date(new Date(b.auto_close_due_at).getTime() + HOUR);
  expect((await agents[0].post('/api/internal/maintenance').send({})).status).toBe(401);
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(app)
        .post('/api/internal/maintenance')
        .set('Authorization', 'Bearer ' + testConfig.JOB_TOKEN)
        .send({}),
    ),
  );
  expect(responses.every((r) => r.status === 200)).toBe(true);
  // A reusable isolated DB can contain earlier performance fixtures. A bounded
  // sweep is not a promise that this particular ticket is in its first page.
  for (let batch = 0; batch < 100; batch++) {
    if ((await detail(b.id)).status === 'CLOSED') break;
    const more = await service.maintenance();
    expect(more.errors).toBe(0);
    if (!more.has_more) break;
  }
  expect((await detail(a.id)).status).toBe('IN_PROGRESS');
  expect((await detail(b.id)).status).toBe('CLOSED');
  const e = await db.auditEvent.findFirst({
    where: { ticketId: b.id, eventType: 'TICKET_AUTO_CLOSED' },
  });
  expect(e.effectiveAt).toEqual(new Date(b.auto_close_due_at));
  expect(e.occurredAt).toEqual(now);
  expect(
    await db.auditEvent.count({ where: { ticketId: b.id, eventType: 'TICKET_AUTO_CLOSED' } }),
  ).toBe(1);
}, 120000);
test('T-CONTRACT / T-QUERY / T-LIFECYCLE: invalid commands, filters and bounded private reads', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed();
  for (const body of [
    { expected_version: '2', body: 'x' },
    { expected_version: 2, body: 'x', kind: 'PUBLIC_REPLY' },
    { expected_version: 2, body: ' ' },
  ])
    expect((await send(0, `/api/agent/tickets/${t.id}/notes`, body)).status).toBe(400);
  expect(
    (await send(0, `/api/agent/tickets/${t.id}/notes`, { expected_version: 1, body: 'stale' })).body
      .error.code,
  ).toBe('STALE_VERSION');
  expect(
    (
      await send(0, `/api/agent/tickets/${t.id}/priority`, {
        expected_version: t.version,
        priority: 'MEDIUM',
        reason: 'unchanged',
      })
    ).body.error.code,
  ).toBe('NO_CHANGE');
  expect((await agents[0].get('/api/agent/tickets?page_size=101')).status).toBe(400);
  const mine = await agents[0].get('/api/agent/tickets?scope=mine&status=active&page_size=1');
  expect(mine.status, JSON.stringify(mine.body)).toBe(200);
  expect(mine.body.data).toHaveLength(1);
  expect(mine.body.data[0].assignee.id).toBe(accounts[0].id);
  const none = await agents[0].get('/api/agent/tickets?scope=unassigned&status=RESOLVED');
  expect(none.body.data).toEqual([]);
  expect(
    (await agents[0].get(`/api/agent/tickets/${t.id}/audit?after_id=9223372036854775808`)).status,
  ).toBe(400);
  expect((await agents[0].get(`/api/agent/tickets/${t.id}/entries?cursor=invalid`)).status).toBe(
    400,
  );
  expect((await agents[0].get('/api/unknown')).status).toBe(404);
  const record = await db.ticket.findUnique({ where: { id: t.id } });
  expect(slaProjection(record, now).resolution.state).toBe('PENDING');
});
test('T-SLA11/13: zero allowance resumes due immediately; repeated pauses count each segment once', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed('LOW');
  setTime('2026-11-23T18:30');
  t = await action(t, 'replies', { body: 'Question at closing', action: 'wait' });
  t = await action(t, 'priority', {
    priority: 'HIGH',
    reason: 'Original nine-hour allowance exhausted',
  });
  expect(t.sla.resolution.remaining_seconds).toBe(0);
  expect(t.sla.resolution.ever_breached).toBe(false);
  setTime('2026-11-24T10:30');
  expect((await send(2, `/api/customer/tickets/${t.id}/replies`, { body: 'Answer' })).status).toBe(
    200,
  );
  t = await detail(t.id);
  expect(t.sla.resolution.due_at).toBe(now.toISOString());
  expect(t.sla.resolution.state).toBe('PENDING');
  now = new Date(now.getTime() + 1);
  expect((await detail(t.id)).sla.resolution.state).toBe('OVERDUE');
  setTime('2026-11-23T09:30');
  let repeated = await claimed();
  setTime('2026-11-23T10:30');
  repeated = await action(repeated, 'replies', { body: 'First question', action: 'wait' });
  setTime('2026-11-24T09:30');
  await send(2, `/api/customer/tickets/${repeated.id}/replies`, { body: 'Answer one' });
  repeated = await detail(repeated.id);
  setTime('2026-11-24T11:30');
  repeated = await action(repeated, 'replies', { body: 'Second question', action: 'wait' });
  expect(repeated.sla.resolution.remaining_seconds).toBe(24 * 3600);
  setTime('2026-11-25T09:30');
  await send(2, `/api/customer/tickets/${repeated.id}/replies`, { body: 'Answer two' });
  repeated = await detail(repeated.id);
  setTime('2026-11-25T10:30');
  repeated = await action(repeated, 'replies', { body: 'Done', action: 'resolve' });
  expect(repeated.sla.resolution.remaining_seconds).toBe(23 * 3600);
});
test('T-SLA14 / T-CLOSE: stored holiday snapshot survives service configuration changes', async () => {
  setTime('2026-11-23T09:30');
  const synthetic = createTicketService({ db, clock, calendar: makeCalendar(['2026-11-26']) });
  let result = await synthetic.create(accounts[2], {
    subject: '[TEST] Synthetic holiday',
    description: 'Holiday fixture',
    priority: 'MEDIUM',
  });
  result = await synthetic.command(result.ticket.id, accounts[0], 'claim', { expected_version: 1 });
  setTime('2026-11-23T11:30');
  result = await synthetic.command(result.ticket.id, accounts[0], 'replies', {
    expected_version: result.ticket.version,
    body: 'Need information',
    action: 'wait',
  });
  expect(result.ticket.autoCloseDueAt).toEqual(at('2026-12-01T11:30'));
  setTime('2026-11-25T10:30');
  const resumed = await service.command(result.ticket.id, accounts[2], 'customerReply', {
    body: 'Answer through differently configured service',
  });
  expect(resumed.ticket.calendarSnapshot.holidays).toEqual(['2026-11-26']);
  expect(resumed.ticket.resolutionDueAt).toEqual(at('2026-11-30T17:30'));
});
test('T-LIFECYCLE: remaining forbidden transitions and owner-only terminal notes', async () => {
  setTime('2026-11-23T09:30');
  const open = await create();
  expect(
    (
      await send(0, `/api/agent/tickets/${open.id}/replies`, {
        expected_version: 1,
        body: 'Unclaimed',
        action: 'reply',
      })
    ).status,
  ).toBe(403);
  expect(
    (await send(2, `/api/customer/tickets/${open.id}/reopen`, { body: 'Not resolved' })).status,
  ).toBe(409);
  expect(
    (await send(2, `/api/customer/tickets/${open.id}/replies`, { body: 'Extra information' }))
      .status,
  ).toBe(200);
  let t = await action({ ...open, version: 2 }, 'claim');
  t = await action(t, 'replies', { body: 'Resolved', action: 'resolve' });
  for (const [route, body] of [
    ['replies', { body: 'No terminal public reply', action: 'reply' }],
    ['priority', { priority: 'HIGH', reason: 'Terminal' }],
  ])
    expect(
      (
        await send(0, `/api/agent/tickets/${t.id}/${route}`, {
          expected_version: t.version,
          ...body,
        })
      ).status,
    ).toBe(409);
  expect(
    (
      await send(1, `/api/agent/tickets/${t.id}/notes`, {
        expected_version: t.version,
        body: 'Nonowner',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(agents[0], tokens[0], `/api/agent/tickets/${t.id}/reopen`, {
        body: 'Agent cannot reopen',
      })
    ).status,
  ).toBe(405);
  expect(
    (
      await agents[0]
        .patch(`/api/agent/tickets/${t.id}`)
        .set('Origin', testConfig.APP_ORIGIN)
        .set('X-CSRF-Token', tokens[0])
        .send({ status: 'OPEN' })
    ).status,
  ).toBe(405);
  expect(
    (
      await agents[0]
        .delete(`/api/agent/tickets/${t.id}/entries`)
        .set('Origin', testConfig.APP_ORIGIN)
        .set('X-CSRF-Token', tokens[0])
        .send({})
    ).status,
  ).toBe(405);
});
test('T-QUERY: stable public-only cursors and immutable history pagination', async () => {
  setTime('2026-11-23T09:30');
  let t = await claimed();
  for (let i = 0; i < 3; i++) {
    t = await action(t, 'replies', { body: 'Public ' + i, action: 'reply' });
    t = await action(t, 'notes', { body: 'Private ' + i });
  }
  let cursor = null;
  const ids = [];
  do {
    const response = await agents[2].get(
      `/api/customer/tickets/${t.id}/entries?limit=1${cursor ? '&cursor=' + cursor : ''}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].body).toMatch(/^Public/);
    ids.push(response.body.data[0].id);
    cursor = response.body.pagination.next_cursor;
  } while (cursor);
  expect(new Set(ids).size).toBe(3);
  const first = await agents[0].get(`/api/agent/tickets/${t.id}/audit?limit=1`);
  const next = await agents[0].get(
    `/api/agent/tickets/${t.id}/audit?limit=1&after_id=${first.body.pagination.next_after_id}`,
  );
  expect(BigInt(next.body.data[0].id)).toBeGreaterThan(BigInt(first.body.data[0].id));
});
test('T-JOB: more than 100 due candidates are processed in bounded batches', async () => {
  setTime('2026-11-23T09:30');
  const isolated = await owner.user.create({
    data: {
      username: crypto.randomUUID(),
      displayName: 'Batch fixture customer',
      passwordHash: accounts[2].passwordHash,
      role: 'CUSTOMER',
    },
  });
  const ids = [];
  for (let i = 0; i < 101; i++) {
    const result = await service.create(isolated, {
      subject: '[TEST] Batch ' + i,
      description: 'Batch fixture',
      priority: 'HIGH',
    });
    ids.push(result.ticket.id);
  }
  setTime('2026-11-23T12:30');
  const first = await service.maintenance();
  expect(first.processed).toBeLessThanOrEqual(100);
  expect(first.has_more).toBe(true);
  for (let i = 0; i < 10; i++) {
    const result = await service.maintenance();
    expect(result.errors).toBe(0);
    if (!result.has_more) break;
  }
  expect(
    await db.ticket.count({ where: { id: { in: ids }, firstResponseBreachedAt: { not: null } } }),
  ).toBe(101);
}, 30000);
