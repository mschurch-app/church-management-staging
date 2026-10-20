// Local real PostgreSQL (PGlite), synthetic records only; no production connection.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create schema church_auth;
create table church_auth.accounts(user_id uuid primary key,is_active boolean);
create table church_auth.owners(user_id uuid primary key);
create table church_auth.grants(user_id uuid,church_id text,permission text);
create table church_auth.account_feature_permissions(user_id uuid,church_id text,feature_key text,can_export boolean,can_view boolean);
create schema camp_registration;
create table camp_registration.events(id uuid primary key default gen_random_uuid(),slug text);
create table camp_registration.registrations(id uuid primary key default gen_random_uuid(),request_id uuid unique not null,event_id uuid references camp_registration.events,registration_no text unique not null,status text,payment_environment text,amount integer);
create table camp_registration.payment_orders(id uuid primary key default gen_random_uuid(),registration_id uuid references camp_registration.registrations,provider text,status text,payment_environment text,paid_at timestamptz,trade_no text,amount integer,provider_result jsonb default '{}',created_at timestamptz default now());
create table camp_registration.receipt_profiles(registration_id uuid primary key references camp_registration.registrations,receipt_type text,receipt_title text,donor_name text);
create table camp_registration.eoffering_sync(registration_id uuid unique references camp_registration.registrations,status text,platform_record_id text,receipt_no text,export_batch text,updated_at timestamptz,last_error text,constraint eoffering_sync_status_check check(status in ('pending','sending','imported','failed','manual_csv_ready','skipped_no_receipt','skipped_test')));
create table camp_registration.audit_log(registration_id uuid references camp_registration.registrations,actor_type text,actor_id text,action text,details jsonb);
insert into camp_registration.events(slug) values('heat-basketball-camp-2027');
insert into auth.users values('00000000-0000-4000-8000-000000000001');
insert into church_auth.accounts values('00000000-0000-4000-8000-000000000001',true);
insert into church_auth.owners select id from auth.users;
`);
await db.exec(await readFile(new URL('../supabase/receipt-issuance.sql',import.meta.url),'utf8'));
let passes=0;
function ok(message){passes++;console.log('PASS',message);}
async function fixture(no,{environment='production',receiptType='single',sync='pending'}={}){
 const r=(await db.query(`insert into camp_registration.registrations(request_id,event_id,registration_no,status,payment_environment,amount) values(gen_random_uuid(),(select id from camp_registration.events),$1,'awaiting_payment',$2,7000) returning id,request_id`,[no,environment])).rows[0];
 await db.query(`insert into camp_registration.receipt_profiles values($1,$2,'假資料收據抬頭','測試家長')`,[r.id,receiptType]);
 await db.query(`insert into camp_registration.eoffering_sync(registration_id,status) values($1,$2)`,[r.id,sync]);
 await db.query(`insert into camp_registration.payment_orders(registration_id,provider,status,payment_environment,amount) values($1,'line_pay','created',$2,7000)`,[r.id,environment]);
 return r;
}
async function pay(r,date='2026-10-19T16:01:00Z'){
 await db.transaction(async tx=>{
 await tx.query(`update camp_registration.payment_orders set status='paid',paid_at=$2,trade_no='SYNTHETIC-'||id::text where registration_id=$1`,[r.id,date]);
 await tx.query(`update camp_registration.registrations set status='paid' where id=$1`,[r.id]);
 });
}
async function get(r){return (await db.query(`select public.heat_camp_2027_customer_receipt($1) as receipt`,[r.request_id])).rows[0].receipt;}
async function denied(fn,code){await assert.rejects(fn,e=>e.message.includes(code));}
const a=await fixture('HC27-TEST01');
await denied(()=>get(a),'paid_production_required');ok('unpaid blocked');
await pay(a);let doc=await get(a);assert.equal(doc.receipt_no,'B11611510200001');ok('automatic receipt uses Taipei paid date and first daily serial');
let repeat=await get(a);assert.equal(repeat.receipt_no,doc.receipt_no);assert.equal((await db.query('select count(*)::int as n from camp_registration.issued_receipts')).rows[0].n,1);ok('repeat/reprint retains same receipt and counter');
const b=await fixture('HC27-TEST02');await pay(b);assert.equal((await get(b)).receipt_no,'B11611510200002');ok('different payment gets next unique daily serial');
const c=await fixture('HC27-TEST03');await pay(c,'2026-10-20T16:01:00Z');assert.equal((await get(c)).receipt_no,'B11611510210001');ok('new Taipei day starts new counter');
const t=await fixture('HC27-TEST04',{environment:'test'});await pay(t);await denied(()=>get(t),'paid_production_required');ok('sandbox cannot issue official receipt');
const n=await fixture('HC27-TEST05',{receiptType:'none'});await pay(n);await denied(()=>get(n),'receipt_not_requested');ok('no-receipt preference respected');
const e=await fixture('HC27-TEST06',{sync:'imported'});await pay(e);await denied(()=>get(e),'external_receipt_conflict');assert.equal((await db.query('select status from camp_registration.registrations where id=$1',[e.id])).rows[0].status,'paid');ok('external receipt conflict audited without interrupting paid status');
await denied(()=>db.query(`select public.heat_camp_2027_issue_receipt(null,'HC27-TEST01')`),'forbidden');ok('unknown or missing staff identity blocked');
await db.exec(`set role anon`);await denied(()=>db.query(`select public.heat_camp_2027_customer_receipt('${a.request_id}')`),'permission denied');await db.exec('reset role');ok('anonymous cannot bypass Edge function through RPC');
await denied(()=>db.query(`update camp_registration.receipt_profiles set receipt_title='偷偷改抬頭' where registration_id=$1`,[a.id]),'receipt_already_issued');assert.equal((await get(a)).receipt_title,'假資料收據抬頭');ok('issued receipt snapshot cannot silently change');
await db.query(`update camp_registration.payment_orders set status='refunded' where registration_id=$1`,[a.id]);await denied(()=>get(a),'paid_production_required');assert.equal((await db.query('select status from camp_registration.issued_receipts where registration_id=$1',[a.id])).rows[0].status,'voided');ok('refund voids receipt and prevents valid download');
assert.equal((await db.query('select status from camp_registration.eoffering_sync where registration_id=$1',[b.id])).rows[0].status,'skipped_direct_receipt');ok('direct receipt excluded from external duplicate issuance queue');
await db.exec(`update camp_registration.receipt_daily_counters set last_serial=9999 where paid_date='2026-10-20'`);
const full=await fixture('HC27-TEST07');await pay(full);await denied(()=>get(full),'daily_serial_exhausted');ok('daily counter overflow fails safely without wrapping');
await db.close();console.log(`${passes} database checks passed`);
