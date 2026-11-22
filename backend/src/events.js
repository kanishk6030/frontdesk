import { z } from 'zod';
import { priority, status, iso } from './contracts.js';
import { calendarSchema, safeDuration } from './calendar.js';
export const eventTypes = [
  'TICKET_CREATED',
  'TICKET_CLAIMED',
  'PUBLIC_REPLY_ADDED',
  'INTERNAL_NOTE_ADDED',
  'WAIT_STARTED',
  'WAIT_ENDED',
  'PRIORITY_CHANGED',
  'TICKET_RESOLVED',
  'TICKET_REOPENED',
  'TICKET_AUTO_CLOSED',
  'FIRST_RESPONSE_BREACHED',
  'RESOLUTION_BREACHED',
];
const clockState = z.strictObject({
  status,
  priority,
  assignee_id: z.uuid().nullable(),
  first_response_due_at: iso,
  first_response_at: iso.nullable(),
  resolution_budget_ms: z.number().int().positive(),
  resolution_consumed_ms: z.number().int().nonnegative(),
  resolution_running_since: iso.nullable(),
  resolution_due_at: iso.nullable(),
  wait_started_at: iso.nullable(),
  auto_close_due_at: iso.nullable(),
  resolved_at: iso.nullable(),
  reopen_until: iso.nullable(),
  closed_at: iso.nullable(),
  close_reason: z.literal('CUSTOMER_TIMEOUT').nullable(),
});
export const eventData = z.strictObject({
  before: clockState.nullable(),
  after: clockState,
  reason: z.string().max(500).optional(),
  calendar: calendarSchema.optional(),
  deadline: iso.nullable().optional(),
  remaining_ms: z.number().int().optional(),
  fixture: z.boolean().optional(),
});
export function snapshot(t) {
  const stamp = (v) => (v ? v.toISOString() : null);
  return clockState.parse({
    status: t.status,
    priority: t.priority,
    assignee_id: t.assigneeId,
    first_response_due_at: stamp(t.firstResponseDueAt),
    first_response_at: stamp(t.firstResponseAt),
    resolution_budget_ms: safeDuration(t.resolutionBudgetMs),
    resolution_consumed_ms: safeDuration(t.resolutionConsumedMs),
    resolution_running_since: stamp(t.resolutionRunningSince),
    resolution_due_at: stamp(t.resolutionDueAt),
    wait_started_at: stamp(t.waitStartedAt),
    auto_close_due_at: stamp(t.autoCloseDueAt),
    resolved_at: stamp(t.resolvedAt),
    reopen_until: stamp(t.reopenUntil),
    closed_at: stamp(t.closedAt),
    close_reason: t.closeReason,
  });
}
