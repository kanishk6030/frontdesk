import { z } from 'zod';
import { uuid, priority, status, version, iso, auditId } from './contracts.js';
import { calendarSchema, slaProjection } from './calendar.js';
import { closurePending } from './tickets.js';
import { eventData, eventTypes } from './events.js';
const stamp = (v) => (v ? v.toISOString() : null);
const person = z.strictObject({ id: uuid, display_name: z.string() });
const base = { id: uuid, subject: z.string(), priority, status, created_at: iso };
export const publicSummary = z.strictObject(base);
const endFields = {
  auto_close_due_at: iso.nullable(),
  closure_pending: z.boolean(),
  resolved_at: iso.nullable(),
  reopen_until: iso.nullable(),
  closed_at: iso.nullable(),
  close_reason: z.literal('CUSTOMER_TIMEOUT').nullable(),
};
export const publicDetail = publicSummary.extend({
  description: z.string(),
  ...endFields,
  can_reply: z.boolean(),
  can_reopen: z.boolean(),
});
const metric = z.strictObject({
  state: z.enum(['PENDING', 'OVERDUE', 'PAUSED', 'MET', 'MISSED', 'CANCELLED']),
  due_at: iso.nullable(),
  completed_at: iso.nullable(),
  remaining_seconds: z.number(),
  ever_breached: z.boolean(),
});
export const staffSummary = publicSummary.extend({
  customer: person,
  assignee: person.nullable(),
  updated_at: iso,
  version,
  sla: z.strictObject({
    as_of: iso,
    timezone: z.literal('Asia/Kolkata'),
    first_response: metric,
    resolution: metric,
  }),
  wait_started_at: iso.nullable(),
  auto_close_due_at: iso.nullable(),
  closure_pending: z.boolean(),
});
export const staffDetail = staffSummary.extend({
  description: z.string(),
  ...endFields,
  calendar: calendarSchema,
  allowed_actions: z.array(z.enum(['claim', 'reply', 'wait', 'resolve', 'note', 'priority'])),
});
const entryShape = {
  id: uuid,
  author: z.strictObject({ display_name: z.string(), role: z.enum(['AGENT', 'CUSTOMER']) }),
  body: z.string(),
  created_at: iso,
};
export const publicEntry = z.strictObject(entryShape),
  staffEntry = publicEntry.extend({ kind: z.enum(['PUBLIC_REPLY', 'INTERNAL_NOTE']) });
export const auditSchema = z.strictObject({
  id: auditId,
  event_type: z.enum(eventTypes),
  actor: z.strictObject({
    display_name: z.string(),
    type: z.enum(['AGENT', 'CUSTOMER', 'SYSTEM']),
  }),
  entry_id: uuid.nullable(),
  occurred_at: iso,
  effective_at: iso,
  recorded_at: iso,
  ticket_version: version,
  data: eventData,
});
function output(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error('Response contract failed');
  return parsed.data;
}
export function ticketDTO(t, user, now, detail = true) {
  const result = {
    id: t.id,
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    created_at: stamp(t.createdAt),
  };
  const pending = closurePending(t, now);
  if (detail)
    Object.assign(result, {
      description: t.description,
      auto_close_due_at: stamp(t.autoCloseDueAt),
      closure_pending: pending,
      resolved_at: stamp(t.resolvedAt),
      reopen_until: stamp(t.reopenUntil),
      closed_at: stamp(t.closedAt),
      close_reason: t.closeReason,
    });
  if (user.role === 'CUSTOMER') {
    if (detail)
      Object.assign(result, {
        can_reply: !pending && ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'].includes(t.status),
        can_reopen: t.status === 'RESOLVED' && now <= t.reopenUntil,
      });
    return output(detail ? publicDetail : publicSummary, result);
  }
  Object.assign(result, {
    customer: { id: t.customer.id, display_name: t.customer.displayName },
    assignee: t.assignee ? { id: t.assignee.id, display_name: t.assignee.displayName } : null,
    updated_at: stamp(t.updatedAt),
    version: t.version,
    sla: slaProjection(t, now),
    wait_started_at: stamp(t.waitStartedAt),
    auto_close_due_at: stamp(t.autoCloseDueAt),
    closure_pending: pending,
  });
  if (detail) {
    let actions = [];
    if (!pending && t.status === 'OPEN') actions = ['claim'];
    if (!pending && t.assigneeId === user.id) {
      actions = ['note'];
      if (['IN_PROGRESS', 'WAITING_CUSTOMER'].includes(t.status))
        actions.push('reply', 'resolve', 'priority');
      if (t.status === 'IN_PROGRESS') actions.push('wait');
    }
    Object.assign(result, { calendar: t.calendarSnapshot, allowed_actions: actions });
  }
  return output(detail ? staffDetail : staffSummary, result);
}
export function entryDTO(e, staff) {
  if (!staff && e.kind !== 'PUBLIC_REPLY') throw new Error('Private entry projection refused');
  return output(staff ? staffEntry : publicEntry, {
    id: e.id,
    author: { display_name: e.authorLabel, role: e.authorRole },
    body: e.body,
    created_at: stamp(e.createdAt),
    ...(staff ? { kind: e.kind } : {}),
  });
}
export const auditDTO = (e) =>
  output(auditSchema, {
    id: e.id.toString(),
    event_type: e.eventType,
    actor: { display_name: e.actorLabel, type: e.actorType },
    entry_id: e.entryId,
    occurred_at: stamp(e.occurredAt),
    effective_at: stamp(e.effectiveAt),
    recorded_at: stamp(e.recordedAt),
    ticket_version: e.ticketVersion,
    data: e.data,
  });
