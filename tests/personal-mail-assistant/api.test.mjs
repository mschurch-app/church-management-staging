import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../../supabase/functions/personal-mail-assistant-api/handler.mjs';
const A='10000000-0000-4000-8000-000000000001', B='20000000-0000-4000-8000-000000000002';
const X='30000000-0000-4000-8000-000000000001', Y='30000000-0000-4000-8000-000000000002';
const ORIGIN='https://mscos.mchurch.online';
const prefs={time:'07:00',timezone:'Asia/Taipei',deliveryEnabled:false,revision:0};
const state=()=>({ok:true,settings:{...prefs},accounts:[{id:X,provider:'gmail',email:'a@example.invalid',status:'connected'}],
  pagination:{total:1,hasMore:false,nextCursor:null},line:{status:'needs_verification'}});
function fixture(options={}) {
  const calls=[];
  const handler=createHandler({enabled:true,createUserClient(token){
    calls.push(['client',token]);
    return {auth:{async getUser(actual){calls.push(['auth',actual]);return options.auth ?? {data:{user:{id:A,is_anonymous:false}}};}},
      async rpc(name,args){calls.push(['rpc',name,args]);if(options.throws)throw new Error('SECRET-CREDENTIAL');
        return options.result ?? {data:state(),error:null};}};
  },...options.config});
  return {calls,handler};
}
function request(body={action:'state'},options={}) {
  return new Request('https://example.invalid/mail',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',authorization:'Bearer valid.user.signature',...options.headers},body:JSON.stringify(body),...options.request});
}
async function run(body,options={}) {const f=fixture(options),res=await f.handler(request(body));return {...f,res,json:await res.json()};}
for(const config of [{},{enabled:false},{enabled:'true'}]) test('feature remains off '+JSON.stringify(config),async()=>{
  const res=await createHandler(config)(request());assert.equal(res.status,503);assert.equal((await res.json()).error,'feature_not_enabled');
});
test('successful state is authenticated and RPC has no client owner argument',async()=>{
  const r=await run({action:'state'});assert.equal(r.res.status,200);assert.deepEqual(r.calls.map(c=>c[0]),['client','auth','rpc']);
  assert.deepEqual(r.calls[2],['rpc','personal_mail_get_state',{p_after:null,p_limit:50}]);assert.deepEqual(r.json.capabilities,{sync:false,delivery:false,connect:false});
});
for(const key of ['ownerId','user_id','staffId','lineUserId','isAdmin','providerIdentity','token','password']) test('reject injected '+key,async()=>{
  const r=await run({action:'state',[key]:B});assert.equal(r.res.status,400);assert.equal(r.calls.length,0);
});
for(const origin of ['https://evil.invalid','https://mscos.mchurch.online.evil.invalid','null']) test('reject origin '+origin,async()=>{
  const f=fixture(),res=await f.handler(request(undefined,{headers:{origin}}));assert.equal(res.status,403);assert.equal(res.headers.get('access-control-allow-origin'),null);assert.equal(f.calls.length,0);
});
test('preflight checks origin without creating a client',async()=>{const f=fixture(),res=await f.handler(new Request('https://example.invalid/mail',{method:'OPTIONS',headers:{origin:ORIGIN}}));assert.equal(res.status,204);assert.equal(f.calls.length,0);});
test('GET not accepted',async()=>{const f=fixture(),res=await f.handler(new Request('https://example.invalid/mail',{headers:{origin:ORIGIN}}));assert.equal(res.status,405);});
for(const token of ['', 'Bearer abc', 'Bearer '+ 'x'.repeat(9000)]) test('reject malformed auth '+token.length,async()=>{const f=fixture(),res=await f.handler(request(undefined,{headers:{authorization:token}}));assert.equal(res.status,401);assert.equal(f.calls.length,0);});
for(const body of [null,[],{action:'send'},{action:'state',limit:0},{action:'state',limit:101},{action:'state',limit:'10'},{action:'state',cursor:'other-account'},
  {action:'save_preferences',time:'24:00',expectedRevision:0},{action:'save_preferences',time:'07:00'},
  {action:'save_preferences',time:'07:00',expectedRevision:-1},{action:'pause_account',accountId:'bad'}]) test('reject input '+JSON.stringify(body),async()=>{const r=await run(body);assert.equal(r.res.status,400);assert.equal(r.calls.length,0);});
for(const auth of [{error:{status:401},data:{user:null}},{data:{user:{id:A,is_anonymous:true}}},{data:{user:{id:'not-uuid'}}}]) test('unverified or anonymous caller never queries mail '+JSON.stringify(auth),async()=>{const r=await run({action:'state'},{auth});assert.equal(r.res.status,401);assert.equal(r.calls.some(c=>c[0]==='rpc'),false);});
test('Auth outage not mislabeled as logged out',async()=>{const r=await run({action:'state'},{auth:{error:{status:503}}});assert.equal(r.res.status,503);assert.equal(r.json.error,'identity_unavailable');});
for(const [code,status] of [['42501',403],['28000',401],['P0002',404],['40001',409],['22023',400],['XX000',503]]) test('SQL error safely mapped '+code,async()=>{
  const r=await run({action:'state'},{result:{error:{code,message:'SECRET-CREDENTIAL',details:'private mail subject'}}});assert.equal(r.res.status,status);assert.equal(JSON.stringify(r.json).includes('SECRET'),false);assert.equal(JSON.stringify(r.json).includes('subject'),false);
});
test('unknown exception does not disclose error content',async()=>{const r=await run({action:'state'},{throws:true});assert.deepEqual(r.json,{ok:false,error:'service_unavailable'});});
test('response allowlist strips provider identity, tokens, LINE ID and extra data',async()=>{
  const data=state();Object.assign(data,{secret:'SECRET'});Object.assign(data.settings,{refresh_token:'SECRET'});Object.assign(data.accounts[0],{ownerId:B,provider_subject:'SECRET',password:'SECRET'});Object.assign(data.line,{userId:'SECRET'});
  const r=await run({action:'state'},{result:{data}});assert.equal(r.res.status,200);assert.equal(JSON.stringify(r.json).includes('SECRET'),false);assert.equal('ownerId' in r.json.accounts[0],false);
});
test('revision-aware time save cannot enable delivery',async()=>{const r=await run({action:'save_preferences',time:'08:15',expectedRevision:2},{result:{data:{ok:true,settings:{...prefs,time:'08:15',revision:3}}}});assert.equal(r.res.status,200);assert.deepEqual(r.calls[2],['rpc','personal_mail_set_time',{p_time:'08:15',p_expected_revision:2}]);assert.equal(r.json.settings.deliveryEnabled,false);});
test('reject enable attempt',async()=>{const r=await run({action:'save_preferences',time:'07:00',expectedRevision:0,deliveryEnabled:true});assert.equal(r.res.status,400);});
test('pause only supplies account ID; owner is resolved by SQL',async()=>{const r=await run({action:'pause_account',accountId:X},{result:{data:{ok:true,account:{id:X,status:'paused',ownerId:B}}}});assert.equal(r.res.status,200);assert.deepEqual(r.calls[2],['rpc','personal_mail_pause_account',{p_account:X}]);assert.deepEqual(r.json.account,{id:X,status:'paused'});});
test('multi-account and pagination cursor preserved',async()=>{const data=state();data.accounts.push({id:Y,provider:'icloud',email:'b@example.invalid',status:'paused'});data.pagination={total:7,hasMore:true,nextCursor:Y};const r=await run({action:'state',limit:2,cursor:A},{result:{data}});assert.equal(r.res.status,200);assert.equal(r.json.pagination.total,7);assert.deepEqual(r.calls[2][2],{p_after:A,p_limit:2});});
for(const mutate of [d=>d.settings.deliveryEnabled=true,d=>d.ok=false,d=>d.accounts[0].provider='outlook',d=>d.accounts[0].status='unknown',d=>d.line.status='verified',d=>d.accounts.push({...d.accounts[0]}),d=>d.pagination.nextCursor=X]) test('invalid backend contract fails closed '+mutate.toString(),async()=>{const data=state();mutate(data);const r=await run({action:'state'},{result:{data}});assert.equal(r.res.status,502);});
test('response is not cached',async()=>{const r=await run({action:'state'});assert.equal(r.res.headers.get('cache-control'),'no-store');assert.equal(r.res.headers.get('referrer-policy'),'no-referrer');});
test('oversized body without length is bounded while streaming',async()=>{const f=fixture(),res=await f.handler(request({action:'state',extra:'x'.repeat(5000)}));assert.equal(res.status,413);assert.equal(f.calls.length,0);});
test('reject non JSON',async()=>{const f=fixture(),res=await f.handler(request(undefined,{headers:{'content-type':'text/plain'}}));assert.equal(res.status,415);});
test('malformed JSON',async()=>{const f=fixture(),res=await f.handler(request(undefined,{request:{body:'{broken'}}));assert.equal(res.status,400);});
test('server entry uses caller credentials and no privileged service key',async()=>{const source=await readFile(new URL('../../supabase/functions/personal-mail-assistant-api/index.ts',import.meta.url),'utf8');assert.match(source,/SUPABASE_PUBLISHABLE_KEY/);assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);assert.match(source,/PERSONAL_MAIL_SETTINGS_ENABLED/);});
test('mismatched pause response is not accepted',async()=>{const r=await run({action:'pause_account',accountId:X},{result:{data:{ok:true,account:{id:Y,status:'paused'}}}});assert.equal(r.res.status,502);});
test('mismatched preference save is not accepted',async()=>{const r=await run({action:'save_preferences',time:'09:00',expectedRevision:1},{result:{data:{ok:true,settings:{...prefs,time:'09:00',revision:1}}}});assert.equal(r.res.status,502);});
test('sequential users do not share a cached authenticated client',async()=>{
  const tokens=[];
  const handler=createHandler({enabled:true,createUserClient(token){tokens.push(token);const isA=token==='user.a.token';return {
    auth:{getUser:async()=>({data:{user:{id:isA?A:B}}})},rpc:async()=>{const data=state();data.accounts[0].email=isA?'a@example.invalid':'b@example.invalid';return {data};}
  };}});
  const first=await(await handler(request(undefined,{headers:{authorization:'Bearer user.a.token'}}))).json();
  const second=await(await handler(request(undefined,{headers:{authorization:'Bearer user.b.token'}}))).json();
  assert.equal(first.accounts[0].email,'a@example.invalid');assert.equal(second.accounts[0].email,'b@example.invalid');assert.deepEqual(tokens,['user.a.token','user.b.token']);
});
