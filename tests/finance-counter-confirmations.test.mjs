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
 for(const id of ids){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into church_auth.accounts values($1,true)',[id]);await db.query("insert into church_auth.grants values($1,'M+','members')",[id]);}
 for(const id of ids.slice(0,3))await db.query("insert into public.finance_staff_roles(user_id,role_key,assigned_by) values($1,'entry',$1)",[id]);
 await db.query("insert into public.finance_staff_roles(user_id,role_key,assigned_by) values($1,'cash_verify',$1),($2,'approve',$2)",[ids[3],ids[4]]);
 return db;
}
const payload=()=>({offeringDate:'2026-10-18',counterUserIds:ids.slice(0,2),countedCash:999999,bags:[{bagName:'測試奉獻者',declaredTotal:1500,lines:[{category:'十一奉獻',amount:1000},{category:'感恩奉獻',amount:500}]}]});
const save=async(db,state,data=payload())=>(await db.query('select public.finance_save_cash_batch($1,$2,$3,$4::jsonb) as result',[ids[0],state?.id||null,state?.version||null,JSON.stringify(data)])).rows[0].result;
const confirm=async(db,state,actor,checked=true)=>(await db.query('select public.finance_confirm_cash_batch($1,$2,$3,$4) as result',[actor,state.id,state.version,checked])).rows[0].result;
const move=async(db,state,actor,action,total=null,reason=null)=>(await db.query('select public.finance_transition_cash_batch($1,$2,$3,$4,$5,$6) as result',[actor,state.id,state.version,action,total,reason])).rows[0].result;
test('auto total, personal confirmations, stale versions, and full review progression',async()=>{const db=await setup();try{
 let s=await save(db);let row=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];assert.equal(Number(row.counted_cash),1500);assert.equal(Number(row.entered_total),1500);
 await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 await assert.rejects(confirm(db,s,ids[2]),/counter_confirmation_forbidden/);
 await assert.rejects(confirm(db,s,ids[3]),/forbidden/);
 const old=s;s=await confirm(db,s,ids[0]);await assert.rejects(confirm(db,old,ids[1]),/version_conflict/);
 await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 s=await confirm(db,s,ids[1]);row=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];assert.equal(row.counter_1_confirmed_by,ids[0]);assert.equal(row.counter_2_confirmed_by,ids[1]);assert(row.counter_1_confirmed_at&&row.counter_2_confirmed_at);
 s=await move(db,s,ids[0],'submit');assert.equal(s.status,'spouse_review');await assert.rejects(confirm(db,s,ids[0]),/batch_locked/);
 s=await move(db,s,ids[3],'verify_cash',1500);s=await move(db,s,ids[4],'approve');assert.equal(s.status,'booked');
 const events=(await db.query('select action from finance_cash_events where batch_id=$1 order by version',[s.id])).rows.map(x=>x.action);assert.deepEqual(events,['created','counter_confirmed','counter_confirmed','submitted','cash_verified','approved']);
}finally{await db.close();}});
test('editing and returning invalidate both confirmations; unchecking blocks submission',async()=>{const db=await setup();try{
 let s=await save(db);s=await confirm(db,s,ids[0]);s=await confirm(db,s,ids[1]);s=await confirm(db,s,ids[1],false);await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 s=await confirm(db,s,ids[1]);const data=payload();data.bags[0].lines[0].amount=2000;data.bags[0].declaredTotal=2500;s=await save(db,s,data);
 const row=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];assert.equal(row.counter_1_confirmed_at,null);assert.equal(row.counter_2_confirmed_at,null);assert.equal(Number(row.counted_cash),2500);await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 s=await confirm(db,s,ids[0]);s=await confirm(db,s,ids[1]);s=await move(db,s,ids[0],'submit');s=await move(db,s,ids[3],'return',null,'請重新核對');await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
}finally{await db.close();}});
test('spoofed client confirmation fields ignored, failed edits roll back, RPC and RLS remain restricted',async()=>{const db=await setup();try{
 const data=payload();data.counter_1_confirmed_by=ids[0];data.counter_2_confirmed_by=ids[1];let s=await save(db,null,data);await assert.rejects(move(db,s,ids[0],'submit'),/counter_confirmations_required/);
 s=await confirm(db,s,ids[0]);s=await confirm(db,s,ids[1]);const bad=payload();bad.bags[0].declaredTotal=1;await assert.rejects(save(db,s,bad),/bag_total_mismatch/);
 const row=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];assert.equal(row.version,s.version);assert(row.counter_1_confirmed_at&&row.counter_2_confirmed_at);
 await db.exec('set role authenticated');await assert.rejects(db.query('select public.finance_confirm_cash_batch($1,$2,$3,true)',[ids[0],s.id,s.version]),/permission denied/);await db.exec('reset role');
 const policies=(await db.query("select relrowsecurity from pg_class where oid='public.finance_cash_batches'::regclass")).rows;assert.equal(policies[0].relrowsecurity,true);
}finally{await db.close();}});
