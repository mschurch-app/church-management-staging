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
 await db.exec(await read('supabase/migrations/20261023085637_offering_payment_methods.sql'));
 await db.exec(await read('supabase/migrations/20261023090601_children_sunday_offering.sql'));
 for(const id of ids){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into church_auth.accounts values($1,true)',[id]);await db.query("insert into church_auth.grants values($1,'M+','members')",[id]);}
 for(const id of ids.slice(0,3))await db.query("insert into public.finance_staff_roles(user_id,role_key,assigned_by) values($1,'entry',$1)",[id]);
 await db.query("insert into public.finance_staff_roles(user_id,role_key,assigned_by) values($1,'cash_verify',$1),($2,'approve',$2)",[ids[3],ids[4]]);
 return db;
}
const payload=()=>({supportsChildrenOffering:true,offeringDate:'2026-10-18',counterUserIds:ids.slice(0,2),countedCash:999999,bags:[{bagName:'測試奉獻者',confirmed:true,declaredTotal:999999,lines:[{category:'兒童主日學奉獻',amount:1000},{category:'感恩奉獻',amount:500}]}]});
const save=async(db,state,data=payload())=>(await db.query('select public.finance_save_cash_batch($1,$2,$3,$4::jsonb) as result',[ids[0],state?.id||null,state?.version||null,JSON.stringify(data)])).rows[0].result;
const confirm=async(db,state,actor,checked=true)=>(await db.query('select public.finance_confirm_cash_batch($1,$2,$3,$4) as result',[actor,state.id,state.version,checked])).rows[0].result;
const move=async(db,state,actor,action,total=null,reason=null)=>(await db.query('select public.finance_transition_cash_batch($1,$2,$3,$4,$5,$6) as result',[actor,state.id,state.version,action,total,reason])).rows[0].result;

const saveAs=async(db,actor,state,data)=>(await db.query('select public.finance_save_cash_batch($1,$2,$3,$4::jsonb) as result',[actor,state?.id||null,state?.version||null,JSON.stringify(data)])).rows[0].result;
const getBag=async(db,s)=>(await db.query('select * from public.finance_cash_bags where batch_id=$1',[s.id])).rows[0];
test('mixed methods persist names and optional codes, cash is isolated throughout full review',async()=>{const db=await setup();try{
 const data=payload();data.counterConfirmed=true;data.bags=[{...data.bags[0],paymentMethod:'cash'},{...data.bags[0],bagName:'轉帳姓名',paymentMethod:'transfer',reportedOfferingCode:'0098'},{...data.bags[0],bagName:'線上姓名',paymentMethod:'online'}];
 let s=await save(db,null,data);let row=(await db.query('select * from finance_cash_batches where id=$1',[s.id])).rows[0];assert.equal(Number(row.counted_cash),1500);assert.equal(Number(row.entered_total),4500);
 const bags=(await db.query('select * from finance_cash_bags where batch_id=$1 order by bag_no',[s.id])).rows;assert.deepEqual(bags.map(b=>b.payment_method),['cash','transfer','online']);assert.equal(bags[1].reported_offering_code,'0098');assert.equal(bags[1].member_id,null);assert.equal(bags[2].reported_offering_code,null);
 s=await move(db,s,ids[0],'submit');assert.equal((await db.query('select total from finance_cash_confirmation_notifications where batch_id=$1',[s.id])).rows[0].total,4500);s=await confirm(db,s,ids[1]);
 await assert.rejects(move(db,s,ids[3],'verify_cash',4500),/verified_cash_mismatch/);s=await move(db,s,ids[3],'verify_cash',1500);s=await move(db,s,ids[4],'approve');assert.equal(s.status,'booked');
}finally{await db.close();}});
test('electronic-only batch supports zero cash, return and edit keep method and audit history',async()=>{const db=await setup();try{
 const data=payload();data.counterConfirmed=true;data.bags[0].paymentMethod='online';let s=await save(db,null,data);assert.equal(Number((await db.query('select counted_cash from finance_cash_batches where id=$1',[s.id])).rows[0].counted_cash),0);s=await move(db,s,ids[0],'submit');s=await move(db,s,ids[3],'return',null,'確認入帳');
 await assert.rejects(save(db,s,payload()),/client_update_required/);s=await save(db,s,data);s=await move(db,s,ids[0],'submit');s=await move(db,s,ids[3],'verify_cash',0);s=await move(db,s,ids[4],'approve');assert.equal(s.status,'booked');assert((await db.query('select count(*)::integer n from finance_cash_events where batch_id=$1',[s.id])).rows[0].n>=7);
}finally{await db.close();}});
test('invalid method, malformed code and forged member roll back; direct RPC stays denied',async()=>{const db=await setup();try{
 for(const override of [{paymentMethod:'card'},{paymentMethod:'online',reportedOfferingCode:'abc'},{paymentMethod:'online',memberId:999},{paymentMethod:'online',anonymous:true}]){const data=payload();Object.assign(data.bags[0],override);await assert.rejects(save(db,null,data),/invalid_payment_method|invalid_code|member_not_found/);}
 assert.equal((await db.query('select count(*)::integer n from finance_cash_batches')).rows[0].n,0);await db.exec('set role authenticated');await assert.rejects(save(db,null,payload()),/permission denied/);await db.exec('reset role');
}finally{await db.close();}});
