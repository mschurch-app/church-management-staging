import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleError } from './calendar-policy.ts';

const taipei = value => Date.parse(value);

test('rest days are per staff, with no default rest day', () => {
  const start = taipei('2026-09-29T10:00:00+08:00'); // Tuesday
  const end = start + 60 * 60 * 1000;
  assert.equal(scheduleError(start, end, false, {}, 0), null);
  assert.equal(scheduleError(start, end, false, {restDays:[2]}, 0), 'rest_day');
  assert.equal(scheduleError(start, end, false, {restDays:[4]}, 0), null);
});

test('emergency bypass obeys each staff preference and still validates time', () => {
  const start = taipei('2026-09-29T10:00:00+08:00');
  const end = start + 60 * 60 * 1000;
  assert.equal(scheduleError(start, end, true, {restDays:[2]}, 0), null);
  assert.equal(scheduleError(start, end, true, {restDays:[2],allowEmergencyOverride:false}, 0), 'emergency_not_allowed');
  assert.equal(scheduleError(start, end, true, {restDays:[2]}, end + 1), 'meeting_in_past');
});

test('normal appointments enforce weekdays, hours and same-day boundaries', () => {
  const start = taipei('2026-09-26T16:30:00+08:00');
  assert.equal(scheduleError(start, start + 60*60*1000, false, {}, 0), 'outside_schedule');
  const sunday = taipei('2026-09-27T10:00:00+08:00');
  assert.equal(scheduleError(sunday, sunday + 30*60*1000, false, {}, 0), 'outside_schedule');
});
