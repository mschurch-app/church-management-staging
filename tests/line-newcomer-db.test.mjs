import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '/Volumes/MPLUS-DATA/mplus-ai/tools/payroll-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
const migration=new URL('../supabase/migrations/20261110003239_verified_line_newcomer_onboarding.sql',import.meta.url);
const subject=n=>'U'+String(n).padStart(32,'0');
export async function setup(){
 const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create schema auth;create schema church_auth;
 create table auth.users(id uuid primary key);
 create table public.members(id bigint generated always as identity primary key,church_id text,name text,phone text,district text,memo text,birthday text,gender text,age_group text,know_us_from text,desired_feelings text[],interest_tags text[],faith_status text,welcome_status text,group_name text,photo_url text,archived_at timestamptz,created_at timestamptz default now());
 create table church_auth.newcomer_receipts(request_id uuid primary key,church_id text,payload_hash text,member_id bigint references members,created_at timestamptz default now());
 create table church_auth.member_bindings(church_id text,login_channel_id text,line_subject text,member_id bigint references members,active boolean,approved_by uuid references auth.users,approved_at timestamptz,primary key(church_id,login_channel_id,line_subject),unique(church_id,login_channel_id,member_id),constraint member_bindings_check check(not active or (approved_by is not null and approved_at is not null)));
 create table church_auth.binding_requests(id uuid primary key,church_id text,login_channel_id text,line_subject text,applicant_name text,applicant_phone text,status text default 'pending',member_id bigint,created_at timestamptz default now());
 create table public.pastoral_newcomer_care_settings(entity_key text,shared_assignee_ids uuid[],first_contact_hours integer);
 create table public.pastoral_staff(id uuid primary key,is_active boolean,role text,created_at timestamptz default now());
 create table public.pastoral_staff_access(staff_id uuid,entity_key text);
 create table public.pastoral_tasks(id uuid default gen_random_uuid(),entity_key text,title text,description text,task_type text,status text,payload jsonb,assigned_to uuid,created_by uuid,idempotency_key uuid,due_at timestamptz);
 create table public.pastoral_newcomer_care_cases(id uuid default gen_random_uuid(),entity_key text,member_id bigint,registration_request_id uuid,first_visit_at timestamptz,invited_by text,gathering text,assigned_staff_ids uuid[],first_contact_due_at timestamptz,shared_task_id uuid);
 create table public.pastoral_newcomer_care_history(case_id uuid,member_id bigint,event_type text,summary text,idempotency_key text);
 insert into public.pastoral_staff values('00000000-0000-4000-8000-000000000001',true,'pastor',now());
 insert into public.pastoral_staff_access values('00000000-0000-4000-8000-000000000001','mplus');`);
 const original=await readFile(new URL('../supabase/migrations/20260925100000_pastoral_newcomer_care.sql',import.meta.url),'utf8');
 const start=original.indexOf('create or replace function public.register_staging_newcomer('),end=original.indexOf('create or replace function public.sync_pastoral_newcomer_care_completion');
 await db.exec(original.slice(start,end));await db.exec(await readFile(migration,'utf8'));return db;
}
const input=(n,church='M+')=>({id:crypto.randomUUID(),church,subject:subject(n),payload:{name:'合成新朋友'+n,phone:'090000'+String(n).padStart(4,'0'),district:'',memo:'',birthday:null,gender:'',age_group:'',know_us_from:'',desired_feelings:[],interest_tags:[]}});
const call=async(db,x)=>(await db.query('select public.register_verified_line_newcomer($1,$2,$3,$4,$5) as result',[x.id,x.church,'2011645391',x.subject,JSON.stringify(x.payload)])).rows[0].result;
const count=async(db,table)=>Number((await db.query('select count(*) as n from '+table)).rows[0].n);
test('M+ enrollment atomically creates member, care case and verified binding; retries are idempotent',async()=>{
 const db=await setup();try{const x=input(1);assert.equal(await call(db,x),'accepted');assert.equal(await call(db,x),'accepted');
 for(const t of ['public.members','church_auth.member_bindings','church_auth.line_newcomer_registrations','public.pastoral_newcomer_care_cases','public.pastoral_tasks'])assert.equal(await count(db,t),1);
 const b=(await db.query('select * from church_auth.member_bindings')).rows[0];assert.equal(b.active,true);assert.equal(b.approved_by,null);assert.equal(b.binding_source,'line_newcomer');
 assert.equal((await db.query('select status from church_auth.binding_requests')).rows[0].status,'approved');
 assert.equal(await call(db,{...x,id:crypto.randomUUID()}),'already_bound');assert.equal(await count(db,'public.members'),1);
 }finally{await db.close();}
});
test('church scope is independent and SHiNE enrollment never creates M+ care tasks',async()=>{
 const db=await setup();try{const x=input(2,'SHiNE');assert.equal(await call(db,x),'accepted');assert.equal(await count(db,'public.pastoral_tasks'),0);
 assert.equal(await call(db,{...input(3),subject:x.subject}),'accepted');assert.equal(await count(db,'church_auth.member_bindings'),2);
 }finally{await db.close();}
});
test('request id and content are bound to the verified subject; anonymous receipts cannot be claimed',async()=>{
 const db=await setup();try{const x=input(4,'SHiNE');await call(db,x);
 assert.equal(await call(db,{...x,subject:subject(5)}),'conflict');assert.equal(await call(db,{...x,payload:{...x.payload,name:'changed'}}),'conflict');
 const y=input(6,'SHiNE');await db.query('select public.register_staging_newcomer($1,$2,$3)',[y.id,y.church,JSON.stringify(y.payload)]);assert.equal(await call(db,y),'conflict');assert.equal(await count(db,'church_auth.member_bindings'),1);
 }finally{await db.close();}
});
test('revoked binding cannot be restored through either the old request or a new enrollment',async()=>{
 const db=await setup();try{const x=input(7,'SHiNE');await call(db,x);await db.exec('update church_auth.member_bindings set active=false');
 assert.equal(await call(db,x),'review_required');assert.equal(await call(db,{...x,id:crypto.randomUUID()}),'review_required');assert.equal(await count(db,'public.members'),1);
 }finally{await db.close();}
});
test('potential existing members require review and are never attached by name or phone',async()=>{
 const db=await setup();try{const x=input(8);await db.query("insert into public.members(church_id,name,phone) values('M+',$1,$2)",[x.payload.name,x.payload.phone]);assert.equal(await call(db,x),'review_required');assert.equal(await count(db,'public.members'),1);assert.equal(await count(db,'church_auth.member_bindings'),0);
 }finally{await db.close();}
});
test('failed binding rolls back the member, registration receipt and care task',async()=>{
 const db=await setup();try{await db.exec("create function church_auth.fail_test()returns trigger language plpgsql as $$begin raise exception 'synthetic_bind_failure';end$$;create trigger fail_test before insert on church_auth.member_bindings for each row execute function church_auth.fail_test();");
 await assert.rejects(call(db,input(9)),/synthetic_bind_failure/);for(const t of ['public.members','church_auth.newcomer_receipts','public.pastoral_tasks'])assert.equal(await count(db,t),0);
 }finally{await db.close();}
});
test('public roles cannot self-assign subjects or access enrollment audit rows',async()=>{
 const db=await setup();try{for(const role of ['anon','authenticated']){
  assert.equal((await db.query("select has_function_privilege($1,'public.register_verified_line_newcomer(uuid,text,text,text,jsonb)','execute') as allowed",[role])).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege($1,'church_auth.line_newcomer_registrations','select') as allowed",[role])).rows[0].allowed,false);
 }}finally{await db.close();}
});
