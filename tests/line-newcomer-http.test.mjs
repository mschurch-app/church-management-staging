import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLineVerifier} from '../supabase/functions/member-access/member-identity.mjs';
import {makeMemberHandler} from '../supabase/functions/member-access/member-http.mjs';
import {makeNewcomerHandler} from '../supabase/functions/newcomer-register/newcomer-http.mjs';
const subject='U'+'1'.repeat(32),identity={church:'M+',channel:'2011645391',subject};
const origin='https://mscos.mchurch.online';
const request=body=>new Request(origin,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('LINE id tokens require the configured audience, expiry and subject',async()=>{
 const base={iss:'https://access.line.me',aud:'2011645391',sub:subject,iat:50,exp:200};
 for(const [patch,valid]of [[{},true],[{aud:'other'},false],[{exp:80},false],[{sub:'user-supplied'},false]]){
  const verify=makeLineVerifier({channels:{'M+':'2011645391'},now:()=>100000,fetcher:async()=>Response.json({...base,...patch})});
  if(valid)assert.deepEqual(await verify({church:'M+',idToken:'synthetic'}),identity);else await assert.rejects(verify({church:'M+',idToken:'synthetic'}));
 }
});
test('LINE access tokens verify channel and then retrieve subject; client subject is ignored',async()=>{
 const urls=[];const verify=makeLineVerifier({channels:{'M+':'2011645391'},fetcher:async url=>{urls.push(url);return Response.json(url.includes('/verify')?{client_id:'2011645391',expires_in:60}:{userId:subject});}});
 assert.deepEqual(await verify({church:'M+',accessToken:'synthetic',subject:'forged'}),identity);assert.equal(urls.length,2);
});
test('OAuth sessions use server-owned identities, never editable user_metadata',async()=>{
 const channels={'M+':'2011645391'};
 const verify=user=>makeLineVerifier({channels,client:{auth:{getUser:async()=>({data:{user}})}}});
 assert.deepEqual(await verify({identities:[{provider:'custom:line-web',identity_data:{sub:subject}}]})({church:'M+',sessionToken:'verified-session'}),identity);
 await assert.rejects(verify({identities:[],user_metadata:{sub:subject}})({church:'M+',sessionToken:'verified-session'}));
 await assert.rejects(verify({identities:[{provider:'custom:line-web',identity_data:{sub:subject}}]})({church:'M+',sessionToken:'verified-session',idToken:'ambiguous'}));
});
test('onboarding returns registration state only, keeps rate limits and rejects spoofed subject',async()=>{
 let limitedAction;const handler=makeMemberHandler({enabled:true,origin,consumeEntry:async()=>true,consumeLimit:async(_i,a)=>{limitedAction=a;return true;},verifyIdentity:async()=>identity,status:async()=>({state:'approved',member:{name:'private',phone:'private'}})});
 const res=await handler(request({action:'onboarding',church:'M+',accessToken:'synthetic'}));assert.deepEqual(await res.json(),{state:'approved',registered:true});assert.equal(limitedAction,'status');
 assert.equal((await handler(request({action:'onboarding',church:'M+',idToken:'synthetic',subject}))).status,400);
});
const input=()=>({kind:'newcomer',church:'M+',request_id:crypto.randomUUID(),name:'合成新朋友',phone:'0900000000'});
test('registration verifies before storage and strips credentials from profile payload',async()=>{
 let stored;const handler=makeNewcomerHandler({enabled:true,verifyIdentity:async()=>identity,submit:async record=>{stored=record;return 'accepted';}});
 const res=await handler(request({...input(),accessToken:'synthetic'}));assert.equal(res.status,201);assert.deepEqual(await res.json(),{accepted:true,lineBound:true});assert.deepEqual(stored.identity,identity);assert.equal(stored.payload.accessToken,undefined);
});
test('invalid identity cannot silently fall back to anonymous registration',async()=>{
 let calls=0;const handler=makeNewcomerHandler({enabled:true,verifyIdentity:async()=>{throw Error();},submit:async()=>{calls++;return 'accepted';}});
 assert.equal((await handler(request({...input(),sessionToken:'bad'}))).status,401);assert.equal(calls,0);
 assert.equal((await handler(request({...input(),line_subject:subject}))).status,400);
});
test('anonymous registration remains available; retry/review outcomes are explicit',async()=>{
 for(const outcome of ['accepted','already_bound','review_required','conflict','limited']){
  const handler=makeNewcomerHandler({enabled:true,submit:async()=>outcome});const res=await handler(request(input()));
  assert.equal(res.status,{accepted:201,already_bound:409,review_required:409,conflict:409,limited:429}[outcome]);
  if(outcome==='accepted')assert.deepEqual(await res.json(),{accepted:true});
 }
});
test('claim lookup/verification outputs are allowlisted and require verified identity',async()=>{
 let forwarded;const token=crypto.randomUUID();const handler=makeMemberHandler({enabled:true,origin,consumeEntry:async()=>true,consumeLimit:async()=>true,verifyIdentity:async()=>identity,claim:async(i,a,p)=>{forwarded={i,a,p};return a==='search'?{state:'candidates',candidates:[{token,name:'合成家人',phone:'secret',member_id:99}]}:{state:'verified',claimToken:token,member:{name:'合成家人',phone:'0900000000',memo:'secret',group_name:'secret'}};}});
 const r=await handler(request({action:'lookup',church:'M+',idToken:'synthetic',query:'合'}));assert.deepEqual(await r.json(),{state:'candidates',candidates:[{token,name:'合成家人'}]});assert.deepEqual(forwarded,{i:identity,a:'search',p:{query:'合'}});
 const verified=await handler(request({action:'claim_verify',church:'M+',idToken:'synthetic',candidate:token,answer:'0900000000'}));const data=await verified.json();assert.equal(data.state,'verified');assert(!Object.hasOwn(data.member,'memo'));assert(!Object.hasOwn(data.member,'group_name'));
 for(const b of [{action:'lookup',query:''},{action:'claim_select',candidate:'99'},{action:'claim_verify',candidate:token,answer:''},{action:'lookup',query:'合',member_id:99}])assert.equal((await handler(request({church:'M+',idToken:'synthetic',...b}))).status,400);
});
test('existing-member claims require login and preserve proof outside editable profile payload',async()=>{
 const token=crypto.randomUUID();let stored;const handler=makeNewcomerHandler({enabled:true,verifyIdentity:async()=>identity,submit:async v=>{stored=v;return v.claimReview?'pending_review':'accepted';}});
 assert.equal((await handler(request({...input(),claimToken:token}))).status,401);
 const success=await handler(request({...input(),idToken:'synthetic',claimToken:token}));assert.deepEqual(await success.json(),{accepted:true,lineBound:true,existingMember:true});assert.equal(stored.claimToken,token);assert.equal(stored.payload.claimToken,undefined);
 const review=await handler(request({...input(),idToken:'synthetic',claimToken:token,claimReview:true}));assert.equal(review.status,202);assert.deepEqual(await review.json(),{accepted:true,pendingReview:true});assert.equal(stored.claimReview,true);
 assert.equal((await handler(request({...input(),idToken:'synthetic',claimReview:true}))).status,400);
});
