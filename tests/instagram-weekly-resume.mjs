import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/instagram-publishing/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function publishReel('),end=source.indexOf('\nasync function publishSermon(',start);
assert(start>=0&&end>start);
const publish=vm.runInNewContext(`${stripTypeScriptTypes(source.slice(start,end))}\npublishReel`,{
  String,Number,Date,Error,
  publishingEnabled:async()=>true,
  decryptToken:async()=> 'connected-token',
  graph:async(path,_token,method)=>{
    graphCalls.push({path,method});
    if(path===containerId)return {status_code:'FINISHED'};
    if(path==='ig-user/media_publish')return {id:'published-media'};
    throw new Error(`unexpected graph request: ${path}`);
  },
  wait:async()=>{},
  console,
});
const bulletinId='11111111-1111-4111-8111-111111111111',containerId='existing-container',path=`M+/weekly/${bulletinId}/reel.mp4`;
const graphCalls=[],updates=[];
const bulletin={id:bulletinId,church_id:'M+',version:12,status:'draft',title:'Sunday',service_date:'2026-10-25'};
const promo={status:'approved',version:1,snapshot:{reel_enabled:true,reel_video_path:path,reel_caption:'Approved Reel'}};
const db={
  from(table){
    return {
      select(){return this;},eq(){return this;},
      async maybeSingle(){return {error:null,data:({website_weekly_bulletins:bulletin,website_weekly_promos:promo,instagram_publishing_connections:{instagram_user_id:'ig-user',access_token_ciphertext:'cipher',access_token_iv:'iv'},instagram_publication_jobs:{status:'failed',instagram_media_id:null,container_id:containerId,media_path:path,attempt_count:1}})[table]};},
      upsert(value){assert.equal(table,'instagram_publication_jobs');assert.equal(value.container_id,containerId);assert.equal(value.attempt_count,2);return this;},
      async single(){return {error:null,data:{id:'job-id'}};},
      update(value){updates.push(value);return {eq:async()=>({error:null})};},
    };
  },
  storage:{from(){return {info:async()=>({data:{size:1024},error:null}),getPublicUrl:()=>({data:{publicUrl:'https://example.com/reel.mp4'}})};}},
};
const result=await publish(db,'key','M+',bulletinId,'reviewer');
assert.equal(result.status,'published');
assert.equal(result.mediaId,'published-media');
assert.deepEqual(graphCalls,[{path:containerId,method:'GET'},{path:'ig-user/media_publish',method:'POST'}]);
assert(updates.some(update=>update.status==='published'&&update.instagram_media_id==='published-media'));
console.log('weekly Instagram retry resumes existing container and publishes once');
