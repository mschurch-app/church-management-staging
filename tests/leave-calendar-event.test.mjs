import test from 'node:test';
import assert from 'node:assert/strict';
import {leaveCalendarEvent,leaveEventId} from '../supabase/functions/_shared/leave-calendar.mjs';

const id='00000000-0000-4000-8000-000000000001';
test('approved full-day leave uses an exclusive end date and omits the private reason',()=>{
  const event=leaveCalendarEvent({id,start_date:'2026-11-01',end_date:'2026-11-03',period:'full_day',reason:'私人醫療資料'},'測試同工','代理同工');
  assert.equal(event.id,leaveEventId(id));
  assert.deepEqual(event.start,{date:'2026-11-01'});
  assert.deepEqual(event.end,{date:'2026-11-04'});
  assert.equal(event.transparency,'transparent');
  assert.equal(event.extendedProperties.private.mplusLeaveId,id);
  assert(!JSON.stringify(event).includes('私人醫療資料'));
});
test('multi-day half-day leave repeats only its selected half of each day',()=>{
  const event=leaveCalendarEvent({id,start_date:'2026-11-01',end_date:'2026-11-03',period:'morning'},'測試同工','代理同工');
  assert.equal(event.start.dateTime,'2026-11-01T09:00:00+08:00');
  assert.equal(event.end.dateTime,'2026-11-01T12:00:00+08:00');
  assert.deepEqual(event.recurrence,['RRULE:FREQ=DAILY;COUNT=3']);
});
