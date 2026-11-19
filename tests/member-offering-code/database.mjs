import {PGlite} from '/Volumes/MPLUS-DATA/mplus-ai/tools/payroll-sql-tests/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema church_auth;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function church_auth.allowed(text,text)returns boolean language sql as $$select current_setting('test.can_manage',true)='yes' and $1='M+' and $2='members'$$;
create table public.members(id bigint primary key,church_id text,name text,phone text,district text,birthday text,gender text,group_name text,baptism_date text,faith_status text,age_group text,growth_progress text,memo text,archived_at timestamptz);
create table church_auth.member_bindings(church_id text,login_channel_id text,line_subject text,member_id bigint,active boolean);
create table church_auth.binding_requests(id uuid,church_id text,login_channel_id text,line_subject text,status text,created_at timestamptz);
insert into members(id,church_id,name,phone,birthday,memo)values(1,'M+','合成甲','0900000000','1990-01-01','保留牧養紀錄'),(2,'M+','合成乙','','','保留'),(3,'SHiNE','他堂','','','保留');
insert into church_auth.member_bindings values('M+','2011645391','U00000000000000000000000000000001',1,true),('M+','2011645391','U00000000000000000000000000000002',2,true);`);

await db.exec(await readFile('member-profile-confirmation.sql','utf8'));
await db.exec(`
create table church_auth.accounts(user_id uuid primary key,is_active boolean,display_name text);
create table church_auth.grants(user_id uuid,church_id text,permission text);
create table public.finance_member_codes(member_id bigint primary key,offering_code text);
alter table public.finance_member_codes enable row level security;
revoke all on public.finance_member_codes from public,anon,authenticated;
grant select on public.finance_member_codes to service_role;
create function church_auth.canonical_account(uuid)returns uuid language sql as $$select $1$$;
create function public.finance_user_can(uuid,text)returns boolean language sql as $$select $1='00000000-0000-4000-8000-000000000005'::uuid and $2='entry' and coalesce(current_setting('test.finance',true),'yes')='yes'$$;
insert into church_auth.accounts values
('00000000-0000-4000-8000-000000000001',true,'吳俊璋'),
('00000000-0000-4000-8000-000000000002',true,'謝碧鳳'),
('00000000-0000-4000-8000-000000000003',true,'邵鈺庭'),
('00000000-0000-4000-8000-000000000004',true,'曾恩茹'),
('00000000-0000-4000-8000-000000000005',true,'合成會計'),
('00000000-0000-4000-8000-000000000006',true,'一般同工');
insert into church_auth.grants select user_id,'M+','members' from church_auth.accounts;
insert into finance_member_codes values(1,'0028'),(3,'0099');
`);
await db.exec(await readFile('member-offering-code.sql','utf8'));
const actor=async n=>db.exec(`set test.actor='00000000-0000-4000-8000-${String(n).padStart(12,'0')}'`);
const codes=async(church='M+',ids=[1,2,3])=>(await db.query('select list_member_offering_codes($1,$2) r',[church,ids])).rows[0].r;
for(let n=1;n<=5;n++){await actor(n);const r=await codes();assert.equal(r.can_view,true);assert.deepEqual(r.codes,[{member_id:1,offering_code:'0028'},{member_id:2,offering_code:null}]);}
await actor(6);assert.deepEqual(await codes(),{can_view:false,codes:[]});
await actor(5);await db.exec("set test.finance='no'");assert.equal((await codes()).can_view,false);await db.exec("set test.finance='yes'");
await db.exec('update church_auth.accounts set is_active=false where user_id=auth.uid()');assert.equal((await codes()).can_view,false);
await actor(1);assert.equal((await codes('SHiNE')).can_view,false);await assert.rejects(codes('M+',Array(101).fill(1)),/invalid_input/);
await db.exec("set test.actor=''");await assert.rejects(codes(),/login_required/);
const self=async(subject='U00000000000000000000000000000001')=>(await db.query("select get_verified_member_status('M+','2011645391',$1) r",[subject])).rows[0].r;
assert.equal((await self()).member.offering_code,'0028');assert.equal((await self('U00000000000000000000000000000002')).member.offering_code,null);
assert.equal((await self('U00000000000000000000000000000009')).state,'unbound');
await db.exec('update members set archived_at=now() where id=1');assert.equal((await self()).member.offering_code,null);
await db.exec('update church_auth.member_bindings set active=false where member_id=1');assert.notEqual((await self()).state,'approved');
const a=(await db.query(`select has_function_privilege('anon','public.list_member_offering_codes(text,bigint[])','execute') anon,has_function_privilege('authenticated','public.get_verified_member_status(text,text,text)','execute') self,has_table_privilege('authenticated','public.finance_member_codes','select') direct`)).rows[0];assert.deepEqual(a,{anon:false,self:false,direct:false});
console.log('PASS 4 core + accounting readers, ordinary/anonymous/disabled/revoked roles denied, cross-church isolation, own-only code, unbound/no-code/archived handling, ACLs');
}finally{await db.close();}
