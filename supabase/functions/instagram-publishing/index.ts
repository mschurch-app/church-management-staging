import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const APP_ORIGIN='https://mscos.mchurch.online';
const headers=(origin:string)=>({
  ...(origin===APP_ORIGIN?{'access-control-allow-origin':origin}:{}),
  'access-control-allow-headers':'authorization,content-type,apikey',
  'access-control-allow-methods':'POST,OPTIONS',
  'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
});
const json=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
const bytesToBase64=(bytes:Uint8Array)=>{let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value);};
const base64ToBytes=(value:string)=>Uint8Array.from(atob(value),character=>character.charCodeAt(0));

function adminClient(){
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!key)throw new Error('config');
  return {db:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),serviceKey:key};
}
async function currentUser(request:Request,db:ReturnType<typeof createClient>){
  const token=(request.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!token)return null;const result=await db.auth.getUser(token);return result.error?null:result.data.user;
}
async function permissions(db:ReturnType<typeof createClient>,userId:string,church:string){
  const result=await db.rpc('get_weekly_bulletin_review_profile',{p_user:userId,p_church:church});
  return {editor:result.data?.editor===true,reviewer:result.data?.reviewer===true};
}
async function encryptionKey(serviceKey:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${serviceKey}:instagram-publishing:v1`));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt']);
}
async function encryptToken(token:string,serviceKey:string){
  const iv=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(serviceKey);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token));
  return {ciphertext:bytesToBase64(new Uint8Array(encrypted)),iv:bytesToBase64(iv)};
}
async function decryptToken(ciphertext:string,iv:string,serviceKey:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${serviceKey}:instagram-publishing:v1`));
  const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['decrypt']);
  const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv)},key,base64ToBytes(ciphertext));
  return new TextDecoder().decode(value);
}
async function instagramProfile(token:string){
  const url=new URL('https://graph.instagram.com/me');
  url.searchParams.set('fields','user_id,username,name,account_type');
  const response=await fetch(url,{headers:{authorization:`Bearer ${token}`,'user-agent':'MPlusChurchOS/1.0'},signal:AbortSignal.timeout(12000),redirect:'error'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.username||!(data.user_id||data.id))throw new Error('invalid_token');
  return {id:String(data.user_id||data.id),username:String(data.username),accountType:String(data.account_type||'PROFESSIONAL')};
}
const wait=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function graph(path:string,token:string,method='GET',parameters:Record<string,string>={}){
  const url=new URL(`https://graph.instagram.com/v24.0/${path}`),options:RequestInit={method,headers:{authorization:`Bearer ${token}`,'user-agent':'MPlusChurchOS/1.0'},signal:AbortSignal.timeout(15000),redirect:'error'};
  if(method==='GET')for(const [key,value] of Object.entries(parameters))url.searchParams.set(key,value);
  else{options.headers={...options.headers,'content-type':'application/x-www-form-urlencoded'};options.body=new URLSearchParams(parameters);}
  const response=await fetch(url,options),data=await response.json().catch(()=>({}));
  if(!response.ok||data?.error){const error=new Error('instagram_api');(error as Error&{details?:unknown}).details=data?.error||data;throw error;}
  return data;
}
function apiErrorCode(error:unknown){const known=(error as Error)?.message;if(known==='instagram_processing'||known==='instagram_timeout'||known==='instagram_already_published')return known;const details=(error as Error&{details?:{code?:number;error_subcode?:number}})?.details;if(details?.code===10||details?.code===200)return 'permission_missing';if(details?.code===190)return 'token_expired';return 'instagram_api';}
async function publishingEnabled(db:ReturnType<typeof createClient>,church:string,field:'instagram_sermon_enabled'|'instagram_weekly_reel_enabled'){
  const result=await db.from('media_publishing_settings').select(field).eq('church_id',church).maybeSingle();
  if(result.error)throw new Error('publishing_settings_unavailable');
  return result.data?.[field]===true;
}
function allowedSermonImageUrl(value:string,draftId:string,church:string){
  try{
    const image=new URL(value),storage=new URL(Deno.env.get('SUPABASE_URL')||'');
    if(image.protocol!=='https:'||image.username||image.password||image.search||image.hash)return false;
    if(image.origin===APP_ORIGIN)return true;
    const prefix=`/storage/v1/object/public/church-website-public-media/${encodeURIComponent(church)}/sermons/${draftId}/`,file=image.pathname.slice(prefix.length);
    return image.origin===storage.origin&&image.pathname.startsWith(prefix)&&/^[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)$/i.test(file);
  }catch{return false;}
}
function allowedSermonVideoPath(value:string,draftId:string,church:string){
  return new RegExp(`^${church.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/sermons/${draftId}/[a-f0-9]{64}\\.mp4$`,'i').test(value);
}
async function publishReel(db:ReturnType<typeof createClient>,serviceKey:string,church:string,bulletinId:string,userId:string){
  if(!await publishingEnabled(db,church,'instagram_weekly_reel_enabled'))throw new Error('publishing_disabled');
  const bulletinResult=await db.from('website_weekly_bulletins').select('id,church_id,version,status,reel_enabled,reel_video_path,reel_cover_image_path,reel_caption,title,service_date').eq('id',bulletinId).eq('church_id',church).maybeSingle();
  if(bulletinResult.error||!bulletinResult.data)throw new Error('bulletin_not_found');
  const promoResult=await db.from('website_weekly_promos').select('status,version,snapshot').eq('bulletin_id',bulletinId).eq('church_id',church).maybeSingle();
  if(promoResult.error)throw new Error('promo_unavailable');
  const promo=promoResult.data,bulletin=promo?{...bulletinResult.data,...promo.snapshot,version:promo.version,status:promo.status}:bulletinResult.data;
  if(bulletin.status!=='published'&&bulletin.status!=='approved')throw new Error('promo_not_approved');
  if(!bulletin.reel_enabled||!bulletin.reel_video_path)return {status:'skipped'};
  const mediaPrefix=`${church}/weekly/${bulletin.id}/`,storage=db.storage.from('church-website-public-media');
  if(!String(bulletin.reel_video_path).startsWith(mediaPrefix)||!String(bulletin.reel_video_path).endsWith('.mp4')||bulletin.reel_cover_image_path&&!String(bulletin.reel_cover_image_path).startsWith(mediaPrefix))throw new Error('reel_media_missing');
  const videoInfo=await storage.info(bulletin.reel_video_path),coverInfo=bulletin.reel_cover_image_path?await storage.info(bulletin.reel_cover_image_path):null;
  if(videoInfo.error||!(Number(videoInfo.data?.size)>0)||coverInfo&&(coverInfo.error||!(Number(coverInfo.data?.size)>0)))throw new Error('reel_media_missing');
  const connectionResult=await db.from('instagram_publishing_connections').select('*').eq('church_id',church).eq('status','connected').maybeSingle(),connection=connectionResult.data;
  if(connectionResult.error||!connection)throw new Error('not_connected');
  const caption=String(bulletin.reel_caption||`${bulletin.title}\n${bulletin.service_date}\n\n#Mplus大雅教會 #主日週報 #台中教會`).slice(0,2200),now=new Date().toISOString();
  const previous=await db.from('instagram_publication_jobs').select('status,instagram_media_id,container_id,media_path,attempt_count,started_at').eq('bulletin_id',bulletin.id).eq('bulletin_version',bulletin.version).maybeSingle();
  if(previous.data?.status==='published'&&previous.data.instagram_media_id)return {status:'published',mediaId:previous.data.instagram_media_id};
  if(previous.data?.status==='processing'&&Date.now()-new Date(previous.data.started_at||0).getTime()<120000)return {status:'processing'};
  const reusableContainer=previous.data?.media_path===bulletin.reel_video_path?String(previous.data?.container_id||''):'';
  const queued=await db.from('instagram_publication_jobs').upsert({church_id:church,bulletin_id:bulletin.id,bulletin_version:bulletin.version,media_path:bulletin.reel_video_path,caption,status:'processing',requested_by:userId,requested_at:now,started_at:now,updated_at:now,attempt_count:Number(previous.data?.attempt_count||0)+1,container_id:reusableContainer||null,error_code:null},{onConflict:'bulletin_id,bulletin_version'}).select('id,status,instagram_media_id').single();
  if(queued.error||!queued.data)throw new Error('job_store');
  try{
    const token=await decryptToken(connection.access_token_ciphertext,connection.access_token_iv,serviceKey),videoUrl=db.storage.from('church-website-public-media').getPublicUrl(bulletin.reel_video_path).data.publicUrl;
    const coverUrl=bulletin.reel_cover_image_path?db.storage.from('church-website-public-media').getPublicUrl(bulletin.reel_cover_image_path).data.publicUrl:null;
    const created=reusableContainer?null:await graph(`${connection.instagram_user_id}/media`,token,'POST',{media_type:'REELS',video_url:videoUrl,caption,share_to_feed:'true',...(coverUrl?{cover_url:coverUrl}:{})}),containerId=reusableContainer||String(created?.id||'');
    if(!containerId)throw new Error('instagram_api');
    await db.from('instagram_publication_jobs').update({container_id:containerId,updated_at:new Date().toISOString()}).eq('id',queued.data.id);
    let ready=false;
    for(let attempt=0;attempt<20;attempt++){if(attempt)await wait(2000);const state=await graph(containerId,token,'GET',{fields:'status_code,status'});if(state.status_code==='FINISHED'){ready=true;break;}if(state.status_code==='PUBLISHED')throw new Error('instagram_already_published');if(['ERROR','EXPIRED'].includes(state.status_code))throw new Error('instagram_processing');}
    if(!ready)throw new Error('instagram_timeout');
    const published=await graph(`${connection.instagram_user_id}/media_publish`,token,'POST',{creation_id:containerId}),mediaId=String(published.id||'');
    if(!mediaId)throw new Error('instagram_api');
    await db.from('instagram_publication_jobs').update({status:'published',instagram_media_id:mediaId,published_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('id',queued.data.id);
    return {status:'published',mediaId};
  }catch(error){const code=apiErrorCode(error),details=(error as Error&{details?:{code?:number;error_subcode?:number}})?.details;console.error('weekly_reel_publish_failed',{code,metaCode:details?.code||null,metaSubcode:details?.error_subcode||null,containerId:reusableContainer||null});await db.from('instagram_publication_jobs').update({status:'failed',error_code:code,updated_at:new Date().toISOString()}).eq('id',queued.data.id);if(code==='token_expired')await db.from('instagram_publishing_connections').update({status:'expired',last_error:code,updated_at:new Date().toISOString()}).eq('church_id',church);throw new Error(code);}
}

async function publishSermon(db:ReturnType<typeof createClient>,serviceKey:string,church:string,draftId:string,userId:string|null){
  if(!await publishingEnabled(db,church,'instagram_sermon_enabled'))throw new Error('publishing_disabled');
  const draftResult=await db.from('sermon_social_drafts').select('id,church_id,service_date,sermon_title,speaker,caption,status,review_stage,social_media_type,social_video_path,social_image_url').eq('id',draftId).eq('church_id',church).maybeSingle(),draft=draftResult.data;
  if(draftResult.error||!draft)throw new Error('sermon_not_found');
  if(draft.status!=='approved'||draft.review_stage!=='completed')throw new Error('sermon_not_approved');
  if(!allowedSermonImageUrl(String(draft.social_image_url||''),draft.id,church))throw new Error('sermon_image_missing');
  const isReel=draft.social_media_type==='reel';
  if(isReel&&!allowedSermonVideoPath(String(draft.social_video_path||''),draft.id,church))throw new Error('sermon_video_missing');
  const connectionResult=await db.from('instagram_publishing_connections').select('*').eq('church_id',church).eq('status','connected').maybeSingle(),connection=connectionResult.data;
  if(connectionResult.error||!connection)throw new Error('not_connected');
  const previous=await db.from('sermon_social_publication_jobs').select('status,instagram_media_id').eq('draft_id',draft.id).maybeSingle();
  if(previous.data?.status==='published'&&previous.data.instagram_media_id)return {status:'published',mediaId:previous.data.instagram_media_id};
  const caption=String(draft.caption||`${draft.sermon_title}\n${draft.speaker||''}\n${draft.service_date}\n\n#Mplus大雅教會 #主日講道 #台中教會`).slice(0,2200),now=new Date().toISOString();
  const queued=await db.from('sermon_social_publication_jobs').upsert({draft_id:draft.id,church_id:church,image_url:draft.social_image_url,media_type:isReel?'reel':'image',video_path:isReel?draft.social_video_path:null,caption,status:'processing',attempt_count:1,requested_by:userId,requested_at:now,started_at:now,error_code:null,updated_at:now},{onConflict:'draft_id'}).select('id').single();
  if(queued.error||!queued.data)throw new Error('job_store');
  try{
    const token=await decryptToken(connection.access_token_ciphertext,connection.access_token_iv,serviceKey);
    const media=isReel?{media_type:'REELS',video_url:db.storage.from('church-website-public-media').getPublicUrl(draft.social_video_path).data.publicUrl,cover_url:draft.social_image_url,caption,share_to_feed:'true'}:{image_url:draft.social_image_url,caption};
    const created=await graph(`${connection.instagram_user_id}/media`,token,'POST',media),containerId=String(created.id||'');
    if(!containerId)throw new Error('instagram_api');
    await db.from('sermon_social_publication_jobs').update({container_id:containerId,updated_at:new Date().toISOString()}).eq('id',queued.data.id);
    let ready=false;
    for(let attempt=0;attempt<(isReel?20:15);attempt++){const state=await graph(containerId,token,'GET',{fields:'status_code,status'});if(state.status_code==='FINISHED'){ready=true;break;}if(['ERROR','EXPIRED'].includes(state.status_code))throw new Error('instagram_processing');await wait(isReel?2000:1500);}
    if(!ready)throw new Error('instagram_timeout');
    const published=await graph(`${connection.instagram_user_id}/media_publish`,token,'POST',{creation_id:containerId}),mediaId=String(published.id||'');
    if(!mediaId)throw new Error('instagram_api');
    await db.from('sermon_social_publication_jobs').update({status:'published',instagram_media_id:mediaId,published_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('id',queued.data.id);
    return {status:'published',mediaId};
  }catch(error){const code=apiErrorCode(error);await db.from('sermon_social_publication_jobs').update({status:'failed',error_code:code,updated_at:new Date().toISOString()}).eq('id',queued.data.id);if(code==='token_expired')await db.from('instagram_publishing_connections').update({status:'expired',last_error:code,updated_at:new Date().toISOString()}).eq('church_id',church);throw new Error(code);}
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return origin===APP_ORIGIN?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false,error:'forbidden'},403);
  if(request.method!=='POST')return json(origin,{ok:false,error:'forbidden'},403);
  let client;try{client=adminClient();}catch{return json(origin,{ok:false,error:'unavailable'},503);}
  const body=await request.json().catch(()=>null),church=body?.church;
  if(!body||!['M+','SHiNE'].includes(church)||typeof body.action!=='string')return json(origin,{ok:false,error:'invalid_request'},400);
  const cronSecret=request.headers.get('x-cron-secret')||'',internal=Boolean(cronSecret)&&(await client.db.rpc('pastoral_validate_care_cron_secret',{p_secret:cronSecret})).data===true;
  if(origin!==APP_ORIGIN&&!internal)return json(origin,{ok:false,error:'forbidden'},403);
  const user=internal?null:await currentUser(request,client.db);if(!internal&&!user)return json(origin,{ok:false,error:'login_required'},401);
  const rights=internal?{editor:true,reviewer:true}:await permissions(client.db,user!.id,church);
  if(!(body.action==='save_reel'?rights.editor:body.action==='publication_status'?(rights.editor||rights.reviewer):rights.reviewer))return json(origin,{ok:false,error:'forbidden'},403);
  try{
    if(body.action==='status'){
      const result=await client.db.from('instagram_publishing_connections').select('username,instagram_user_id,account_type,status,connected_at,last_verified_at,last_error').eq('church_id',church).maybeSingle();
      if(result.error)throw result.error;
      return json(origin,{ok:true,connection:result.data||null});
    }
    if(body.action==='connect'){
      const token=String(body.accessToken||'').trim();
      if(token.length<40||token.length>4096)return json(origin,{ok:false,error:'invalid_token'},400);
      const profile=await instagramProfile(token),encrypted=await encryptToken(token,client.serviceKey),now=new Date().toISOString();
      const saved=await client.db.from('instagram_publishing_connections').upsert({church_id:church,instagram_user_id:profile.id,username:profile.username,account_type:profile.accountType,access_token_ciphertext:encrypted.ciphertext,access_token_iv:encrypted.iv,status:'connected',connected_by:user!.id,connected_at:now,last_verified_at:now,last_error:null,updated_at:now},{onConflict:'church_id'});
      if(saved.error)throw saved.error;
      return json(origin,{ok:true,connection:{username:profile.username,instagram_user_id:profile.id,account_type:profile.accountType,status:'connected',connected_at:now,last_verified_at:now}});
    }
    if(body.action==='disconnect'){
      const result=await client.db.from('instagram_publishing_connections').delete().eq('church_id',church);
      if(result.error)throw result.error;return json(origin,{ok:true,connection:null});
    }
    if(body.action==='save_reel'){
      const bulletinId=String(body.bulletinId||''),videoPath=String(body.reelVideoPath||''),audioPath=body.reelAudioPath?String(body.reelAudioPath):null,caption=String(body.reelCaption||'').trim().slice(0,2200),audioStart=Math.max(0,Math.min(86400,Number(body.reelAudioStart)||0));
      const version=Number(body.version);
      if(!/^[0-9a-f-]{36}$/i.test(bulletinId)||!Number.isInteger(version)||version<1||!videoPath.startsWith(`${church}/weekly/${bulletinId}/`)||!videoPath.endsWith('.mp4')||(audioPath&&!audioPath.startsWith(`${church}/reel-music/`)))return json(origin,{ok:false,error:'invalid_request'},400);
      const latest=await client.db.from('website_weekly_bulletins').select('version,status,service_date,hero_image_path,sermon_topic,sermon_scripture,sermon_speaker').eq('id',bulletinId).eq('church_id',church).maybeSingle();
      if(latest.error||!latest.data)return json(origin,{ok:false,error:'not_found'},404);
      if(!['draft','changes_requested'].includes(latest.data.status))return json(origin,{ok:false,error:'bulletin_locked'},409);
      const source=body.source||{};
      if(source.heroImagePath){
        if(source.heroImagePath!==latest.data.hero_image_path||source.serviceDate!==latest.data.service_date||source.topic!==latest.data.sermon_topic||source.scripture!==latest.data.sermon_scripture||source.speaker!==latest.data.sermon_speaker)return json(origin,{ok:false,error:'source_changed'},409);
      }else if(version!==latest.data.version)return json(origin,{ok:false,error:'conflict'},409);
      const saved=await client.db.from('website_weekly_bulletins').update({reel_enabled:body.reelEnabled!==false,reel_video_path:videoPath,reel_audio_path:audioPath,reel_audio_start_seconds:audioStart,reel_caption:caption,version:latest.data.version+1,updated_by:user!.id,updated_at:new Date().toISOString()}).eq('id',bulletinId).eq('church_id',church).eq('version',latest.data.version).in('status',['draft','changes_requested']).select('id,church_id,service_date,title,subtitle,service_time,sermon_topic,sermon_scripture,sermon_speaker,speaker_photo_path,hero_image_path,reel_cover_image_path,sections,schedule_overrides,status,version,created_by,updated_at,published_at,review_comment,reel_enabled,reel_video_path,reel_caption,reel_audio_path,reel_audio_start_seconds').maybeSingle();
      if(saved.error||!saved.data)return json(origin,{ok:false,error:'conflict'},409);
      return json(origin,{ok:true,bulletin:saved.data});
    }
    if(body.action==='publication_status'){
      const result=await client.db.from('instagram_publication_jobs').select('status,instagram_media_id,error_code,requested_at,published_at,updated_at').eq('church_id',church).eq('bulletin_id',String(body.bulletinId||'')).order('requested_at',{ascending:false}).limit(1).maybeSingle();
      if(result.error)throw result.error;return json(origin,{ok:true,publication:result.data||null});
    }
    if(body.action==='publish'){
      const bulletinId=String(body.bulletinId||'');if(!/^[0-9a-f-]{36}$/i.test(bulletinId))return json(origin,{ok:false,error:'invalid_request'},400);
      const result=await publishReel(client.db,client.serviceKey,church,bulletinId,user!.id);return json(origin,{ok:true,...result});
    }
    if(body.action==='publish_sermon'){
      const draftId=String(body.draftId||'');if(!/^[0-9a-f-]{36}$/i.test(draftId))return json(origin,{ok:false,error:'invalid_request'},400);
      const result=await publishSermon(client.db,client.serviceKey,church,draftId,user?.id||null);return json(origin,{ok:true,...result});
    }
    return json(origin,{ok:false,error:'invalid_action'},400);
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const safeErrors=new Set(['invalid_token','publishing_disabled','not_connected','permission_missing','token_expired','sermon_image_missing','sermon_video_missing','sermon_not_approved','reel_media_missing','job_store','instagram_api','instagram_processing','instagram_timeout','instagram_already_published','publishing_settings_unavailable']);
    const code=safeErrors.has(message)?message:'unavailable';
    return json(origin,{ok:false,error:code},code==='invalid_token'?400:code==='publishing_disabled'?409:503);
  }
});
