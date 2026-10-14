import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const review=readFileSync(new URL('../supabase/functions/sermon-social-review/index.ts',import.meta.url),'utf8');
const youtube=readFileSync(new URL('../supabase/functions/youtube-oauth/index.ts',import.meta.url),'utf8');
function compiled(source,name,next,context){const start=source.indexOf(`async function ${name}(`),end=source.indexOf(next,start);assert(start>=0&&end>start);const code=stripTypeScriptTypes(source.slice(start,end));return vm.runInNewContext(`${code}\n${name}`,context);}
function chain(result){const q={};for(const op of ['select','eq','in','order','update','contains'])q[op]=()=>q;q.maybeSingle=async()=>({data:result});q.then=(resolve)=>Promise.resolve({error:null,data:result}).then(resolve);return q;}
const staff=[{id:'pastor',display_name:'牧師',line_subject:'U'+'a'.repeat(32)},{id:'wife-old',display_name:'師母',line_subject:null},{id:'wife-line',display_name:'師母',line_subject:'U'+'b'.repeat(32)}];
const finalIds=compiled(review,'finalNotificationIds','async function publicationForDraft',{Map});
const recipients=await finalIds({from:()=>({select:()=>({in:()=>({eq:async()=>({data:staff,error:null})})})})},staff.map(x=>x.id));
assert.deepEqual([...recipients],['pastor','wife-line']);

async function publicationCase({ready,igOk=true,connected=true,workflowStatus='approved'}){
 const calls=[],setting={instagram_sermon_enabled:true,youtube_captions_enabled:true},workflow={status:workflowStatus,edit_confirmed_at:'2026-10-14T01:00:00Z'};
 const db={from(table){if(table==='media_publishing_settings')return chain(setting);if(table==='sermon_youtube_workflows')return {...chain(workflow),upsert:async()=>({error:null})};if(table==='youtube_oauth_connections')return chain(connected?{status:'connected'}:null);if(table==='pastoral_tasks')return chain(null);throw Error(table)}};
 const context={Date,Error,JSON,String,APP:'https://mscos.mchurch.online',Deno:{env:{get:()=>''}},AbortSignal:{timeout:()=>undefined},fetch:async(_url,options)=>{calls.push(JSON.parse(options.body).action);return {ok:igOk,json:async()=>({ok:igOk,status:igOk?'published':'failed'})}},youtubeAction:async(_req,_id,action)=>{calls.push(action);return {ok:true}},subtitleState:async()=>({ready}),console};
 const fn=compiled(review,'publishApproved','function validArtwork',context);
 const result=await fn(db,{headers:{get:()=>''}},{id:'draft',youtube_caption_requested:true});
 return {result,calls};
}
let caseResult=await publicationCase({ready:false});
assert.equal(caseResult.result.instagram.status,'published');
assert.equal(caseResult.result.youtube.metadata,'updated');
assert.equal(caseResult.result.youtube.captions,'waiting_subtitles');
assert.deepEqual(caseResult.calls,['publish_sermon','update_sermon_metadata']);
caseResult=await publicationCase({ready:true});
assert.equal(caseResult.result.youtube.captions,'published');
assert.deepEqual(caseResult.calls,['publish_sermon','update_sermon_metadata','publish_subtitles']);
caseResult=await publicationCase({ready:false,connected:false});
assert.equal(caseResult.result.youtube.metadata,'waiting_connection');
assert.deepEqual(caseResult.calls,['publish_sermon']);
caseResult=await publicationCase({ready:false,igOk:false});
assert.equal(caseResult.result.instagram.status,'failed');
assert.equal(caseResult.result.youtube.metadata,'updated');
caseResult=await publicationCase({ready:true,workflowStatus:'published'});
assert.equal(caseResult.result.youtube.captions,'published');
assert.deepEqual(caseResult.calls,['publish_sermon','update_sermon_metadata']);

let autoCalls=[];const autoDb={from(table){if(table==='sermon_social_drafts')return chain({status:'approved',youtube_caption_requested:true});if(table==='sermon_subtitle_segments')return {...chain([{review_status:'completed'}])};if(table==='sermon_youtube_workflows')return chain({status:'approved',edit_confirmed_at:'2026-10-14T01:00:00Z'});if(table==='pastoral_tasks')return chain(null);throw Error(table)}};
const auto=compiled(youtube,'queueYoutubeReviewWhenReady','async function proofreadSubtitleSegment',{Date,Error,String,console,updateVideo:async()=>autoCalls.push('metadata'),publishSubtitles:async()=>autoCalls.push('captions')});
assert.equal(await auto({db:autoDb},'draft'),1);
assert.deepEqual(autoCalls,['metadata','captions']);
console.log('sermon review flow: recipients, final publishing, delayed caption upload passed');
