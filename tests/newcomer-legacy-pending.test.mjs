import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup} from './line-newcomer-db.test.mjs';
test('legacy pending request completes through the full form once under service_role',async()=>{
 const db=await setup();try{
  for(const name of ['20261110010236_verified_existing_member_claim.sql','20261110034406_line_member_service_write_privileges.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec(`alter role service_role bypassrls;grant usage on schema public,church_auth to service_role;grant select,insert,update on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role;grant select on church_auth.member_bindings,church_auth.binding_requests to service_role;grant select,insert on church_auth.newcomer_receipts to service_role;grant execute on function public.register_staging_newcomer(uuid,text,jsonb) to service_role;`);
  const pending=crypto.randomUUID(),id=crypto.randomUUID(),who='U'+'9'.repeat(32),payload={name:'合成舊申請新朋友',phone:'0900000000',district:'合成地區',birthday:null,gender:'合成性別',age_group:'',know_us_from:'',desired_feelings:[],interest_tags:[],memo:''};
  await db.query("insert into church_auth.binding_requests(id,church_id,login_channel_id,line_subject,applicant_name,applicant_phone)values($1,'M+','2011645391',$2,$3,$4)",[pending,who,payload.name,payload.phone]);
  await db.exec('set role service_role');
  for(let retry=0;retry<2;retry++)assert.equal((await db.query("select public.register_verified_line_newcomer($1,'M+','2011645391',$2,$3) result",[id,who,JSON.stringify(payload)])).rows[0].result,'accepted');
  await db.exec('reset role');
  const request=(await db.query('select * from church_auth.binding_requests')).rows;
  assert.equal(request.length,1);assert.equal(request[0].id,pending);assert.equal(request[0].status,'approved');
  const members=(await db.query('select * from members')).rows;assert.equal(members.length,1);assert.equal(members[0].id,request[0].member_id);assert.equal(members[0].district,payload.district);
  const binding=(await db.query('select * from church_auth.member_bindings')).rows;assert.equal(binding.length,1);assert.equal(binding[0].active,true);assert.equal(binding[0].approved_by,null);assert.equal(binding[0].binding_source,'line_newcomer');
  assert.equal((await db.query('select count(*) n from pastoral_newcomer_care_cases')).rows[0].n,1);
 }finally{await db.close();}
});
