import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/instagram-publishing/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function publishSermon('),end=source.indexOf('\nDeno.serve(',start);
assert(start>=0&&end>start);
const code=stripTypeScriptTypes(source.slice(start,end));
const draftId='b1b1b1b1-1111-4111-8111-111111111111';
const videoPath=`M+/sermons/${draftId}/${'a'.repeat(64)}.mp4`;
const coverUrl=`https://example.supabase.co/storage/v1/object/public/church-website-public-media/M%2B/sermons/${draftId}/${'b'.repeat(64)}.jpg`;

async function publish(previous=null){
 const calls=[],writes=[];
 const rows={
  sermon_social_drafts:{id:draftId,church_id:'M+',service_date:'2026-08-09',sermon_title:'浪子回頭',speaker:'吳俊璋',caption:'講道貼文',status:'approved',review_stage:'completed',social_media_type:'reel',social_video_path:videoPath,social_image_url:coverUrl},
  instagram_publishing_connections:{instagram_user_id:'ig-user',access_token_ciphertext:'secret',access_token_iv:'iv',status:'connected'},
  sermon_social_publication_jobs:previous,
 };
 const db={
  from(table){const row=rows[table];const query={};for(const method of ['select','eq'])query[method]=()=>query;query.maybeSingle=async()=>({data:row,error:null});query.single=async()=>({data:{id:'job'},error:null});query.upsert=value=>{writes.push({table,value});return query;};query.update=value=>{writes.push({table,value});return query;};return query;},
  storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'https://media.example/sermon.mp4'}})})},
 };
 const graph=async(path,_token,method,parameters)=>{calls.push({path,method,parameters});if(path.endsWith('/media_publish'))return {id:'published-id'};if(method==='GET')return {status_code:'FINISHED'};return {id:'container-id'};};
 const context={Date,Error,String,RegExp,console,publishingEnabled:async()=>true,allowedSermonImageUrl:()=>true,allowedSermonVideoPath:()=>true,decryptToken:async()=> 'token',graph,wait:async()=>{},apiErrorCode:()=> 'instagram_api'};
 const fn=vm.runInNewContext(`${code}\npublishSermon`,context);
 return {result:await fn(db,'service-key','M+',draftId,'reviewer'),calls,writes};
}

const first=await publish();
assert.equal(first.result.status,'published');
assert.equal(first.calls[0].parameters.media_type,'REELS');
assert.equal(first.calls[0].parameters.video_url,'https://media.example/sermon.mp4');
assert.equal(first.calls[0].parameters.cover_url,coverUrl);
assert.equal(first.writes.find(row=>row.table==='sermon_social_publication_jobs'&&row.value.media_type)?.value.video_path,videoPath);

const duplicate=await publish({status:'published',instagram_media_id:'previous-id'});
assert.equal(duplicate.result.mediaId,'previous-id');
assert.equal(duplicate.calls.length,0);
assert.equal(duplicate.writes.length,0);
