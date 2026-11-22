import { DateTime } from 'luxon';
import { z } from 'zod';
export const HOUR = 3600000;
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = DateTime.fromISO(v, { zone: 'Asia/Kolkata' });
    return d.isValid && d.toISODate() === v;
  });
export const calendarSchema = z.strictObject({
  policy_version: z.literal('v1'),
  timezone: z.literal('Asia/Kolkata'),
  working_weekdays: z.tuple([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  opens_at: z.literal('09:30:00'),
  closes_at: z.literal('18:30:00'),
  holidays: z.array(localDate),
});
export function makeCalendar(holidays = []) {
  return calendarSchema.parse({
    policy_version: 'v1',
    timezone: 'Asia/Kolkata',
    working_weekdays: [1, 2, 3, 4, 5],
    opens_at: '09:30:00',
    closes_at: '18:30:00',
    holidays: [...new Set(z.array(localDate).parse(holidays))].sort(),
  });
}
const instant = (t) => {
  const value = new Date(t);
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid instant');
  return value;
};
const local = (t, c) => DateTime.fromJSDate(instant(t), { zone: c.timezone });
const isWorking = (d, c) =>
  c.working_weekdays.includes(d.weekday) && !c.holidays.includes(d.toISODate());
const open = (d) => d.startOf('day').set({ hour: 9, minute: 30 });
const close = (d) => d.startOf('day').set({ hour: 18, minute: 30 });
export function nextWork(t, c) {
  let d = local(t, c);
  for (let i = 0; i < 36600; i++) {
    if (isWorking(d, c) && d < close(d)) return (d < open(d) ? open(d) : d).toJSDate();
    d = open(d.plus({ days: 1 }));
  }
  throw new Error('Calendar horizon exceeded');
}
export function addWork(t, duration, c) {
  if (!Number.isSafeInteger(duration) || duration < 0) throw new Error('Invalid working duration');
  if (duration === 0) return instant(t);
  let remaining = duration,
    d = local(nextWork(t, c), c);
  for (let i = 0; i < 36600; i++) {
    const available = close(d).toMillis() - d.toMillis();
    if (remaining <= available) return new Date(d.toMillis() + remaining);
    remaining -= available;
    d = local(nextWork(close(d).toJSDate(), c), c);
  }
  throw new Error('Calendar horizon exceeded');
}
export function workBetween(a, b, c) {
  const start = instant(a),
    end = instant(b);
  if (end < start) throw new Error('Reversed interval');
  let d = local(start, c),
    total = 0;
  for (let i = 0; d.toMillis() < end.getTime() && i < 36600; i++) {
    if (isWorking(d, c))
      total += Math.max(
        0,
        Math.min(close(d).toMillis(), end.getTime()) - Math.max(open(d).toMillis(), d.toMillis()),
      );
    d = d.plus({ days: 1 }).startOf('day');
  }
  if (d.toMillis() < end.getTime()) throw new Error('Calendar horizon exceeded');
  return total;
}
export const responseBudget = (priority) => ({ HIGH: 2, MEDIUM: 4.5, LOW: 9 })[priority] * HOUR;
export function resolutionBudget(priority, created, c) {
  if (priority === 'MEDIUM') return 27 * HOUR;
  if (priority === 'LOW') return 45 * HOUR;
  const effective = local(nextWork(created, c), c);
  return close(effective).toMillis() - effective.toMillis();
}
export function safeDuration(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Unsafe duration');
  return n;
}
export const consumedAt = (t, now) =>
  safeDuration(t.resolutionConsumedMs) +
  (t.resolutionRunningSince ? workBetween(t.resolutionRunningSince, now, t.calendarSnapshot) : 0);
export const remainingAt = (t, now) => safeDuration(t.resolutionBudgetMs) - consumedAt(t, now);
export const responseOverdue = (t, now) => !t.firstResponseAt && now > t.firstResponseDueAt;
export const resolutionOverdue = (t, now) =>
  !['RESOLVED', 'CLOSED'].includes(t.status) &&
  (remainingAt(t, now) < 0 || Boolean(t.resolutionRunningSince && now > t.resolutionDueAt));
export function checkpoint(t, now, stop = false) {
  t.resolutionConsumedMs = BigInt(consumedAt(t, now));
  t.resolutionRunningSince = stop ? null : now;
}
export function resume(t, now) {
  t.resolutionRunningSince = now;
  t.resolutionDueAt = addWork(
    now,
    Math.max(0, safeDuration(t.resolutionBudgetMs) - safeDuration(t.resolutionConsumedMs)),
    t.calendarSnapshot,
  );
}
export function slaProjection(t, now) {
  const c = t.calendarSnapshot,
    evaluated = t.firstResponseAt || now;
  const frRemaining =
    evaluated <= t.firstResponseDueAt
      ? workBetween(evaluated, t.firstResponseDueAt, c)
      : -workBetween(t.firstResponseDueAt, evaluated, c);
  const frMiss = Boolean(
    t.firstResponseBreachedAt ||
      (t.firstResponseAt ? t.firstResponseAt > t.firstResponseDueAt : responseOverdue(t, now)),
  );
  const resMiss = Boolean(t.resolutionBreachedAt || resolutionOverdue(t, now));
  const iso = (v) => (v ? v.toISOString() : null);
  const state =
    t.status === 'CLOSED'
      ? 'CANCELLED'
      : t.status === 'RESOLVED'
        ? resMiss
          ? 'MISSED'
          : 'MET'
        : t.status === 'WAITING_CUSTOMER'
          ? 'PAUSED'
          : resolutionOverdue(t, now)
            ? 'OVERDUE'
            : 'PENDING';
  return {
    as_of: now.toISOString(),
    timezone: c.timezone,
    first_response: {
      state: t.firstResponseAt
        ? frMiss
          ? 'MISSED'
          : 'MET'
        : responseOverdue(t, now)
          ? 'OVERDUE'
          : 'PENDING',
      due_at: iso(t.firstResponseDueAt),
      completed_at: iso(t.firstResponseAt),
      remaining_seconds: frRemaining / 1000,
      ever_breached: frMiss,
    },
    resolution: {
      state,
      due_at: iso(t.resolutionDueAt),
      completed_at: iso(t.resolvedAt),
      remaining_seconds: remainingAt(t, now) / 1000,
      ever_breached: resMiss,
    },
  };
}
