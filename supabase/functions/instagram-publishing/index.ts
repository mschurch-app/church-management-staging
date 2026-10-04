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
async function canManage(db:ReturnType<typeof createClient>,userId:string,church:string){
  const result=await db.rpc('get_weekly_bulletin_review_profile',{p_user:userId,p_church:church});
  return result.data?.reviewer===true;
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
function apiErrorCode(error:unknown){const details=(error as Error&{details?:{code?:number;error_subcode?:number}})?.details;if(details?.code===10||details?.code===200)return 'permission_missing';if(details?.code===190)return 'token_expired';return 'instagram_api';}
async function publishReel(db:ReturnType<typeof createClient>,serviceKey:string,church:string,bulletinId:string,userId:string){
  const bulletinResult=await db.from('website_weekly_bulletins').select('id,church_id,version,status,reel_enabled,reel_video_path,reel_caption,title,service_date').eq('id',bulletinId).eq('church_id',church).maybeSingle(),bulletin=bulletinResult.data;
  if(bulletinResult.error||!bulletin)throw new Error('bulletin_not_found');
  if(bulletin.status!=='published')throw new Error('bulletin_not_published');
  if(!bulletin.reel_enabled||!bulletin.reel_video_path)return {status:'skipped'};
  const connectionResult=await db.from('instagram_publishing_connections').select('*').eq('church_id',church).eq('status','connected').maybeSingle(),connection=connectionResult.data;
  if(connectionResult.error||!connection)throw new Error('not_connected');
  const caption=String(bulletin.reel_caption||`${bulletin.title}\n${bulletin.service_date}\n\n#Mplus大雅教會 #主日週報 #台中教會`).slice(0,2200),now=new Date().toISOString();
  const previous=await db.from('instagram_publication_jobs').select('status,instagram_media_id').eq('bulletin_id',bulletin.id).eq('bulletin_version',bulletin.version).maybeSingle();
  if(previous.data?.status==='published'&&previous.data.instagram_media_id)return {status:'published',mediaId:previous.data.instagram_media_id};
  const queued=await db.from('instagram_publication_jobs').upsert({church_id:church,bulletin_id:bulletin.id,bulletin_version:bulletin.version,media_path:bulletin.reel_video_path,caption,status:'processing',requested_by:userId,requested_at:now,started_at:now,updated_at:now},{onConflict:'bulletin_id,bulletin_version'}).select('id,status,instagram_media_id').single();
  if(queued.error||!queued.data)throw new Error('job_store');
  try{
    const token=await decryptToken(connection.access_token_ciphertext,connection.access_token_iv,serviceKey),videoUrl=db.storage.from('church-website-public-media').getPublicUrl(bulletin.reel_video_path).data.publicUrl;
    const created=await graph(`${connection.instagram_user_id}/media`,token,'POST',{media_type:'REELS',video_url:videoUrl,caption,share_to_feed:'true'}),containerId=String(created.id||'');
    if(!containerId)throw new Error('instagram_api');
    await db.from('instagram_publication_jobs').update({container_id:containerId,attempt_count:1,updated_at:new Date().toISOString()}).eq('id',queued.data.id);
    let ready=false;
    for(let attempt=0;attempt<20;attempt++){await wait(2000);const state=await graph(containerId,token,'GET',{fields:'status_code,status'});if(state.status_code==='FINISHED'){ready=true;break;}if(['ERROR','EXPIRED'].includes(state.status_code))throw new Error('instagram_processing');}
    if(!ready)throw new Error('instagram_timeout');
    const published=await graph(`${connection.instagram_user_id}/media_publish`,token,'POST',{creation_id:containerId}),mediaId=String(published.id||'');
    if(!mediaId)throw new Error('instagram_api');
    await db.from('instagram_publication_jobs').update({status:'published',instagram_media_id:mediaId,published_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('id',queued.data.id);
    return {status:'published',mediaId};
  }catch(error){const code=apiErrorCode(error);await db.from('instagram_publication_jobs').update({status:'failed',error_code:code,updated_at:new Date().toISOString()}).eq('id',queued.data.id);if(code==='token_expired')await db.from('instagram_publishing_connections').update({status:'expired',last_error:code,updated_at:new Date().toISOString()}).eq('church_id',church);throw new Error(code);}
}

async function publishSermon(db:ReturnType<typeof createClient>,serviceKey:string,church:string,draftId:string,userId:string|null){
  const draftResult=await db.from('sermon_social_drafts').select('id,church_id,service_date,sermon_title,speaker,caption,status,social_image_url').eq('id',draftId).eq('church_id',church).maybeSingle(),draft=draftResult.data;
  if(draftResult.error||!draft)throw new Error('sermon_not_found');
  if(draft.status!=='approved')throw new Error('sermon_not_approved');
  if(!draft.social_image_url?.startsWith('https://mscos.mchurch.online/'))throw new Error('sermon_image_missing');
  const connectionResult=await db.from('instagram_publishing_connections').select('*').eq('church_id',church).eq('status','connected').maybeSingle(),connection=connectionResult.data;
  if(connectionResult.error||!connection)throw new Error('not_connected');
  const previous=await db.from('sermon_social_publication_jobs').select('status,instagram_media_id').eq('draft_id',draft.id).maybeSingle();
  if(previous.data?.status==='published'&&previous.data.instagram_media_id)return {status:'published',mediaId:previous.data.instagram_media_id};
  const caption=String(draft.caption||`${draft.sermon_title}\n${draft.speaker||''}\n${draft.service_date}\n\n#Mplus大雅教會 #主日講道 #台中教會`).slice(0,2200),now=new Date().toISOString();
  const queued=await db.from('sermon_social_publication_jobs').upsert({draft_id:draft.id,church_id:church,image_url:draft.social_image_url,caption,status:'processing',attempt_count:1,requested_by:userId,requested_at:now,started_at:now,error_code:null,updated_at:now},{onConflict:'draft_id'}).select('id').single();
  if(queued.error||!queued.data)throw new Error('job_store');
  try{
    const token=await decryptToken(connection.access_token_ciphertext,connection.access_token_iv,serviceKey);
    const created=await graph(`${connection.instagram_user_id}/media`,token,'POST',{image_url:draft.social_image_url,caption}),containerId=String(created.id||'');
    if(!containerId)throw new Error('instagram_api');
    await db.from('sermon_social_publication_jobs').update({container_id:containerId,updated_at:new Date().toISOString()}).eq('id',queued.data.id);
    let ready=false;
    for(let attempt=0;attempt<15;attempt++){const state=await graph(containerId,token,'GET',{fields:'status_code,status'});if(state.status_code==='FINISHED'){ready=true;break;}if(['ERROR','EXPIRED'].includes(state.status_code))throw new Error('instagram_processing');await wait(1500);}
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
  if(!internal&&!await canManage(client.db,user!.id,church))return json(origin,{ok:false,error:'forbidden'},403);
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
      if(!/^[0-9a-f-]{36}$/i.test(bulletinId)||!videoPath.startsWith(`${church}/weekly/${bulletinId}/`)||!videoPath.endsWith('.mp4')||(audioPath&&!audioPath.startsWith(`${church}/reel-music/`)))return json(origin,{ok:false,error:'invalid_request'},400);
      const saved=await client.db.from('website_weekly_bulletins').update({reel_enabled:body.reelEnabled!==false,reel_video_path:videoPath,reel_audio_path:audioPath,reel_audio_start_seconds:audioStart,reel_caption:caption,updated_by:user!.id,updated_at:new Date().toISOString()}).eq('id',bulletinId).eq('church_id',church).select('id,church_id,service_date,title,subtitle,service_time,hero_image_path,sections,status,version,created_by,updated_at,published_at,review_comment,reel_enabled,reel_video_path,reel_caption,reel_audio_path,reel_audio_start_seconds').maybeSingle();
      if(saved.error||!saved.data)return json(origin,{ok:false,error:'not_found'},404);
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
    const code=error instanceof Error&&error.message==='invalid_token'?'invalid_token':'unavailable';
    return json(origin,{ok:false,error:code},code==='invalid_token'?400:503);
  }
});
