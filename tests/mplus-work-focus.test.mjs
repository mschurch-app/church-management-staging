import test from 'node:test';import assert from 'node:assert/strict';
import {focusBuckets} from '../mplus-work-focus.mjs';
const today='2026-10-22';
test('personal queues never turn another staff assignment into my work',()=>{
 const rows=[{id:'mine',assignedToMe:true,status:'pending',dueAt:today+'T18:00:00+08:00'},{id:'other',workflow:'mplus_assignment',status:'pending',dueAt:'2026-10-21T18:00:00+08:00'},{id:'shared',sharedWithMe:true,status:'approved'},{id:'done',assignedToMe:true,status:'completed'},{id:'calendar',source:'calendar',start:today,end:'2026-10-23',status:'approved'}];
 const buckets=Object.fromEntries(focusBuckets(rows,today).map(b=>[b.key,b.items.map(t=>t.id)]));assert.deepEqual(buckets.pending,['mine']);assert.deepEqual(buckets.overdue,[]);assert.deepEqual(buckets.undated,['shared']);assert.deepEqual(new Set(buckets.today),new Set(['mine','calendar']));
});
test('completed and cancelled work disappears without suppressing undated open work',()=>{
 const rows=['completed','cancelled','draft','approved'].map(status=>({id:status,status,assignedToMe:true}));assert.deepEqual(focusBuckets(rows,today).find(b=>b.key==='undated').items.map(t=>t.id),['approved']);
});
