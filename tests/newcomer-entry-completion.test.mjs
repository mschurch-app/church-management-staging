import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {makeNewcomerHandler} from '../supabase/functions/newcomer-register/newcomer-http.mjs';
import {storePhoto} from '../supabase/functions/newcomer-register/newcomer-photo-store.mjs';
const source=stripTypeScriptTypes((await readFile(new URL('../supabase/functions/newcomer-register/newcomer-staging-entry.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,''));
const origin='https://mscos.mchurch.online';
function fixture({lineFails=false,appFails=false,photoFails=false,notificationHangs=false,review=false}={}){
 const rows=new Map(),objects=new Map(),warnings=[],state={photoFails,photos:0};let handler;
 const storage={getBucket:async()=>({data:{public:false}}),from:()=>({upload:async(path,bytes)=>{state.photos++;if(state.photoFails)return {error:{statusCode:500}};if(objects.has(path))return {error:{statusCode:409}};objects.set(path,new Uint8Array(bytes));return {error:null};},download:async path=>({data:objects.has(path)?new Blob([objects.get(path)]):null})})};
 const db={storage,rpc:async(name,args)=>{assert.equal(name,review?'submit_member_claim_review':'register_verified_line_newcomer');const previous=rows.get(args.p_id);if(previous&&JSON.stringify(previous)!==JSON.stringify(args.p_payload))return {data:'conflict'};rows.set(args.p_id,args.p_payload);return {data:review?'pending_review':'accepted'};},from:()=>{let selection='';const query={select(s){selection=s;return query;},eq(){return query;},maybeSingle:async()=>({data:selection==='member_id'?{member_id:1}:{id:'synthetic-care',assigned_staff_ids:[],first_contact_due_at:'2026-11-10T00:00:00Z'}})};return query;}};
 const Deno={env:{get:k=>({SUPABASE_URL:'https://aqanuwilmvdtlzuqlrau.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'}[k]||'')},serve:h=>{handler=h;}};
 const jpeg={decode:()=>({width:1,height:1,data:new Uint8Array(4)}),encode:()=>({data:new Uint8Array([1,2,3])})};
 const run=new Function('Deno','createClient','jpeg','storePhoto','makeNewcomerHandler','makeLineVerifier','LINE_LOGIN_CHANNELS','notifyBindingReview','notifyNewcomerApp','notifyMplusNewcomer','notificationRoute','console','setTimeout','clearTimeout',source);
 run(Deno,()=>db,jpeg,storePhoto,makeNewcomerHandler,()=>async()=>({church:'M+',channel:'2011645391',subject:'U'+'1'.repeat(32)}),{'M+':'2011645391'},async()=>{if(notificationHangs)return new Promise(()=>{});if(lineFails)throw Error('synthetic_review_notification_outage');},async()=>{if(appFails)throw Error('synthetic_app_outage');return {status:'stored'};},async()=>{if(notificationHangs)return new Promise(()=>{});if(lineFails)throw Error('synthetic_line_outage');return {status:'sent'};},async()=>({app:true,line:true}),{warn:x=>warnings.push(x)},notificationHangs?((fn,ms)=>setTimeout(fn,ms===5000?1:ms)):setTimeout,clearTimeout);
 const body={kind:'newcomer',church:'M+',request_id:crypto.randomUUID(),name:'合成完整送出',phone:'0900000000',idToken:'synthetic-id-token',photo:'data:image/jpeg;base64,AQID',...(review?{claimToken:crypto.randomUUID(),claimReview:true}:{})};
 const submit=()=>handler(new Request(origin,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 return {submit,rows,objects,warnings,state};
}
test('deployed entry returns saved success even when LINE notification throws after photo upload',async()=>{const f=fixture({lineFails:true});const r=await f.submit();assert.equal(r.status,201);assert.deepEqual(await r.json(),{accepted:true,lineBound:true});assert.equal(f.rows.size,1);assert.equal(f.objects.size,1);assert.equal(f.warnings.length,1);});
test('deployed entry does not turn a committed registration into failure when App notification throws',async()=>{const f=fixture({appFails:true});const r=await f.submit();assert.equal(r.status,201);assert.equal(f.rows.size,1);assert.equal(f.warnings.length,1);});
test('photo upload failure remains retryable with the same immutable request and one member',async()=>{const f=fixture({photoFails:true});assert.equal((await f.submit()).status,503);assert.equal(f.rows.size,1);assert.equal(f.objects.size,0);f.state.photoFails=false;assert.equal((await f.submit()).status,201);assert.equal(f.rows.size,1);assert.equal(f.objects.size,1);});
test('same-request retries verify existing photo bytes and do not create another member or image',async()=>{const f=fixture();assert.equal((await f.submit()).status,201);assert.equal((await f.submit()).status,201);assert.equal(f.rows.size,1);assert.equal(f.objects.size,1);assert.equal(f.state.photos,2);});

test('unresponsive notifications cannot keep a fully saved registration pending indefinitely',async()=>{const f=fixture({notificationHangs:true});const r=await f.submit();assert.equal(r.status,201);assert.equal(f.rows.size,1);assert.equal(f.objects.size,1);assert.equal(f.warnings.length,1);});

test('pending review stores the submitted photo before acknowledging the form, without claiming binding',async()=>{const f=fixture({review:true});const r=await f.submit();assert.equal(r.status,202);assert.deepEqual(await r.json(),{accepted:true,pendingReview:true});assert.equal(f.objects.size,1);});
test('pending review notification timeouts do not block saved form/photo acknowledgement',async()=>{const f=fixture({review:true,notificationHangs:true});const r=await f.submit();assert.equal(r.status,202);assert.equal(f.objects.size,1);assert.equal(f.warnings.length,1);});
test('pending review photo failure can retry the same proposal and save exactly one image',async()=>{const f=fixture({review:true,photoFails:true});assert.equal((await f.submit()).status,503);assert.equal(f.objects.size,0);f.state.photoFails=false;assert.equal((await f.submit()).status,202);assert.equal(f.rows.size,1);assert.equal(f.objects.size,1);});
