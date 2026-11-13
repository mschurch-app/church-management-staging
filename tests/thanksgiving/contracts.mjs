import test from 'node:test';import assert from 'node:assert/strict';
import {validateResponse,notificationText}from '../../supabase/functions/thanksgiving-offering-response/validation.mjs';
import {makeHandler}from '../../supabase/functions/thanksgiving-offering-response/handler.mjs';
import {deliver,dispatchJobs}from '../../supabase/functions/thanksgiving-offering-response/delivery.mjs';
const base=()=>({donor_name:'合成奉獻人',method:'bank_transfer',donation_date:'2026-11-10',amount_ntd:1000,remitter_account_last5:'00123',contact_email:'donor@example.invalid',contact_phone:'',note:'合成驗收資料',consent:true,source:'thanksgiving_2026',website:''});
const job=channel=>({id:crypto.randomUUID(),lease_token:crypto.randomUUID(),channel,recipient:channel==='line'?'U'+'1'.repeat(32):'pastor@example.invalid',created_at:new Date().toISOString(),attempts:1,is_test:true,reference_no:'TG26-ABCDEF1234567890',payload:base()});
test('validation preserves leading zeros, requires bank last5, validates online/date/integer/contact/consent and rejects full account or unknown fields',()=>{
 assert.equal(validateResponse(base()).remitter_account_last5,'00123');assert.equal(validateResponse({...base(),method:'online',remitter_account_last5:''}).remitter_account_last5,'');
 for(const patch of [{remitter_account_last5:'1234'},{remitter_account_last5:'123456'},{remitter_account_last5:'12a45'},{remitter_account_last5:''},{donation_date:'2026-02-30'},{donation_date:'2099-01-01'},{amount_ntd:1.2},{amount_ntd:0},{amount_ntd:'1000'},{contact_email:'',contact_phone:''},{contact_email:'x\n@y.com'},{consent:false},{full_bank_account:'1234567890'},{website:'robot'},{note:'x'.repeat(301)}])assert.throws(()=>validateResponse({...base(),...patch}));
});
test('HTTP intake enforces origin, method, size, exact input and queues atomically before acceptance',async()=>{
 const calls=[];const handler=makeHandler({rpc:async(action,input)=>{calls.push({action,input});return action==='rate'?{allowed:true}:{status:'accepted',reference_no:'TG26-ABCDEF1234567890',notifications_queued:true};},hashIP:async()=>'a'.repeat(64)});
 const request=(body=base(),headers={},method='POST')=>new Request('https://fixture.invalid',{method,headers:{origin:'https://mchurch.online','content-type':'application/json','x-idempotency-key':crypto.randomUUID(),...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 assert.equal((await handler(request())).status,202);assert.equal(calls[1].action,'submit');assert.equal(calls[1].input.actor,undefined);assert.equal(calls[1].input.is_test,undefined);
 assert.equal((await handler(request(base(),{origin:'https://attacker.invalid'}))).status,403);assert.equal((await handler(request(base(),{},'GET'))).status,405);assert.equal((await handler(request({...base(),note:'x'.repeat(11000)}))).status,413);assert.equal((await handler(request({...base(),is_test:true}))).status,400);assert.equal((await handler(request(base(),{'x-idempotency-key':'bad'}))).status,400);
});
test('HTTP never accepts missing queue, persistence failure, wrong idempotency content or exhausted rate',async()=>{
 for(const scenario of ['queue','database','conflict','rate']){
  const handler=makeHandler({hashIP:async()=>'a'.repeat(64),rpc:async action=>{if(action==='rate')return {allowed:scenario!=='rate'};if(scenario==='database')throw Error('database internal PII must not appear');if(scenario==='conflict')throw Error('idempotency_conflict');return {status:'accepted',reference_no:'TG26-ABCDEF1234567890',notifications_queued:false};}});
  const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{origin:'https://mchurch.online','content-type':'application/json','x-idempotency-key':crypto.randomUUID()},body:JSON.stringify(base())}));assert.equal(response.status,scenario==='conflict'?409:scenario==='rate'?429:503);assert(!(await response.text()).includes('PII'));
 }
});
test('admin HTTP authenticates actual actor, rejects caller actor/recipient and wrong origin',async()=>{
 const actor=crypto.randomUUID(),calls=[];const handler=makeHandler({verifyUser:async token=>token==='Bearer valid'?actor:null,channelsReady:()=>false,rpc:async(action,input)=>{calls.push({action,input});return {};}});
 const req=(input,origin='https://mscos.mchurch.online',token='valid')=>new Request('https://fixture.invalid',{method:'POST',headers:{origin,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await handler(req({action:'admin_list'}))).status,200);assert.equal(calls[0].input.actor,actor);
 assert.equal((await handler(req({action:'admin_list',actor:crypto.randomUUID()}))).status,400);assert.equal((await handler(req({action:'admin_list'},undefined,'bad'))).status,401);assert.equal((await handler(req({action:'admin_list'},'https://mchurch.online'))).status,403);assert.equal((await handler(req({action:'settings',enabled:true}))).status,503);
});
test('LINE sends only private user IDs, fixed retry key, complete required data and treats accepted 409 as sent',async()=>{
 const item=job('line');let captured;
 const result=await deliver(item,{lineToken:'synthetic',fetcher:async(url,options)=>{captured={url,options};return new Response('{}',{status:409,headers:{'x-line-accepted-request-id':'accepted-fixture'}});}});
 assert.equal(result.status,'sent');assert.equal(captured.options.headers['X-Line-Retry-Key'],item.id);const body=JSON.parse(captured.options.body);assert.equal(body.to,item.recipient);for(const text of ['合成奉獻人','2026-11-10','1000','00123','銀行匯款',item.reference_no,'thanksgiving-offering-admin.html'])assert(body.messages[0].text.includes(text));
 assert.equal((await deliver({...item,recipient:'C'+'1'.repeat(32)},{lineToken:'fixture'})).status,'failed');
});
test('LINE handles network/retryable/provider denial without leaking credentials',async()=>{
 for(const status of [400,401,403,429,500])assert.equal((await deliver(job('line'),{lineToken:'fixture',fetcher:async()=>new Response('{}',{status})})).status,status===429||status>=500?'retry':'failed');
 assert.equal((await deliver(job('line'),{lineToken:'fixture',fetcher:async()=>{throw Error('secret fixture');}})).status,'retry');
 assert.equal((await deliver({...job('line'),attempts:2,created_at:'2020-01-01T00:00:00Z'},{lineToken:'fixture'})).status,'unknown');
});
test('Email jobs are rejected and cannot invoke any mail provider',async()=>{
 let sent=false;const result=await deliver(job('email'),{lineToken:'fixture',sendMail:async()=>{sent=true;},fetcher:async()=>{throw Error('must not contact LINE for Email');}});assert.equal(result.status,'failed');assert.equal(result.error_code,'unsupported_channel');assert.equal(sent,false);
});
test('LINE worker records real acceptance or failure independently per response',async()=>{
 for(const success of [false,true]){
  const records=[],jobs=[job('line')];const result=await dispatchJobs({workerKey:'synthetic',rpc:async(action,input)=>{if(action==='claim_jobs')return {jobs};records.push(input);return {ok:true};},lineToken:'synthetic',fetcher:async()=>new Response('{}',{status:success?200:503})});assert.equal(records.length,1);assert.equal(records[0].status,success?'sent':'retry');assert.equal(result.processed,1);
 }
});
