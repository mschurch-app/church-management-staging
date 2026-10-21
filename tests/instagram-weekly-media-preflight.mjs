import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/instagram-publishing/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function publishReel('),end=source.indexOf('\nasync function publishSermon(',start);
assert(start>=0&&end>start);
const code=stripTypeScriptTypes(source.slice(start,end));
const id='11111111-1111-4111-8111-111111111111',path=`M+/weekly/${id}/reel.mp4`,cover=`M+/weekly/${id}/cover.jpg`;
let missing=false;
const bulletin={id,church_id:'M+',version:1,status:'approved',reel_enabled:true,reel_video_path:path,reel_cover_image_path:cover};
const db={
 from(table){
  const query={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:table==='website_weekly_bulletins'?bulletin:table==='website_weekly_promos'?null:null,error:null})};
  return query;
 },
 storage:{from(bucket){assert.equal(bucket,'church-website-public-media');return {info:async file=>({data:missing&&file===path?null:{size:1024},error:missing&&file===path?Error('missing'):null})};}},
};
const publish=vm.runInNewContext(`${code}\npublishReel`,{String,Number,Date,Error,publishingEnabled:async()=>true});
missing=true;
await assert.rejects(()=>publish(db,'key','M+',id,'reviewer'),/reel_media_missing/);
missing=false;
await assert.rejects(()=>publish(db,'key','M+',id,'reviewer'),/not_connected/);
console.log('weekly Instagram media preflight: missing and present objects checked');
