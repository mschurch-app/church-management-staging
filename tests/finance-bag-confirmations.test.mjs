import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
async function setup(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create schema church_auth;create table church_auth.accounts(user_id uuid primary key,is_active boolean not null);create table church_auth.grants(user_id uuid,church_id text,permission text);create table church_auth.owners(user_id uuid primary key);create table public.members(id bigint primary key,church_id text,archived_at timestamptz);create function church_auth.canonical_account(uuid) returns uuid language sql immutable as 'select $1';`);
 await db.exec(await read('supabase/migrations/20261021054456_finance_cash_foundation.sql'));
 await db.exec(await read('supabase/migrations/20261021132134_cash_counter_confirmations.sql'));
 await db.exec(await read('supabase/migrations/20261021135307_cash_bag_auto_totals_and_confirmation.sql'));
 await db.exec(await read('supabase/migrations/20261023080455_finance_single_counter_confirmation.sql'));
 for(const id of ids){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into church_auth.accounts values($1,true)',[id]);await db.query("insert into church_auth.grants values($1,'M+','members')",[id]);}
 for(const id of ids.slice(0,3))await db.query("insert into public.finance_staff_roles(user_id,role_key,assigned_by) values($1,'entry',$1)",[id]);
 await db.query("insert into public.finance_staff_roles(user_id,role_key,assigned_by) values($1,'cash_verify',$1),($2,'approve',$2)",[ids[3],ids[4]]);
 return db;
}
const payload=()=>({offeringDate:'2026-10-18',counterUserIds:ids.slice(0,2),countedCash:999999,bags:[{bagName:'測試奉獻者',confirmed:true,declaredTotal:999999,lines:[{category:'十一奉獻',amount:1000},{category:'感恩奉獻',amount:500}]}]});
const save=async(db,state,data=payload())=>(await db.query('select public.finance_save_cash_batch($1,$2,$3,$4::jsonb) as result',[ids[0],state?.id||null,state?.version||null,JSON.stringify(data)])).rows[0].result;
const confirm=async(db,state,actor,checked=true)=>(await db.query('select public.finance_confirm_cash_batch($1,$2,$3,$4) as result',[actor,state.id,state.version,checked])).rows[0].result;
const move=async(db,state,actor,action,total=null,reason=null)=>(await db.query('select public.finance_transition_cash_batch($1,$2,$3,$4,$5,$6) as result',[actor,state.id,state.version,action,total,reason])).rows[0].result;

const saveAs=async(db,actor,state,data)=>(await db.query('select public.finance_save_cash_batch($1,$2,$3,$4::jsonb) as result',[actor,state?.id||null,state?.version||null,JSON.stringify(data)])).rows[0].result;
const getBag=async(db,s)=>(await db.query('select * from public.finance_cash_bags where batch_id=$1',[s.id])).rows[0];
test('one counter can submit; late second confirmation never changes review or booked status',async()=>{const db=await setup();try{
 const data=payload();data.counterConfirmed=true;let s=await save(db,null,data);let bag=await getBag(db,s);assert.equal(Number(bag.declared_total),1500);assert.equal(bag.confirmed_by,ids[0]);assert(bag.confirmed_at);
 const batch=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];assert.equal(Number(batch.counted_cash),1500);assert.equal(batch.counter_1_confirmed_by,ids[0]);assert.equal(batch.counter_2_confirmed_at,null);
 s=await move(db,s,ids[0],'submit');assert.equal(s.status,'spouse_review');
 const queue=(await db.query('select * from finance_cash_confirmation_notifications where batch_id=$1',[s.id])).rows;
 assert.equal(queue.length,1);assert.equal(queue[0].recipient_user_id,ids[1]);assert.equal(Number(queue[0].total),1500);assert.deepEqual(queue[0].category_totals,{'十一奉獻':1000,'感恩奉獻':500});
 await assert.rejects(confirm(db,s,ids[0],false),/batch_locked/);
 s=await move(db,s,ids[3],'verify_cash',1500);s=await move(db,s,ids[4],'approve');assert.equal(s.status,'booked');
 const before=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];
 s=await confirm(db,s,ids[1]);assert.equal(s.status,'booked');
 const after=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];
 assert.equal(after.counter_2_confirmed_by,ids[1]);assert.equal(after.pastor_approved_by,before.pastor_approved_by);assert.deepEqual(after.spouse_verified_cash,before.spouse_verified_cash);
 await assert.rejects(confirm(db,s,ids[1],false),/batch_locked/);
 await assert.rejects(save(db,s,data),/batch_locked/);
 assert.equal((await db.query('select count(*)::int n from finance_cash_confirmation_notifications where batch_id=$1',[s.id])).rows[0].n,1);
 assert.equal((await getBag(db,s)).confirmed_by,ids[0],'individual bag needs only one person');
 const event=(await db.query("select snapshot from finance_cash_events where batch_id=$1 and action='created'",[s.id])).rows[0].snapshot;assert.equal(event.bagConfirmations[0].confirmedBy,ids[0]);assert.equal(event.counterConfirmedBy,ids[0]);
}finally{await db.close();}});
test('unchecked bags can be drafts but cannot enter batch confirmation or review; no client impersonation',async()=>{const db=await setup();try{
 let data=payload();data.bags[0].confirmed=false;let s=await save(db,null,data);assert.equal((await getBag(db,s)).confirmed_at,null);await assert.rejects(confirm(db,s,ids[0]),/bag_confirmations_required/);
 data=payload();data.counterConfirmed=true;data.bags[0].confirmedBy=ids[1];data.bags[0].confirmedAt='2000-01-01';s=await saveAs(db,ids[0],s,data);assert.equal((await getBag(db,s)).confirmed_by,ids[0]);
 data=payload();data.counterConfirmed=true;await assert.rejects(saveAs(db,ids[2],s,data),/counter_confirmation_forbidden/);
}finally{await db.close();}});
test('unchanged bags preserve original confirmer; amount edits need fresh confirmation and recalculate totals',async()=>{const db=await setup();try{
 let data=payload();let s=await save(db,null,data);const first=await getBag(db,s);data.bags[0].id=first.id;s=await saveAs(db,ids[1],s,data);let bag=await getBag(db,s);assert.equal(bag.confirmed_by,ids[0]);assert.deepEqual(bag.confirmed_at,first.confirmed_at);
 data.bags[0].id=bag.id;data.bags[0].lines[0].amount=2000;data.bags[0].confirmed=false;s=await saveAs(db,ids[1],s,data);bag=await getBag(db,s);assert.equal(Number(bag.declared_total),2500);assert.equal(bag.confirmed_at,null);await assert.rejects(confirm(db,s,ids[1]),/bag_confirmations_required/);
 data.bags[0].id=bag.id;data.bags[0].confirmed=true;s=await saveAs(db,ids[1],s,data);bag=await getBag(db,s);assert.equal(bag.confirmed_by,ids[1]);assert.equal(Number(bag.declared_total),2500);
}finally{await db.close();}});
test('invalid or repeated bag references roll back; confirmation permissions remain server only',async()=>{const db=await setup();try{
 let s=await save(db);const bag=await getBag(db,s);const bad=payload();bad.bags[0].id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await assert.rejects(save(db,s,bad),/invalid_bag_confirmation/);
 const duplicate=payload();duplicate.bags[0].id=bag.id;duplicate.bags.push({...duplicate.bags[0]});await assert.rejects(save(db,s,duplicate),/invalid_bag_confirmation/);assert.equal((await getBag(db,s)).id,bag.id);
 await db.exec('set role authenticated');await assert.rejects(db.query('select public.finance_save_cash_batch($1,null,null,$2::jsonb)',[ids[0],JSON.stringify(payload())]),/permission denied/);await db.exec('reset role');
}finally{await db.close();}});

test('zero confirmations block; edits/return reset; either counter alone qualifies; both need no invitation',async()=>{const db=await setup();try{
 let s=await save(db);await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 s=await confirm(db,s,ids[1]);s=await move(db,s,ids[1],'submit');assert.equal(s.status,'spouse_review');
 s=await move(db,s,ids[3],'return',null,'需修正');await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 s=await confirm(db,s,ids[0]);s=await confirm(db,s,ids[1]);s=await move(db,s,ids[0],'submit');
 assert.equal((await db.query('select count(*)::int n from finance_cash_confirmation_notifications where batch_id=$1',[s.id])).rows[0].n,1,'second submission with both checked does not enqueue');
 s=await move(db,s,ids[3],'return',null,'重新核對');s=await confirm(db,s,ids[0]);s=await save(db,s);await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from finance_cash_confirmation_notifications'),/permission denied/);await db.exec('reset role');
}finally{await db.close();}});
