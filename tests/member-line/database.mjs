import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite(),results=[];const ids=['b7d6ba5d-8e0a-4921-8813-e9f0071b7566','b4dd23e4-4120-4a94-89b5-623bc5f8e600','5a1326fd-b9ba-4486-b44b-3a70dc56e68a','0183584e-e009-47d9-8327-13b4e505e349','00000000-0000-4000-8000-000000000005'];
const sessions=ids.map((_,i)=>'10000000-0000-4000-8000-00000000000'+i),names=['吳俊璋','謝碧鳳','曾恩茹','邵鈺庭','合成其他同工'];
const q=async(sql,args=[])=> (await db.query(sql,args)).rows;const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const call=(i,action,data={})=>scalar('select public.member_line_operation($1,$2,$3)',[ids[i],action,{church:'M+',session_id:sessions[i],...data}]);
const req='20000000-0000-4000-8000-000000000001',req2='20000000-0000-4000-8000-000000000002',subject='U'+'a'.repeat(32);let sent;
async function test(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema church_auth;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);
 create table church_auth.accounts(user_id uuid primary key,is_active boolean,display_name text,job_title text);
 create table church_auth.owners(user_id uuid);create table church_auth.grants(user_id uuid,church_id text,permission text);
 create table church_auth.account_feature_permissions(user_id uuid,church_id text,feature_key text,can_view boolean);
 create table church_auth.member_bindings(member_id bigint,church_id text,line_subject text,active boolean,login_channel_id text default '2011645391');
 create table church_auth.test_aliases(alias uuid,canonical uuid);
 create function church_auth.canonical_account(p_user uuid) returns uuid language sql as $$ select coalesce((select canonical from church_auth.test_aliases where alias=p_user),p_user) $$;
 create table public.members(id bigint primary key,church_id text,name text,archived_at timestamptz);`);
 for(let i=0;i<ids.length;i++){await q('insert into auth.users values($1)',[ids[i]]);await q('insert into auth.sessions values($1,$2)',[sessions[i],ids[i]]);await q('insert into church_auth.accounts values($1,true,$2,$3)',[ids[i],names[i],i===0?'牧師':i===1?'師母':'同工']);await q("insert into church_auth.grants values($1,'M+','members')",[ids[i]]);}
 await q('insert into church_auth.owners values($1)',[ids[0]]);
 await db.exec("insert into public.members values(1,'M+','合成會友',null),(2,'SHiNE','另一堂會',null),(3,'M+','未綁定',null),(4,'M+','已封存',now());");await q("insert into church_auth.member_bindings(member_id,church_id,line_subject,active) values(1,'M+',$1,true)",[subject]);
 await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261116020648_member_line_messages.sql',import.meta.url),'utf8'));
 await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261116022539_member_line_history.sql',import.meta.url),'utf8'));
 await test('exactly four explicitly approved senders seeded',async()=>assert.equal(await scalar('select count(*)::int from member_messaging.sender_permissions where enabled'),4));
 await test('all approved users can send and only owner manages',async()=>{for(let i=0;i<4;i++)assert.deepEqual(await call(i,'access'),{can_send:true,can_manage:i===0});assert.equal((await call(4,'access')).can_send,false);});
 await test('non-owner cannot modify settings',async()=>await assert.rejects(()=>call(2,'set_permission',{user_id:ids[4],enabled:true,version:0}),/forbidden/));
 await test('permission grants do not give default send access',async()=>await assert.rejects(()=>call(4,'context',{member_id:1}),/forbidden/));
 await test('cross-church member and archived member denied',async()=>{await assert.rejects(()=>call(0,'context',{member_id:2}),/member_unavailable/);await assert.rejects(()=>call(0,'context',{member_id:4}),/member_unavailable/);await assert.rejects(()=>call(0,'access',{church:'SHiNE'}),/unsupported_church/);});
 await test('unbound recipient cannot send',async()=>{assert.equal((await call(0,'context',{member_id:3})).member.line_ready,false);await assert.rejects(()=>call(0,'prepare',{member_id:3,request_id:req,message:'你好'}),/line_unavailable/);});
 await test('sender stores frozen request and server-resolved recipient',async()=>{sent=await call(0,'prepare',{member_id:1,request_id:req,message:'合成訊息'});assert.equal(sent.line_subject,subject);assert.equal(sent.status,'sending');});
 await test('parallel same-id request is refused while sending',async()=>await assert.rejects(()=>call(0,'prepare',{member_id:1,request_id:req,message:'合成訊息'}),/delivery_busy/));
 await test('new UUID cannot bypass duplicate payload protection',async()=>await assert.rejects(()=>call(0,'prepare',{member_id:1,request_id:req2,message:'合成訊息'}),/duplicate_message/));
 await test('request payload and actor remain immutable',async()=>{await assert.rejects(()=>call(0,'prepare',{member_id:1,request_id:req,message:'另一內容'}),/request_reused/);await assert.rejects(()=>call(1,'prepare',{member_id:1,request_id:req,message:'合成訊息'}),/request_reused/);});
 await test('wrong attempt token cannot finish delivery',async()=>await assert.rejects(()=>call(0,'finish',{request_id:req,attempt_token:req2,status:'accepted'}),/attempt_changed/));
 await test('accepted provider receipt strips LINE identifier',async()=>{const r=await call(0,'finish',{request_id:req,attempt_token:sent.attempt_token,status:'accepted',provider_request_id:'mock-accepted'});assert.equal(r.status,'accepted');assert(!('line_subject'in r));assert(!('attempt_token'in r));});
 await test('accepted retry returns prior receipt without another send',async()=>{const r=await call(0,'prepare',{member_id:1,request_id:req,message:'合成訊息'});assert.equal(r.duplicate,true);assert.equal(r.status,'accepted');assert(!('line_subject'in r));});
 await test('recent history is scoped and excludes recipient subject',async()=>{const r=await call(1,'context',{member_id:1});assert.equal(r.history.length,1);assert.equal(r.history[0].sender_name,names[0]);assert(!JSON.stringify(r).includes(subject));});
 await test('history preserves who, whom, full content and send/accept dates',async()=>{const r=await call(0,'history',{page:0});assert.equal(r.items.length,1);assert.equal(r.items[0].sender_name,names[0]);assert.equal(r.items[0].member_name,'合成會友');assert.equal(r.items[0].message,'合成訊息');assert(r.items[0].created_at);assert(r.items[0].accepted_at);assert(!JSON.stringify(r).includes(subject));});
 await test('history filters sender/recipient/date without exposing other churches',async()=>{assert.equal((await call(0,'history',{sender_search:'不存在'})).items.length,0);assert.equal((await call(0,'history',{member_search:'合成'})).items.length,1);assert.equal((await call(0,'history',{from:'2099-01-01'})).items.length,0);await assert.rejects(()=>call(4,'history'),/forbidden/);});
 await test('sender snapshot stays unchanged after profile renamed',async()=>{await q('update church_auth.accounts set display_name=$1 where user_id=$2',['改名後',ids[0]]);assert.equal((await call(0,'history')).items[0].sender_name,names[0]);});
 await test('owner can switch own send permission off without implicit bypass',async()=>{await call(0,'set_permission',{user_id:ids[0],enabled:false,version:1});assert.equal((await call(0,'access')).can_send,false);assert.equal((await call(0,'access')).can_manage,true);await assert.rejects(()=>call(0,'context',{member_id:1}),/forbidden/);});
 await test('stale permission version fails without overwriting',async()=>{await assert.rejects(()=>call(0,'set_permission',{user_id:ids[0],enabled:true,version:1}),/version_conflict/);assert.equal((await call(0,'access')).can_send,false);await call(0,'set_permission',{user_id:ids[0],enabled:true,version:2});});
 await test('removing members access disables send despite enabled switch',async()=>{await q("delete from church_auth.grants where user_id=$1",[ids[2]]);assert.equal((await call(2,'access')).can_send,false);});
 await test('explicit members view denial blocks sending',async()=>{await q("insert into church_auth.account_feature_permissions values($1,'M+','members',false)",[ids[3]]);assert.equal((await call(3,'access')).can_send,false);});
 await test('disabled account cannot use stale permission',async()=>{await q('update church_auth.accounts set is_active=false where user_id=$1',[ids[1]]);await assert.rejects(()=>call(1,'access'),/forbidden/);});
 await test('revoked session is denied',async()=>{await q('delete from auth.sessions where user_id=$1',[ids[0]]);await assert.rejects(()=>call(0,'settings'),/session_revoked/);});
 await test('anonymous/authenticated cannot call service RPC or private tables',async()=>{for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>q('select public.member_line_operation($1,$2,$3)',[ids[0],'access',{}]),/permission denied/);await assert.rejects(()=>q('select * from member_messaging.deliveries'),/permission denied/);await db.exec('reset role');}});
 fs.writeFileSync(new URL('../../docs/reports/2026-11-16-member-line/database-results.json',import.meta.url),JSON.stringify({isolated:true,no_provider_calls:true,checks:results},null,2));console.log('TOTAL',results.length);
}catch(e){console.error('FAIL',e.message,e.internalQuery||'');process.exitCode=1;}finally{await db.close();}
