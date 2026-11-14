import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=await readFile(process.env.WEEKLY_REVIEW_SOURCE || new URL('../supabase/functions/weekly-bulletin-review/index.ts',import.meta.url),'utf8');
const script=stripTypeScriptTypes(source.replace(/^import .*;\s*$/gm,''));
const id='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';

async function run(options={}){
 const bulletin={id,church_id:options.church||'M+',service_date:'2026-11-15',title:'合成主日',status:options.stage||'pending_review',version:8,submitted_by:options.self?actor:'33333333-3333-4333-8333-333333333333',youtube_sync_enabled:true};
 const promo=options.legacy?null:{bulletin_id:id,status:'approved',version:1,snapshot:{youtube_sync_enabled:true},...options.promo};
 const jobs=[],requests=[],writes=[];let handler,publication=null;
 const result=(table,op,values)=>{
  if(op==='select')return {data:table==='website_weekly_bulletins'?{...bulletin}:table==='website_weekly_promos'?promo:table==='review_workflow_settings'&&options.initial?{initial_reviewer_id:actor}:table==='pastoral_staff'&&options.initial?{id:'synthetic-staff'}:null,error:null};
  writes.push({table,op,values});
  if(table==='website_weekly_bulletins')Object.assign(bulletin,values);
  if(table==='weekly_youtube_publications')publication={...publication,...values};
  return {data:table==='website_weekly_bulletins'?{id}:null,error:null};
 };
 const db={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async(name)=>({data:name==='get_weekly_bulletin_review_profile'?{editor:options.editor!==false,reviewer:options.reviewer!==false}:[],error:null}),from:table=>{
  let op='select',values;const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},contains(){return q;},is(){return q;},neq(){return q;},update(v){op='update';values=v;return q;},insert(v){op='insert';values=v;return q;},upsert(v){op='upsert';values=v;return q;},maybeSingle:async()=>result(table,op,values),then:(resolve,reject)=>Promise.resolve(result(table,op,values)).then(resolve,reject)};return q;
 }};
 vm.runInNewContext(script,{createClient:()=>db,Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':'synthetic'},serve:fn=>handler=fn},EdgeRuntime:{waitUntil:job=>jobs.push(job)},Request,Response,Headers,AbortSignal,Date,console,notifyStaffDual:async()=>{throw Error('unexpected_notification');},ACCOUNTING_SECTION_KEY:'offering_accounting',accountingSnapshotMatches:()=>true,loadWeeklyOfferingPreview:async()=>({}),fetch:async(url,init)=>{assert.equal(url,'https://fixture.invalid/functions/v1/youtube-oauth');requests.push(JSON.parse(init.body));return Response.json(options.failure?{ok:false,error:'youtube_quotaExceeded'}:{ok:true,status:'synced'},{status:options.failure?503:200});}});
 const response=await handler(new Request('https://fixture.invalid/weekly-bulletin-review',{method:'POST',headers:{origin:options.origin||'https://mscos.mchurch.online',...(options.unauthenticated?{}:{authorization:'Bearer synthetic-reviewer'}),'content-type':'application/json'},body:JSON.stringify({action:options.action||'approve',church:bulletin.church_id,bulletinId:id,version:options.version??8,comment:options.action==='request_changes'?'請補充內容':''})}));
 const body=await response.json();await Promise.all(jobs);return {status:response.status,body,requests,writes,bulletin,publication};
}

test('approved promo before bulletin publication resumes at publication with promo version 1, not bulletin version 8',async()=>{
 const r=await run();assert.equal(r.status,200);assert.equal(r.body.status,'published');assert.equal(r.body.youtubeQueued,true);assert.deepEqual(r.requests,[{action:'weekly_sync',church:'M+',bulletinId:id,version:1}]);assert.equal(r.publication.bulletin_version,1);
});
test('legacy publication keeps the original version and source',async()=>{const r=await run({legacy:true});assert.equal(r.requests[0].version,8);});
test('unapproved or disabled promos cannot trigger YouTube, even if the editable bulletin flag is true',async()=>{
 for(const promo of [{status:'pending_review'},{snapshot:{youtube_sync_enabled:false}}]){const r=await run({promo});assert.equal(r.body.youtubeQueued,false);assert.equal(r.requests.length,0);}
});
test('initial approval and return never publish YouTube',async()=>{
 const returned=await run({action:'request_changes'});assert.equal(returned.requests.length,0);assert.equal(returned.bulletin.status,'changes_requested');
 const initial=await run({stage:'pending_initial',reviewer:false,initial:true});assert.equal(initial.requests.length,0);assert.equal(initial.status,200);assert.equal(initial.bulletin.status,'pending_review');
});
test('wrong church, stale version and unauthorized approvals never queue YouTube',async()=>{
 for(const options of [{church:'SHiNE'},{version:7},{reviewer:false},{editor:false},{unauthenticated:true},{self:true},{origin:'https://untrusted.invalid'}]){const r=await run(options);assert.equal(r.requests.length,0);if(options.church!=='SHiNE')assert(r.status>=400);}
});
test('delivery failure is recorded for the actual approved source and does not fake a successful sync',async()=>{const r=await run({failure:true});assert.equal(r.body.status,'published');assert.equal(r.publication.status,'failed');assert.equal(r.publication.bulletin_version,1);assert.equal(r.publication.error_code,'youtube_quotaExceeded');});
