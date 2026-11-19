import {PGlite} from '/Volumes/MPLUS-DATA/mplus-ai/tools/payroll-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema church_auth;
create function auth.uid()returns uuid language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
create function church_auth.allowed(text,text)returns boolean language sql as $$select current_setting('test.can_manage',true)='yes' and $1='M+' and $2='members'$$;
create table public.members(id bigint primary key,church_id text,name text,phone text,district text,birthday text,gender text,group_name text,baptism_date text,faith_status text,age_group text,growth_progress text,memo text,archived_at timestamptz);
create table church_auth.member_bindings(church_id text,login_channel_id text,line_subject text,member_id bigint,active boolean);
create table church_auth.binding_requests(id uuid,church_id text,login_channel_id text,line_subject text,status text,created_at timestamptz);
insert into members(id,church_id,name,phone,birthday,memo)values(1,'M+','合成甲','0900000000','1990-01-01','保留牧養紀錄'),(2,'M+','合成乙','','','保留'),(3,'SHiNE','他堂','','','保留');
insert into church_auth.member_bindings values('M+','2011645391','U00000000000000000000000000000001',1,true),('M+','2011645391','U00000000000000000000000000000002',2,true);`);
await db.exec(await readFile('member-profile-confirmation.sql','utf8'));
const mark=async(id=1,cancel=false)=>(await db.query("select request_member_profile_confirmation('M+',$1,$2) r",[id,cancel])).rows[0].r;
const status=async()=>(await db.query("select get_verified_member_status('M+','2011645391','U00000000000000000000000000000001') r")).rows[0].r;
const patch={phone:'0911222333',district:'合成地區',birthday:'1991-02-03',gender:'弟兄'};
const confirm=async(id,p=patch,subject='U00000000000000000000000000000001')=>(await db.query("select confirm_verified_member_profile('M+','2011645391',$1,$2,$3) r",[subject,JSON.stringify(p),id])).rows[0].r;
await assert.rejects(mark(),/permission_denied/);await db.exec("set test.can_manage='yes'");await mark();let r=await status(),id=r.member.reconfirmation_id;assert(id);await mark();assert.equal((await status()).member.reconfirmation_id,id);
await assert.rejects(mark(3),/member_unavailable/);assert.equal(await confirm(id,patch,'U00000000000000000000000000000002'),false);await assert.rejects(confirm(id,{phone:'1'}),/incomplete_confirmation/);await assert.rejects(confirm(id,{...patch,birthday:'1991-02-30'}),/invalid_patch/);assert.equal(await confirm(id),true);assert.equal((await status()).member.reconfirmation_id,null);assert.equal((await status()).member.birthday,'1991-02-03');assert.equal(await confirm(id),true);
await mark();const next=(await status()).member.reconfirmation_id;assert.notEqual(next,id);assert.equal(await confirm(id),false);assert.equal((await status()).member.reconfirmation_id,next);await mark(1,true);assert.equal((await status()).member.reconfirmation_id,null);
await mark();await db.exec('update church_auth.member_bindings set active=false where member_id=1');assert.equal(await confirm((await db.query('select profile_confirmation_id id from members where id=1')).rows[0].id),false);assert.equal((await db.query('select count(*) n from members')).rows[0].n,3);assert.equal((await db.query('select memo from members where id=1')).rows[0].memo,'保留牧養紀錄');
console.log('PASS permission/church/identity isolation, same-member update, valid birthday, invalid rejection, idempotent retry, stale request, cancellation, revocation, member count/history preserved');
}finally{await db.close();}
