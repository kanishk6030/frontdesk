import { expect, test } from 'vitest';
import { DateTime } from 'luxon';
import {
  HOUR,
  makeCalendar,
  nextWork,
  addWork,
  workBetween,
  responseBudget,
  resolutionBudget,
  safeDuration,
} from '../src/calendar.js';
export const at = (s) => DateTime.fromISO(s, { zone: 'Asia/Kolkata' }).toJSDate();
const c = makeCalendar();
test.each([
  ['HIGH', '2026-11-23T09:30', '2026-11-23T11:30', '2026-11-23T18:30'],
  ['MEDIUM', '2026-11-23T09:30', '2026-11-23T14:00', '2026-11-25T18:30'],
  ['LOW', '2026-11-23T09:30', '2026-11-23T18:30', '2026-11-27T18:30'],
  ['HIGH', '2026-11-20T18:00', '2026-11-23T11:00', '2026-11-20T18:30'],
  ['MEDIUM', '2026-11-20T18:00', '2026-11-23T13:30', '2026-11-25T18:00'],
  ['LOW', '2026-11-20T18:00', '2026-11-23T18:00', '2026-11-27T18:00'],
  ['HIGH', '2026-11-20T18:30', '2026-11-23T11:30', '2026-11-23T18:30'],
])('T-SLA01/03 %s at %s', (priority, start, response, resolution) => {
  expect(addWork(at(start), responseBudget(priority), c)).toEqual(at(response));
  expect(addWork(at(start), resolutionBudget(priority, at(start), c), c)).toEqual(at(resolution));
});
test('T-SLA02/05: half-open hours and exact millisecond duration', () => {
  expect(nextWork(at('2026-11-23T09:29:59.999'), c)).toEqual(at('2026-11-23T09:30'));
  expect(resolutionBudget('HIGH', at('2026-11-23T18:29:59.999'), c)).toBe(1);
  expect(addWork(at('2026-11-20T18:30'), 0, c)).toEqual(at('2026-11-20T18:30'));
  expect(workBetween(at('2026-11-20T18:30'), at('2026-11-23T09:30'), c)).toBe(0);
  expect(workBetween(at('2026-11-23T09:30'), at('2026-11-23T09:30:00.001'), c)).toBe(1);
  expect(() => workBetween(at('2026-11-24'), at('2026-11-23'), c)).toThrow();
  for (const day of ['2026-11-21', '2026-11-22'])
    expect(nextWork(at(day), c)).toEqual(at('2026-11-23T09:30'));
});
test('T-SLA04/14: synthetic holidays normalize and snapshots remain separate', () => {
  const holiday = makeCalendar(['2026-11-23', '2026-11-23']);
  expect(holiday.holidays).toHaveLength(1);
  expect(addWork(at('2026-11-20T18:00'), 4.5 * HOUR, holiday)).toEqual(at('2026-11-24T13:30'));
  expect(addWork(at('2026-11-20T18:00'), 27 * HOUR, holiday)).toEqual(at('2026-11-26T18:00'));
  expect(c.holidays).toEqual([]);
  expect(() => makeCalendar(['2026-02-30'])).toThrow();
  expect(() => safeDuration(9007199254740992n)).toThrow();
});
test('T-CLOSE: working week cutoff includes partial days and holidays', () => {
  expect(addWork(at('2026-11-23T11:30'), 45 * HOUR, c)).toEqual(at('2026-11-30T11:30'));
  expect(addWork(at('2026-11-23T11:30'), 45 * HOUR, makeCalendar(['2026-11-26']))).toEqual(
    at('2026-12-01T11:30'),
  );
});
test('T-SLA04: consecutive holidays adjoining a weekend are excluded once', () => {
  expect(
    addWork(at('2026-11-20T18:00'), 4.5 * HOUR, makeCalendar(['2026-11-23', '2026-11-24'])),
  ).toEqual(at('2026-11-25T13:30'));
});
