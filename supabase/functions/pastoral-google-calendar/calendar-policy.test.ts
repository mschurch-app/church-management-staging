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

test('all seven weekdays can be configured as each coworker’s rest day', () => {
  const days = [
    ['2026-09-27T10:00:00+08:00', 0], // Sunday
    ['2026-09-28T10:00:00+08:00', 1], // Monday
    ['2026-09-29T10:00:00+08:00', 2], // Tuesday
    ['2026-09-30T10:00:00+08:00', 3], // Wednesday
    ['2026-10-01T10:00:00+08:00', 4], // Thursday
    ['2026-10-02T10:00:00+08:00', 5], // Friday
    ['2026-10-03T10:00:00+08:00', 6], // Saturday
  ];
  for (const [value, weekday] of days) {
    const start = taipei(value);
    assert.equal(scheduleError(start, start + 30*60*1000, false, {restDays:[weekday]}, 0), 'rest_day');
    assert.equal(scheduleError(start, start + 30*60*1000, false, {restDays:[]}, 0) === 'rest_day', false);
  }
});

test('normal appointments enforce weekdays, hours and same-day boundaries', () => {
  const start = taipei('2026-09-26T16:30:00+08:00');
  assert.equal(scheduleError(start, start + 60*60*1000, false, {}, 0), 'outside_schedule');
  const sunday = taipei('2026-09-27T10:00:00+08:00');
  assert.equal(scheduleError(sunday, sunday + 30*60*1000, false, {}, 0), 'outside_schedule');
});
