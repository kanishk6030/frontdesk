import { randomUUID } from 'node:crypto';
import { databaseTime } from './db.js';
import { DomainError, requireRule } from './errors.js';
import {
  HOUR,
  addWork,
  makeCalendar,
  responseBudget,
  resolutionBudget,
  responseOverdue,
  resolutionOverdue,
  remainingAt,
  checkpoint,
  resume,
  calendarSchema,
} from './calendar.js';
import { eventData, snapshot } from './events.js';
export const ticketInclude = { customer: true, assignee: true };
export const closurePending = (t, now) =>
  t.status === 'WAITING_CUSTOMER' && now >= t.autoCloseDueAt;
const clearWait = (t) => {
  t.waitStartedAt = null;
  t.autoCloseDueAt = null;
};
const persistedFields = [
  'assigneeId',
  'priority',
  'status',
  'version',
  'updatedAt',
  'firstResponseDueAt',
  'firstResponseAt',
  'firstResponseEntryId',
  'firstResponseBreachedAt',
  'resolutionBudgetMs',
  'resolutionConsumedMs',
  'resolutionRunningSince',
  'resolutionDueAt',
  'resolutionBreachedAt',
  'waitStartedAt',
  'autoCloseDueAt',
  'resolvedAt',
  'reopenUntil',
  'closedAt',
  'closeReason',
];
export function createTicketService({
  db,
  calendar = makeCalendar(),
  clock = databaseTime,
  beforeLock,
  beforeAudit,
  fixture = false,
}) {
  calendarSchema.parse(calendar);
  async function append(tx, t, actor, now, events) {
    if (beforeAudit) await beforeAudit();
    for (const event of events)
      await tx.auditEvent.create({
        data: {
          ticketId: t.id,
          actorId: event.system ? null : actor?.id || null,
          actorType: event.system ? 'SYSTEM' : actor?.role || 'SYSTEM',
          actorLabel: event.system ? 'SYSTEM' : actor?.displayName || 'SYSTEM',
          eventType: event.type,
          entryId: event.entryId || null,
          occurredAt: now,
          effectiveAt: event.effectiveAt || now,
          ticketVersion: t.version,
          data: eventData.parse({ ...event.data, ...(fixture ? { fixture: true } : {}) }),
        },
      });
  }
  async function create(actor, input) {
    requireRule(actor.role === 'CUSTOMER', 'FORBIDDEN', 403);
    return db.$transaction(async (tx) => {
      const now = await clock(tx),
        budget = resolutionBudget(input.priority, now, calendar);
      const t = await tx.ticket.create({
        data: {
          id: randomUUID(),
          customerId: actor.id,
          subject: input.subject,
          description: input.description,
          priority: input.priority,
          createdAt: now,
          updatedAt: now,
          calendarSnapshot: calendar,
          firstResponseDueAt: addWork(now, responseBudget(input.priority), calendar),
          resolutionBudgetMs: BigInt(budget),
          resolutionRunningSince: now,
          resolutionDueAt: addWork(now, budget, calendar),
        },
        include: ticketInclude,
      });
      await append(tx, t, actor, now, [
        { type: 'TICKET_CREATED', data: { before: null, after: snapshot(t), calendar } },
      ]);
      return { ticket: t, asOf: now };
    });
  }
  async function command(id, actor, kind, input = {}) {
    requireRule(
      ['claim', 'notes', 'replies', 'priority', 'customerReply', 'reopen', 'maintenance'].includes(
        kind,
      ),
      'INVALID_TRANSITION',
    );
    if (kind !== 'maintenance')
      requireRule(
        actor?.role === (['customerReply', 'reopen'].includes(kind) ? 'CUSTOMER' : 'AGENT'),
        'FORBIDDEN',
        403,
      );
    return db.$transaction(async (tx) => {
      if (beforeLock) await beforeLock(tx);
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '10s'`;
      const locked =
        kind === 'maintenance'
          ? await tx.$queryRaw`SELECT id FROM tickets WHERE id=${id}::uuid FOR UPDATE SKIP LOCKED`
          : await tx.$queryRaw`SELECT id FROM tickets WHERE id=${id}::uuid FOR UPDATE`;
      if (!locked.length) {
        if (kind === 'maintenance') return null;
        throw new DomainError(404, 'NOT_FOUND');
      }
      const t = await tx.ticket.findUnique({ where: { id }, include: ticketInclude });
      if (actor?.role === 'CUSTOMER') requireRule(t.customerId === actor.id, 'NOT_FOUND', 404);
      if (actor?.role === 'AGENT' && kind !== 'claim')
        requireRule(t.assigneeId === actor.id, 'FORBIDDEN', 403);
      const now = await clock(tx),
        before = snapshot(t),
        events = [];
      let entry = null;
      const event = (type, extra = {}) =>
        events.push({ type, ...extra, data: { before, after: snapshot(t), ...extra.data } });
      const observe = () => {
        if (!t.firstResponseBreachedAt && responseOverdue(t, now)) {
          t.firstResponseBreachedAt = now;
          event('FIRST_RESPONSE_BREACHED', {
            system: true,
            data: { deadline: t.firstResponseDueAt.toISOString() },
          });
        }
        if (!t.resolutionBreachedAt && resolutionOverdue(t, now)) {
          t.resolutionBreachedAt = now;
          event('RESOLUTION_BREACHED', {
            system: true,
            data: {
              deadline: t.resolutionDueAt?.toISOString() || null,
              remaining_ms: remainingAt(t, now),
            },
          });
        }
      };
      let timeout = false;
      if (closurePending(t, now)) {
        observe();
        const cutoff = t.autoCloseDueAt;
        t.status = 'CLOSED';
        t.closedAt = cutoff;
        t.closeReason = 'CUSTOMER_TIMEOUT';
        t.resolutionRunningSince = null;
        t.resolutionDueAt = null;
        clearWait(t);
        event('TICKET_AUTO_CLOSED', { system: true, effectiveAt: cutoff });
        timeout = true;
      } else if (kind === 'maintenance') {
        observe();
        if (!events.length) return { ticket: t, asOf: now, changed: false };
      } else {
        if (kind === 'claim' && t.assigneeId) {
          requireRule(t.assigneeId === actor.id, 'ALREADY_CLAIMED');
          return { ticket: t, asOf: now, changed: false };
        }
        if (actor.role === 'AGENT')
          requireRule(t.version === input.expected_version, 'STALE_VERSION');
        if (kind === 'claim') requireRule(t.status === 'OPEN');
        if (kind === 'notes')
          requireRule(['IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'].includes(t.status));
        if (kind === 'replies')
          requireRule(
            input.action === 'wait'
              ? t.status === 'IN_PROGRESS'
              : ['IN_PROGRESS', 'WAITING_CUSTOMER'].includes(t.status),
          );
        if (kind === 'priority') {
          requireRule(['IN_PROGRESS', 'WAITING_CUSTOMER'].includes(t.status));
          requireRule(t.priority !== input.priority, 'NO_CHANGE');
        }
        if (kind === 'customerReply') {
          requireRule(t.status !== 'RESOLVED', 'REOPEN_REQUIRED');
          requireRule(t.status !== 'CLOSED', 'NEW_TICKET_REQUIRED');
        }
        if (kind === 'reopen') {
          requireRule(t.status !== 'CLOSED', 'NEW_TICKET_REQUIRED');
          requireRule(t.status === 'RESOLVED');
          requireRule(now <= t.reopenUntil, 'REOPEN_WINDOW_EXPIRED');
        }
        observe();
        if (['notes', 'replies', 'customerReply', 'reopen'].includes(kind)) {
          entry = await tx.entry.create({
            data: {
              ticketId: id,
              authorId: actor.id,
              authorRole: actor.role,
              authorLabel: actor.displayName,
              kind: kind === 'notes' ? 'INTERNAL_NOTE' : 'PUBLIC_REPLY',
              body: input.body,
              createdAt: now,
            },
          });
          if (kind === 'replies' && !t.firstResponseAt) {
            t.firstResponseAt = now;
            t.firstResponseEntryId = entry.id;
          }
          event(kind === 'notes' ? 'INTERNAL_NOTE_ADDED' : 'PUBLIC_REPLY_ADDED', {
            entryId: entry.id,
          });
        }
        if (kind === 'claim') {
          t.assigneeId = actor.id;
          t.status = 'IN_PROGRESS';
          event('TICKET_CLAIMED');
        }
        if (kind === 'replies' && input.action === 'wait') {
          checkpoint(t, now, true);
          t.resolutionDueAt = null;
          t.status = 'WAITING_CUSTOMER';
          t.waitStartedAt = now;
          t.autoCloseDueAt = addWork(now, 45 * HOUR, t.calendarSnapshot);
          event('WAIT_STARTED', { entryId: entry.id });
        }
        if (kind === 'customerReply' && t.status === 'WAITING_CUSTOMER') {
          t.status = 'IN_PROGRESS';
          clearWait(t);
          resume(t, now);
          observe();
          event('WAIT_ENDED', { entryId: entry.id });
        }
        if (kind === 'replies' && input.action === 'resolve') {
          checkpoint(t, now, true);
          clearWait(t);
          t.status = 'RESOLVED';
          t.resolvedAt = now;
          t.reopenUntil = new Date(now.getTime() + 168 * HOUR);
          event('TICKET_RESOLVED', { entryId: entry.id });
        }
        if (kind === 'reopen') {
          t.status = 'IN_PROGRESS';
          t.resolvedAt = null;
          t.reopenUntil = null;
          resume(t, now);
          observe();
          event('TICKET_REOPENED', { entryId: entry.id });
        }
        if (kind === 'priority') {
          if (t.resolutionRunningSince) checkpoint(t, now);
          t.priority = input.priority;
          t.resolutionBudgetMs = BigInt(
            resolutionBudget(t.priority, t.createdAt, t.calendarSnapshot),
          );
          if (!t.firstResponseAt)
            t.firstResponseDueAt = addWork(
              t.createdAt,
              responseBudget(t.priority),
              t.calendarSnapshot,
            );
          if (t.resolutionRunningSince) resume(t, now);
          observe();
          event('PRIORITY_CHANGED', { data: { reason: input.reason } });
        }
      }
      t.version++;
      t.updatedAt = now;
      const saved = await tx.ticket.update({
        where: { id },
        data: Object.fromEntries(persistedFields.map((k) => [k, t[k]])),
        include: ticketInclude,
      });
      await append(tx, saved, actor, now, events);
      return {
        ticket: saved,
        entry,
        asOf: now,
        changed: true,
        breaches: events.filter((e) => e.type.endsWith('_BREACHED')).length,
        closed: timeout,
        error: timeout && kind !== 'maintenance' ? new DomainError(409, 'CUSTOMER_TIMEOUT') : null,
      };
    });
  }
  async function maintenance() {
    const now = await clock(db);
    const candidates =
      await db.$queryRaw`SELECT id FROM tickets WHERE (status='WAITING_CUSTOMER' AND auto_close_due_at<=${now}) OR (first_response_at IS NULL AND first_response_breached_at IS NULL AND first_response_due_at<${now}) OR (resolution_breached_at IS NULL AND ((resolution_running_since IS NOT NULL AND resolution_due_at<${now}) OR (status='WAITING_CUSTOMER' AND resolution_consumed_ms>resolution_budget_ms))) ORDER BY created_at,id LIMIT 101`;
    const result = {
      processed: 0,
      closed: 0,
      breaches_recorded: 0,
      errors: 0,
      has_more: candidates.length > 100,
      as_of: now.toISOString(),
    };
    for (const { id } of candidates.slice(0, 100)) {
      try {
        const item = await command(id, null, 'maintenance');
        if (!item) {
          result.has_more = true;
          continue;
        }
        result.processed++;
        result.closed += item.closed ? 1 : 0;
        result.breaches_recorded += item.breaches || 0;
      } catch {
        result.errors++;
      }
    }
    return result;
  }
  return { create, command, maintenance };
}
