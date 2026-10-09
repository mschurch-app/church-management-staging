import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(),checks=[],out=new URL('./results/service-journey/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const subject='U00000000000000000000000000000001',other='U00000000000000000000000000000002';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const journey=()=>scalar('select public.service_signup_member_journey($1,$2,$3)',['M+','2011645391',subject]);
async function test(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS',name);}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema church_auth;
 create table public.members(id bigint primary key,church_id text,archived_at timestamptz);
 create table church_auth.member_bindings(member_id bigint,church_id text,login_channel_id text,line_subject text,active boolean);
 create table public.service_signup_seasons(id bigint primary key,church_id text,starts_on date,status text);
 create table public.service_signup_slots(id bigint primary key,church_id text,ministry_key text,role_key text);
 create table public.service_signup_registrations(id bigint primary key,church_id text,member_id bigint,slot_id bigint,season_id bigint,service_date date,status text);
 revoke all on all tables in schema public,church_auth from anon,authenticated,service_role;
 grant usage on schema public to anon,authenticated,service_role;`);
 await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261009060806_service_signup_member_journey.sql',import.meta.url),'utf8'));
 const today=await scalar("select (now() at time zone 'Asia/Taipei')::date::text"),year=Number(today.slice(0,4));
 await q("insert into public.members values(1,'M+',null),(2,'M+',null),(3,'SHiNE',null),(4,'M+',null)");
 await q("insert into church_auth.member_bindings values(1,'M+','2011645391',$1,true),(2,'M+','2011645391',$2,true),(3,'SHiNE','2011645391',$1,true),(4,'M+','2011645391','U00000000000000000000000000000004',true)",[subject,other]);
 await q("insert into public.service_signup_seasons values(1,'M+',make_date($1,1,1),'open'),(2,'M+',make_date($1-1,1,1),'closed'),(3,'SHiNE',make_date($1,1,1),'open'),(4,'M+',make_date($1+1,1,1),'open')",[year]);
 await db.exec("insert into public.service_signup_slots values(1,'M+','media','sound'),(2,'M+','worship','worship_leader'),(3,'SHiNE','welcome','welcome_1')");
 const past=(await scalar("select ((now() at time zone 'Asia/Taipei')::date-7)::text")),future=await scalar("select ((now() at time zone 'Asia/Taipei')::date+7)::text"),lastYear=`${year-1}-12-31`;
 const records=[
  [1,1,2,lastYear,'confirmed'],[2,1,1,past,'confirmed'],[3,1,1,past,'registered'],[4,1,1,past,'waitlisted'],[5,1,1,past,'cancelled'],[6,1,1,past,'declined'],
  [7,1,1,future,'confirmed'],[8,1,1,future,'registered'],[9,1,1,future,'offered'],[10,1,1,future,'waitlisted'],[11,1,1,today,'confirmed'],[12,1,1,past,'confirmed'],
  [13,2,1,past,'confirmed'],[14,1,4,`${year+1}-01-03`,'registered'],
 ];
 for(const [id,member,season,date,status] of records)await q("insert into public.service_signup_registrations values($1,'M+',$2,1,$3,$4,$5)",[id,member,season,date,status]);
 await q("insert into public.service_signup_registrations values(15,'SHiNE',3,3,3,$1,'confirmed')",[past]);
 await db.exec('set role service_role');
 let data;
 await test('service role can read only an approved LINE member journey',async()=>{data=await journey();assert.equal(data.counting_rule,'confirmed_and_date_passed');assert.equal(data.as_of,today);});
 await test('confirmed past service counts once per Sunday',async()=>assert.equal(data.years.find(y=>y.year===year).completed_count,1));
 await test('unconfirmed, cancelled, declined and waitlisted history do not increase total',async()=>assert.equal(data.years.find(y=>y.year===year).completed_count,1));
 await test('today and future confirmed services are not completed yet',async()=>assert.equal(data.registration_details.find(r=>r.id===11).completed,false));
 await test('future dates are deduplicated in prepared count',async()=>assert.equal(data.years.find(y=>y.year===year).registered_count,2));
 await test('offered and waitlisted dates are counted separately from preparation',async()=>assert.equal(data.years.find(y=>y.year===year).waitlisted_count,1));
 await test('closed-season previous-year history remains available',async()=>assert.equal(data.years.find(y=>y.year===year-1).completed_count,1));
 await test('future year has preparation but zero completed services',async()=>{const next=data.years.find(y=>y.year===year+1);assert.equal(next.completed_count,0);assert.equal(next.registered_count,1);});
 await test('other member and church registrations are excluded',async()=>{assert(!data.registration_details.some(r=>r.id===13||r.id===15));assert.equal(data.registration_details.length,11);});
 await test('registration detail retains role and historical season date',async()=>{const old=data.registration_details.find(r=>r.id===1);assert.equal(old.role_key,'sound');assert.equal(old.season_starts_on,lastYear.slice(0,4)+'-01-01');});
 await test('unbound LINE subject cannot read anyone else',async()=>await assert.rejects(()=>scalar("select public.service_signup_member_journey('M+','2011645391','U00000000000000000000000000000099')"),/binding_required/));
 await test('incorrect channel cannot inherit a binding',async()=>await assert.rejects(()=>scalar("select public.service_signup_member_journey('M+','999',$1)",[subject]),/binding_required/));
 await test('invalid and null identity fields fail closed',async()=>{await assert.rejects(()=>scalar("select public.service_signup_member_journey('bad','2011645391',$1)",[subject]),/invalid_identity/);await assert.rejects(()=>scalar("select public.service_signup_member_journey('M+',null,$1)",[subject]),/invalid_identity/);});
 await test('empty member still receives zero counts and open-year options',async()=>{const empty=await scalar("select public.service_signup_member_journey('M+','2011645391','U00000000000000000000000000000004')");assert.equal(empty.registration_details.length,0);assert(empty.years.every(y=>y.completed_count===0&&y.registered_count===0));});
 for(const role of ['anon','authenticated'])await test(role+' cannot execute identity-based privileged read',async()=>{await db.exec('reset role;set role '+role);await assert.rejects(journey,/permission denied/);});
 await db.exec('reset role');
 await test('archived member cannot read historical journey',async()=>{await q('update public.members set archived_at=now() where id=1');await db.exec('set role service_role');await assert.rejects(journey,/binding_required/);});
 await db.exec('reset role');await q('update public.members set archived_at=null where id=1');await q('update church_auth.member_bindings set active=false where member_id=1');await db.exec('set role service_role');
 await test('revoked binding cannot read historical journey',async()=>await assert.rejects(journey,/binding_required/));
 await db.exec('reset role');
 await test('statistics read never changes registration rows',async()=>assert.equal(await scalar('select count(*)::int from public.service_signup_registrations'),15));
 fs.writeFileSync(new URL('db-checks.json',out),JSON.stringify({status:'passed',checks,synthetic_data_only:true,timezone:'Asia/Taipei'},null,2));console.log('TOTAL',checks.length);
}finally{await db.close();}
