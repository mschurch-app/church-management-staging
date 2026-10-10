import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from './backend-fixture.mjs';
const subject='U'+'a'.repeat(32),otherSubject='U'+'b'.repeat(32);

test('Actual me contract identifies participant with line_subject, not an invented id',async()=>{
  const result=await fixture().call('me');assert.equal(result.status,200);
  assert.equal(result.participant.line_subject,subject);assert.equal(result.participant.id,undefined);
  assert.ok(Array.isArray(result.notes));assert.ok(Array.isArray(result.records));
});
test('Journal save and me use actual date and return only the verified member notes',async()=>{
  const f=fixture({initialNotes:[{line_subject:otherSubject,reading_date:'2026-10-10',note:'Other fixture member'}]});
  await f.call('mark_read','2026-10-10');
  const saved=await f.call('journal_save','2026-10-10','isolated-token',{note:'Fixture journal'});
  assert.equal(saved.status,200);assert.equal(saved.note.note,'Fixture journal');
  const loaded=await f.call('me');assert.equal(loaded.notes.length,1);assert.equal(loaded.notes[0].note,'Fixture journal');
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].watered_at,null);
});

test('Yesterday (10/9) is recorded and watered through the real handler',async()=>{
  const f=fixture(),read=await f.call('mark_read','2026-10-09');
  assert.equal(read.status,200);assert.equal(read.completion_type,'makeup');
  assert.equal(read.records[0].reading_date,'2026-10-09');assert.equal(read.records[0].watered_at,null);
  const water=await f.call('water_tree','2026-10-09');assert.equal(water.status,200);assert.ok(water.records[0].watered_at);
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].line_subject,subject);
});
test('All seven makeup dates 10/3–10/9 can be recorded and watered',async()=>{
  const f=fixture();
  for(let day=3;day<=9;day++){
    const date='2026-10-'+String(day).padStart(2,'0');
    assert.equal((await f.call('mark_read',date)).status,200,date+' read');
    assert.equal((await f.call('water_tree',date)).status,200,date+' water');
  }
  assert.equal(f.rows.length,7);assert.ok(f.rows.every(row=>row.completion_type==='makeup'&&row.watered_at));
});
test('Today remains on time and can be watered',async()=>{
  const f=fixture();assert.equal((await f.call('mark_read','2026-10-10')).completion_type,'on_time');
  assert.equal((await f.call('water_tree','2026-10-10')).status,200);
});
for(const date of ['2026-10-02','2026-10-11','2026-09-30','bad-date'])test('Invalid/expired/future date '+date+' causes no writes',async()=>{
  const f=fixture();
  for(const action of ['mark_read','water_tree']){
    const result=await f.call(action,date);assert.equal(result.status,400);assert.equal(result.error,'date_not_allowed');
  }
  assert.equal(f.writes.length,0);
});
test('Participant start date remains enforced',async()=>{
  const f=fixture({start:'2026-10-05'});
  for(const action of ['mark_read','water_tree'])assert.equal((await f.call(action,'2026-10-04')).error,'date_not_allowed');
  assert.equal(f.writes.length,0);assert.equal((await f.call('mark_read','2026-10-05')).status,200);
});
test('Duplicate makeup read and water preserve completion and watering timestamps',async()=>{
  const original={line_subject:subject,reading_date:'2026-10-09',completion_type:'on_time',completed_at:'2026-10-09T01:00:00Z',watered_at:'2026-10-09T01:01:00Z'};
  const f=fixture({initial:[original]});
  assert.equal((await f.call('mark_read','2026-10-09')).status,200);
  assert.equal((await f.call('water_tree','2026-10-09')).status,200);
  assert.deepEqual(f.rows,[original]);
});
test('Watering cannot create an unread record or water another person',async()=>{
  const other={line_subject:otherSubject,reading_date:'2026-10-09',completion_type:'makeup',watered_at:null};
  const f=fixture({initial:[other]});assert.equal((await f.call('water_tree','2026-10-09')).error,'read_first');assert.deepEqual(f.rows,[other]);
});
test('Invalid LINE verification cannot read or write',async()=>{
  const f=fixture({authorized:false});
  for(const action of ['mark_read','water_tree'])assert.equal((await f.call(action,'2026-10-09')).status,401);
  assert.equal(f.writes.length,0);
});
test('Missing bearer token cannot write',async()=>{
  const f=fixture();assert.equal((await f.call('mark_read','2026-10-09','')).status,401);assert.equal(f.writes.length,0);
});
test('Unjoined LINE member cannot write',async()=>{
  const f=fixture({joined:false});assert.equal((await f.call('mark_read','2026-10-09')).error,'join_required');assert.equal(f.writes.length,0);
});
test('Database insert failure remains a failure, with no fabricated completion',async()=>{
  const f=fixture({failInsert:true}),result=await f.call('mark_read','2026-10-09');
  assert.equal(result.status,503);assert.equal(result.error,'unavailable');assert.equal(f.rows.length,0);
});
test('Database watering failure preserves unread-water state',async()=>{
  const f=fixture({failUpdate:true});await f.call('mark_read','2026-10-09');
  assert.equal((await f.call('water_tree','2026-10-09')).status,503);assert.equal(f.rows[0].watered_at,null);
});
