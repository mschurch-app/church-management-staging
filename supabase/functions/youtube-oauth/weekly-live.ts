import {weeklyMetadata} from '../../../weekly-youtube-content.mjs';
type Context={db:any;url:string};
const LIVE_PART='snippet,status,contentDetails';
const UPCOMING=new Set(['created','ready']);
const dateTW=(s:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
const compact=(s:unknown,max=5000)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,max);
const idPattern=/^[A-Za-z0-9_-]{11}$/;
function error(code:string){throw new Error(code);}
async function google(token:string,path:string,init:RequestInit={}){
 const response=await fetch('https://www.googleapis.com/'+path,{...init,headers:{authorization:`Bearer ${token}`,...init.headers},signal:AbortSignal.timeout(25000)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)error('youtube_'+(result.error?.errors?.[0]?.reason||response.status));
 return result;
}
async function connection(c:Context){const r=await c.db.from('youtube_oauth_connections').select('channel_id,channel_title,status').eq('church_id','M+').maybeSingle();if(r.error)error('database');if(!r.data||r.data.status!=='connected')error('not_connected');return r.data;}
async function checkChannel(token:string,channelId:string){const result=await google(token,'youtube/v3/channels?part=id&mine=true');if(!result.items?.some((r:any)=>r.id===channelId))error('channel_mismatch');}
function candidate(item:any){return {id:item.id,title:item.snippet?.title||'',scheduledStartTime:item.snippet?.scheduledStartTime||null,streamId:item.contentDetails?.boundStreamId||null,status:item.status?.lifeCycleStatus,url:'https://www.youtube.com/watch?v='+item.id};}
async function upcoming(token:string,channelId:string){
 const items:any[]=[];let page='';
 for(let i=0;i<4;i++){const result=await google(token,'youtube/v3/liveBroadcasts?part='+LIVE_PART+'&broadcastStatus=upcoming&broadcastType=all&maxResults=50'+(page?'&pageToken='+encodeURIComponent(page):''));items.push(...(result.items||[]).filter((r:any)=>r.snippet?.channelId===channelId&&UPCOMING.has(r.status?.lifeCycleStatus)&&!r.snippet?.actualStartTime).map(candidate));page=result.nextPageToken||'';if(!page)return items;}
 error('too_many_upcoming');
}
async function broadcast(token:string,id:string,channelId:string,serviceDate:string){
 if(!idPattern.test(id))error('select_broadcast');
 const result=await google(token,'youtube/v3/liveBroadcasts?part='+LIVE_PART+'&id='+id),item=result.items?.[0];
 if(!item||item.snippet?.channelId!==channelId)error('broadcast_not_found');
 if(!UPCOMING.has(item.status?.lifeCycleStatus)||item.snippet?.actualStartTime)error('broadcast_already_started');
 const time=item.snippet?.scheduledStartTime;if(time&&Date.parse(time)>Date.parse('2000-01-01')&&dateTW(time)!==serviceDate)error('broadcast_date_mismatch');
 return item;
}
async function runWeeklyLive(c:Context,body:any,getToken:()=>Promise<string>,permission:{editor:boolean;reviewer:boolean;internal:boolean}){
 if(!permission.editor&&!permission.internal)error('forbidden');
 const connected=await connection(c);
 if(body.action==='weekly_live_info'){
  const token=await getToken();await checkChannel(token,connected.channel_id);
  let video=null;
  if(idPattern.test(body.videoId||'')){const result=await google(token,'youtube/v3/videos?part=snippet&id='+body.videoId);const item=result.items?.[0];if(item?.snippet?.channelId===connected.channel_id)video={id:item.id,snippet:item.snippet};}
  return {connection:connected,candidates:await upcoming(token,connected.channel_id),video};
 }
 if(!/^[0-9a-f-]{36}$/i.test(body.bulletinId||''))error('invalid_request');
 const found=await c.db.from('website_weekly_bulletins').select('*').eq('church_id','M+').eq('id',body.bulletinId).maybeSingle();if(found.error||!found.data)error('bulletin_not_found');const row=found.data;
 if(body.action==='weekly_status'){
  const log=await c.db.from('weekly_youtube_publications').select('status,video_id,bulletin_version,metadata_synced_at,thumbnail_synced_at,verified_at,error_code,updated_at').eq('bulletin_id',row.id).maybeSingle();if(log.error)error('database');
  return {connection:connected,metadata:weeklyMetadata(row),publication:log.data};
 }
 if(body.action!=='weekly_sync')error('invalid_action');
 if(!permission.reviewer&&!permission.internal)error('reviewer_required');
 if(row.status!=='published')error('bulletin_not_approved');
 const today=dateTW(new Date().toISOString());if(row.service_date<today)error('past_bulletin');
 if(body.version!==undefined&&Number(body.version)!==row.version)error('bulletin_changed');
 if(!row.youtube_sync_enabled&&!body.enable) return {status:'disabled'};
 if(body.enable&&!permission.internal)error('forbidden');
 const token=await getToken();await checkChannel(token,connected.channel_id);
 let videoId=String(row.youtube_video_id||'');
 if((permission.internal||permission.reviewer)&&body.videoId)videoId=String(body.videoId);
 if(!videoId){
  const setting=await c.db.from('weekly_youtube_settings').select('preferred_stream_id').eq('church_id','M+').maybeSingle();if(setting.error)error('database');
  if(!setting.data?.preferred_stream_id)error('select_broadcast');
  const matches=(await upcoming(token,connected.channel_id)).filter(r=>r.streamId===setting.data.preferred_stream_id&&(!r.scheduledStartTime||Date.parse(r.scheduledStartTime)<Date.parse('2000-01-01')||dateTW(r.scheduledStartTime)===row.service_date));
  if(matches.length!==1)error('select_broadcast');videoId=matches[0].id;
 }
 const live=await broadcast(token,videoId,connected.channel_id,row.service_date);
 const occupied=await c.db.from('weekly_youtube_publications').select('bulletin_id').eq('video_id',videoId).neq('bulletin_id',row.id).limit(1);if(occupied.error)error('database');if(occupied.data?.length)error('broadcast_in_use');
 const metadata=weeklyMetadata(row);
 if(metadata.tags.join(',').length>450||metadata.tags.length>30)error('tags_too_long');
 const path=String(row.hero_image_path||'');if(!path.startsWith('M+/weekly/'+row.id+'/')||path.includes('..'))error('thumbnail_required');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([row.version,videoId,path,metadata])));
 const fp=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''),now=new Date().toISOString();
 const seed=await c.db.from('weekly_youtube_publications').upsert({bulletin_id:row.id,church_id:'M+',bulletin_version:row.version,video_id:videoId,fingerprint:fp,status:'pending'},{onConflict:'bulletin_id',ignoreDuplicates:true});if(seed.error)error('database');
 let prior=(await c.db.from('weekly_youtube_publications').select('*').eq('bulletin_id',row.id).single()).data;if(!prior)error('database');
 if(prior.fingerprint===fp&&prior.status==='synced')return {status:'synced',videoId,url:'https://www.youtube.com/watch?v='+videoId,alreadySynced:true};
 if(prior.lease_expires_at&&Date.parse(prior.lease_expires_at)>Date.now())error('sync_in_progress');
 const attempt=crypto.randomUUID(),record={bulletin_version:row.version,video_id:videoId,fingerprint:fp,status:'syncing',attempt_id:attempt,lease_expires_at:new Date(Date.now()+180000).toISOString(),updated_at:now,error_code:null,...(prior.fingerprint!==fp?{metadata_synced_at:null,thumbnail_synced_at:null,verified_at:null,previous_metadata:null}:{})};
 const claim=await c.db.from('weekly_youtube_publications').update(record).eq('bulletin_id',row.id).eq('fingerprint',prior.fingerprint).or('lease_expires_at.is.null,lease_expires_at.lt.'+now).select('*').maybeSingle();if(claim.error)error('database');if(!claim.data)error('sync_in_progress');prior=claim.data;
 const checkpoint=async(values:any)=>{const result=await c.db.from('weekly_youtube_publications').update({...values,updated_at:new Date().toISOString()}).eq('bulletin_id',row.id).eq('attempt_id',attempt).select('bulletin_id').maybeSingle();if(result.error||!result.data)error('sync_record_failed');};
 try{
  const image=await c.db.storage.from('church-website-public-media').download(path);if(image.error||!image.data)error('thumbnail_download_failed');
  const mime=image.data.type||(/\.png$/i.test(path)?'image/png':'image/jpeg');if(!['image/jpeg','image/png'].includes(mime)||image.data.size>50*1024*1024)error('thumbnail_format');
  const fresh=await c.db.from('website_weekly_bulletins').select('status,version,hero_image_path').eq('id',row.id).single();if(fresh.data?.status!=='published'||fresh.data.version!==row.version||fresh.data.hero_image_path!==path)error('bulletin_changed');
  await broadcast(token,videoId,connected.channel_id,row.service_date);
  const videos=await google(token,'youtube/v3/videos?part=snippet&id='+videoId),old=videos.items?.[0];if(!old?.snippet||old.snippet.channelId!==connected.channel_id)error('video_not_found');
  if(!prior.previous_metadata)await checkpoint({previous_metadata:old.snippet});
  if(!prior.metadata_synced_at){
   const snippet={...metadata,categoryId:old.snippet.categoryId,...(old.snippet.defaultLanguage?{defaultLanguage:old.snippet.defaultLanguage}:{}),...(old.snippet.defaultAudioLanguage?{defaultAudioLanguage:old.snippet.defaultAudioLanguage}:{})};
   await google(token,'youtube/v3/videos?part=snippet',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({id:videoId,snippet})});await checkpoint({metadata_synced_at:new Date().toISOString()});
  }
  if(!prior.thumbnail_synced_at){await broadcast(token,videoId,connected.channel_id,row.service_date);await google(token,'upload/youtube/v3/thumbnails/set?videoId='+videoId,{method:'POST',headers:{'content-type':mime},body:image.data});await checkpoint({thumbnail_synced_at:new Date().toISOString()});}
  let verified=false;
  for(let i=0;i<3;i++){
   const verify=await google(token,'youtube/v3/videos?part=snippet&id='+videoId),snippet=verify.items?.[0]?.snippet;
   verified=snippet?.title===metadata.title&&snippet?.description===metadata.description&&JSON.stringify([...(snippet?.tags||[])].sort())===JSON.stringify([...metadata.tags].sort());
   if(verified)break;if(i<2)await new Promise(resolve=>setTimeout(resolve,1500));
  }
  if(!verified)error('verification_pending');
  const bound=await c.db.from('website_weekly_bulletins').update({youtube_sync_enabled:true,youtube_video_id:videoId}).eq('id',row.id).eq('version',row.version).eq('status','published');if(bound.error)error('binding_save_failed');
  if(live.contentDetails?.boundStreamId){const preferred=await c.db.from('weekly_youtube_settings').upsert({church_id:'M+',preferred_stream_id:live.contentDetails.boundStreamId,updated_at:new Date().toISOString()});if(preferred.error)error('binding_save_failed');}
  await checkpoint({status:'synced',verified_at:new Date().toISOString(),lease_expires_at:null});
  return {status:'synced',videoId,url:'https://www.youtube.com/watch?v='+videoId,metadata,thumbnailPath:path};
 }catch(e){const code=e instanceof Error?e.message:'sync_failed';await checkpoint({status:'failed',error_code:code,lease_expires_at:null});throw e;}
}

export async function weeklyLive(c:Context,body:any,getToken:()=>Promise<string>,permission:{editor:boolean;reviewer:boolean;internal:boolean}){
 try{return await runWeeklyLive(c,body,getToken,permission);}catch(e){
  const code=e instanceof Error&&/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'sync_failed';
  if(body.action==='weekly_sync'&&(permission.reviewer||permission.internal)&&/^[0-9a-f-]{36}$/i.test(body.bulletinId||'')&&code!=='sync_in_progress'){
   const found=await c.db.from('website_weekly_bulletins').select('id,status,version,youtube_sync_enabled').eq('id',body.bulletinId).eq('church_id','M+').maybeSingle(),r=found.data;
   if(r?.status==='published'&&(r.youtube_sync_enabled||body.enable&&permission.internal)&&(body.version===undefined||Number(body.version)===r.version)){
    await c.db.from('weekly_youtube_publications').upsert({bulletin_id:r.id,church_id:'M+',bulletin_version:r.version,status:'failed',error_code:code},{onConflict:'bulletin_id',ignoreDuplicates:true});
    await c.db.from('weekly_youtube_publications').update({status:'failed',error_code:code,updated_at:new Date().toISOString()}).eq('bulletin_id',r.id).eq('bulletin_version',r.version).is('lease_expires_at',null).neq('status','synced');
   }
  }
  throw new Error(code);
 }
}
