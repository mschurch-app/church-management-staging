import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const APP='https://mscos.mchurch.online';
const MEDIA='https://aqanuwilmvdtlzuqlrau.supabase.co/storage/v1/object/public/church-website-public-media/';
const INITIAL='d066ac92-9801-46cc-9293-2932399b4e11';
const DIRECT_PASTOR='c25e9543-51a8-4c02-8c26-63f864a59089';
const UUID=/^[0-9a-f-]{36}$/i;
const headers=(origin:string)=>({...(origin===APP?{'access-control-allow-origin':origin}:{}),'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'});
const json=(origin:string,status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});

function client(){
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
 if(!url||!key)throw new Error('config');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function staffForUser(db:any,userId:string){const r=await db.from('pastoral_staff').select('id,display_name,role').eq('app_user_id',userId).eq('is_active',true).maybeSingle();return r.data||null;}
async function finalReviewerIds(db:any){const r=await db.rpc('get_weekly_bulletin_reviewers',{p_church:'M+'});return (Array.isArray(r.data)?r.data:[]).map((x:any)=>String(x.id)).filter((id:string)=>id!==INITIAL);}
async function finalNotificationIds(db:any,ids:string[]){const result=await db.from('pastoral_staff').select('id,display_name,line_subject').in('id',ids).eq('is_active',true);if(result.error)throw result.error;const byName=new Map<string,any>();for(const person of result.data||[]){const name=String(person.display_name||person.id),previous=byName.get(name);if(!previous||!/^U[0-9a-f]{32}$/i.test(previous.line_subject||'')&&/^U[0-9a-f]{32}$/i.test(person.line_subject||''))byName.set(name,person);}return [...byName.values()].map(x=>String(x.id));}
async function publicationForDraft(db:any,draftId:string){const r=await db.from('sermon_social_publication_jobs').select('status,instagram_media_id,published_at,error_code').eq('draft_id',draftId).maybeSingle();return r.data||null;}
function cleaned(body:any,draft?:any){const array=(value:any)=>Array.isArray(value)?value.map(x=>String(x).trim()).filter(Boolean).slice(0,12):[];return {speaker:String(body.speaker||'').trim().slice(0,100),scripture:String(body.scripture||'').trim().slice(0,300),sermon_start_seconds:Number(body.start)||null,sermon_end_seconds:Number(body.end)||null,outline:array(body.outline),key_points:array(body.keyPoints),applications:array(body.applications),caption:String(body.caption||'').trim().slice(0,2200),social_image_url:draft?.social_media_type==='reel'?draft.social_image_url:String(body.socialImageUrl||'').trim()||null,updated_at:new Date().toISOString()};}
function validReel(draft:any){return draft.social_media_type==='reel'&&new RegExp('^M\\+/sermons/'+draft.id+'/[a-f0-9]{64}\\.mp4$','i').test(String(draft.social_video_path||''))&&Boolean(draft.social_image_url);}
async function reelAssetsExist(db:any,draft:any){if(!validReel(draft))return false;const cover=String(draft.social_image_url||''),prefix=MEDIA+'M%2B/sermons/'+draft.id+'/';if(!cover.startsWith(prefix)||!/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)$/i.test(cover.slice(prefix.length)))return false;const coverPath='M+/sermons/'+draft.id+'/'+decodeURIComponent(cover.slice(prefix.length));const [videoInfo,coverInfo]=await Promise.all([db.storage.from('church-website-public-media').info(draft.social_video_path),db.storage.from('church-website-public-media').info(coverPath)]);return !videoInfo.error&&!coverInfo.error&&Number(videoInfo.data?.size)>0&&Number(coverInfo.data?.size)>0;}
function legacySocialImage(value:string){
 try{
  const url=new URL(value),storage=new URL(Deno.env.get('SUPABASE_URL')||''),prefix='/storage/v1/object/public/church-media/';
  if(url.protocol!=='https:'||url.origin!==storage.origin||url.search||url.hash||!url.pathname.startsWith(prefix))return null;
  const path=decodeURIComponent(url.pathname.slice(prefix.length));
  if(!/^sermon-social\/[a-z0-9_-]+\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(path))return null;
  return {path,mime:/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg'};
 }catch{return null;}
}
function appSocialImage(value:string){
 try{
  const url=new URL(value),version=url.searchParams.get('v');
  if(url.origin!==APP||url.hash||url.searchParams.size>(version?1:0)||version&&!/^[a-z0-9_-]{1,40}$/i.test(version))return null;
  if(!/^\/assets\/sermon-social\/(?:[a-z0-9_-]+\/)?[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(url.pathname))return null;
  return {url:value,mime:/\.png$/i.test(url.pathname)?'image/png':/\.webp$/i.test(url.pathname)?'image/webp':'image/jpeg'};
 }catch{return null;}
}
function canonicalSocialImage(value:string,draftId:string){
 const prefix=MEDIA+'M%2B/sermons/'+draftId+'/';
 return value.startsWith(prefix)&&/^[a-f0-9]{64}\.(?:jpg|png|webp)$/i.test(value.slice(prefix.length));
}
async function persistSocialImage(db:any,draftId:string,value:string){
 if(canonicalSocialImage(value,draftId)){
  const path='M+/sermons/'+draftId+'/'+value.split('/').pop(),info=await db.storage.from('church-website-public-media').info(path);
  if(info.error||!(Number(info.data?.size)>0))throw new Error('sermon_image_invalid');
  return value;
 }
 const match=value.match(/^data:(image\/(?:jpeg|png|webp))(?:;name=\/[^;,]*)?;base64,([A-Za-z0-9+/]+={0,2})$/i),legacy=match?null:legacySocialImage(value),app=match||legacy?null:appSocialImage(value);
 if(!match&&!legacy&&!app)throw new Error('sermon_image_invalid');
 let mime:string,bytes:Uint8Array;
 if(match){mime=match[1].toLowerCase();bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));}
 else if(legacy){
  mime=legacy!.mime;
  const source=db.storage.from('church-media'),info=await source.info(legacy!.path);
  if(info.error||!info.data||Number(info.data.size)<1||Number(info.data.size)>5*1024*1024)throw new Error('sermon_image_invalid');
  const downloaded=await source.download(legacy!.path);
  if(downloaded.error||!downloaded.data)throw new Error('sermon_image_upload_failed');
  bytes=new Uint8Array(await downloaded.data.arrayBuffer());
 }else{
  mime=app!.mime;
  const response=await fetch(app!.url,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length')||0)>5*1024*1024)throw new Error('sermon_image_invalid');
  bytes=new Uint8Array(await response.arrayBuffer());
 }
 if(bytes.length>5*1024*1024)throw new Error('sermon_image_too_large');
 const valid=mime==='image/jpeg'?bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff:mime==='image/png'?bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47:mime==='image/webp'?bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP':false;
 if(!valid)throw new Error('sermon_image_invalid');
 const ext=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp',digest=await crypto.subtle.digest('SHA-256',bytes),hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join(''),path='M+/sermons/'+draftId+'/'+hash+'.'+ext;
 const uploaded=await db.storage.from('church-website-public-media').upload(path,bytes,{contentType:mime,cacheControl:'3600',upsert:true});
 if(uploaded.error)throw new Error('sermon_image_upload_failed');
 return MEDIA+path.split('/').map(encodeURIComponent).join('/');
}
async function ensureApprovedSermonImage(db:any,draftId:string){
 const result=await db.from('sermon_social_drafts').select('status,review_stage,social_media_type,social_image_url').eq('id',draftId).single(),draft=result.data;
 if(result.error||!draft||draft.status!=='approved'||draft.review_stage!=='completed')throw new Error('sermon_image_migration_failed');
 if(draft.social_media_type==='reel')return draft.social_image_url;
 const url=await persistSocialImage(db,draftId,String(draft.social_image_url));
 if(url===draft.social_image_url)return url;
 const saved=await db.from('sermon_social_drafts').update({social_image_url:url,updated_at:new Date().toISOString()}).eq('id',draftId).eq('status','approved').eq('social_image_url',draft.social_image_url).select('id').maybeSingle();
 if(saved.error||!saved.data)throw new Error('sermon_image_migration_failed');
 return url;
}

async function subtitleState(db:any,draftId:string,includeCues=true){const r=await db.from('sermon_subtitle_segments').select(includeCues?'segment_index,cues,reviewed_cues,review_status,review_error':'segment_index,review_status').eq('draft_id',draftId).order('segment_index');if(r.error)throw r.error;const rows=r.data||[];return {rows,ready:rows.length>0&&rows.every((x:any)=>x.review_status==='completed'),cues:rows.flatMap((x:any)=>x.review_status==='completed'&&Array.isArray(x.reviewed_cues)?x.reviewed_cues:Array.isArray(x.cues)?x.cues:[])};}
async function queueNotification(db:any,input:{draftId:string;staffId:string;stage:string;sourceKey:string;title:string;body:string;url:string}){const q=await db.from('sermon_social_notification_queue').upsert({draft_id:input.draftId,staff_id:input.staffId,stage:input.stage,source_key:input.sourceKey,title:input.title,body:input.body,target_url:input.url,deliver_after:new Date(Date.now()+180000).toISOString(),status:'pending',attempt_count:0,error_code:null,sent_at:null,updated_at:new Date().toISOString()},{onConflict:'source_key'});if(q.error)throw new Error('notification_queue_failed');}
async function youtubeAction(req:Request,draftId:string,action:string,timeout=30000){const response=await fetch((Deno.env.get('SUPABASE_URL')||'')+'/functions/v1/youtube-oauth',{method:'POST',headers:{authorization:req.headers.get('authorization')||'','content-type':'application/json',origin:APP},body:JSON.stringify({action,church:'M+',draftId}),signal:AbortSignal.timeout(timeout)}),data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(String(data.error||action+'_failed'));return data;}
async function publishApproved(db:any,req:Request,draft:any){
 const now=new Date().toISOString(),result:any={instagram:{status:'pending'},youtube:{metadata:'not_requested',captions:'not_requested'}};
 const setting=await db.from('media_publishing_settings').select('instagram_sermon_enabled,youtube_captions_enabled').eq('church_id','M+').maybeSingle();
 if(setting.error)throw new Error('無法讀取發布設定。');
 if(setting.data?.instagram_sermon_enabled===true){
  try{await ensureApprovedSermonImage(db,draft.id);const response=await fetch((Deno.env.get('SUPABASE_URL')||'')+'/functions/v1/instagram-publishing',{method:'POST',headers:{authorization:req.headers.get('authorization')||'','content-type':'application/json',origin:APP},body:JSON.stringify({action:'publish_sermon',church:'M+',draftId:draft.id}),signal:AbortSignal.timeout(60000)}),data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(String(data.error||'instagram_publish_failed'));result.instagram={status:'published',...data};}
  catch(error){result.instagram={status:'failed',error:error instanceof Error?error.message:'instagram_publish_failed'};}
 }else result.instagram={status:'disabled'};
 if(draft.youtube_caption_requested!==false){
  if(setting.data?.youtube_captions_enabled!==true)result.youtube={metadata:'disabled',captions:'disabled'};
  else{
   const connection=(await db.from('youtube_oauth_connections').select('status').eq('church_id','M+').maybeSingle()).data;
   if(connection?.status!=='connected')result.youtube={metadata:'waiting_connection',captions:'waiting_connection'};
   else{
   const workflow=(await db.from('sermon_youtube_workflows').select('status,edit_confirmed_at').eq('draft_id',draft.id).maybeSingle()).data;
   if(workflow?.status==='published'){
    result.youtube.captions='published';
    try{await youtubeAction(req,draft.id,'update_sermon_metadata');result.youtube.metadata='updated';}
    catch(error){result.youtube.metadata='failed';result.youtube.error=error instanceof Error?error.message:'youtube_metadata_failed';}
   }
   else{
    const approved=await db.from('sermon_youtube_workflows').upsert({draft_id:draft.id,status:'approved',error_code:null,updated_at:now},{onConflict:'draft_id'});
    if(approved.error)result.youtube={metadata:'failed',captions:'waiting',error:'workflow_update_failed'};
    else{
     try{await youtubeAction(req,draft.id,'update_sermon_metadata');result.youtube.metadata='updated';}
     catch(error){result.youtube.metadata='failed';result.youtube.error=error instanceof Error?error.message:'youtube_metadata_failed';}
     const subtitles=await subtitleState(db,draft.id);
     if(!workflow?.edit_confirmed_at)result.youtube.captions='waiting_edit';
     else if(!subtitles.ready)result.youtube.captions='waiting_subtitles';
     else if(result.youtube.metadata==='updated'){
      try{await youtubeAction(req,draft.id,'publish_subtitles',60000);result.youtube.captions='published';await db.from('sermon_youtube_workflows').update({status:'published',published_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('draft_id',draft.id);}
      catch(error){result.youtube.captions='failed';result.youtube.error=error instanceof Error?error.message:'youtube_caption_failed';}
     }else result.youtube.captions='waiting';
     if(result.youtube.metadata==='failed'||result.youtube.captions==='failed')await db.from('sermon_youtube_workflows').update({status:'failed',error_code:String(result.youtube.error||'youtube_publish_failed').slice(0,500),updated_at:new Date().toISOString()}).eq('draft_id',draft.id);
    }
   }
   }
  }
 }
 if(result.instagram.status==='published')await db.from('pastoral_tasks').update({status:'completed',completed_at:now,updated_at:now}).eq('status','pending').contains('payload',{workflow:'sermon_social_final_review',draft_id:draft.id});
 return result;
}
function validArtwork(options:any){if(!Array.isArray(options)||options.length!==3)return false;const values=options.map(String);return values.filter(x=>x.includes('/card-knees-up')).length===2&&values.filter(x=>x.includes('/card-half-body')).length===1;}
function canPublishDirect(staffId:string,isFinal:boolean,draft:any){return staffId===DIRECT_PASTOR&&isFinal&&draft.status==='pending_review'&&draft.review_stage==='initial_review';}

Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return origin===APP?new Response('ok',{headers:headers(origin)}):json(origin,403,{ok:false,error:'forbidden'});
 if(req.method!=='POST'||origin!==APP)return json(origin,403,{ok:false,error:'forbidden'});
 const db=client(),token=(req.headers.get('authorization')||'').match(/^Bearer (.+)$/i)?.[1],user=token?(await db.auth.getUser(token)).data.user:null;
 if(!user)return json(origin,401,{ok:false,error:'請重新登入。'});
 const body=await req.json().catch(()=>null);
 if(!body||!UUID.test(body.draftId||''))return json(origin,400,{ok:false,error:'審核連結不正確。'});
 const staff=await staffForUser(db,user.id);
 if(!staff)return json(origin,403,{ok:false,error:'沒有審核權限。'});
 const draftResult=await db.from('sermon_social_drafts').select('id,church_id,service_date,youtube_url,sermon_title,speaker,scripture,sermon_start_seconds,sermon_end_seconds,outline,key_points,applications,caption,source_image_path,source_channel_name,archive_backfill,youtube_caption_requested,social_media_type,social_video_path,social_image_url,social_image_options,status,review_stage,initial_reviewer_id,initial_review_comment,updated_at').eq('id',body.draftId).eq('church_id','M+').maybeSingle(),draft=draftResult.data;
 if(!draft)return json(origin,404,{ok:false,error:'找不到審核內容。'});
 const finals=await finalReviewerIds(db),isFinal=finals.includes(staff.id),initial=draft.review_stage==='initial_review';
 if(!isFinal&&staff.id!==INITIAL)return json(origin,403,{ok:false,error:'這份內容目前不是由您審核。'});
 const canReviewIg=draft.status==='pending_review'&&(initial?staff.id===INITIAL: draft.review_stage==='pastoral_confirmation'&&isFinal);
 const canDirect=canPublishDirect(staff.id,isFinal,draft);

 if(body.action==='get'){
  const details=isFinal&&!initial,subtitles=draft.youtube_caption_requested===false?{rows:[],ready:false,cues:[]}:await subtitleState(db,draft.id,details);let workflow=null;
  if(draft.youtube_caption_requested!==false){workflow=(await db.from('sermon_youtube_workflows').select(details?'*':'status').eq('draft_id',draft.id).maybeSingle()).data;if(!workflow&&details){const inserted=await db.from('sermon_youtube_workflows').insert({draft_id:draft.id,status:subtitles.ready?'waiting_edit':'proofreading'}).select('*').single();workflow=inserted.data||null;}}
  const connection=details&&draft.youtube_caption_requested!==false?(await db.from('youtube_oauth_connections').select('status').eq('church_id','M+').maybeSingle()).data:null;
  const sourceImage=draft.source_image_path?MEDIA+draft.source_image_path.split('/').map(encodeURIComponent).join('/'):null;
  const reelUrl=validReel(draft)?db.storage.from('church-website-public-media').getPublicUrl(draft.social_video_path).data.publicUrl:null;
  const publication=await publicationForDraft(db,draft.id);
  let mediaPreparationError:string|null=null,mediaPrepared=false;
  if(isFinal&&draft.status==='approved'&&draft.review_stage==='completed'&&draft.social_media_type!=='reel'&&publication?.status!=='published'){
   try{const url=await ensureApprovedSermonImage(db,draft.id);mediaPrepared=url!==draft.social_image_url;draft.social_image_url=url;}
   catch(error){mediaPreparationError=error instanceof Error?error.message:'sermon_image_migration_failed';}
  }
  return json(origin,200,{ok:true,draft:{...draft,source_image_url:sourceImage,social_video_url:reelUrl,subtitle_cues:subtitles.cues,subtitles_ready:subtitles.ready,subtitle_segments:subtitles.rows.map((x:any)=>({segment_index:x.segment_index,review_status:x.review_status,review_error:x.review_error,cue_count:Array.isArray(x.reviewed_cues)&&x.reviewed_cues.length?x.reviewed_cues.length:Array.isArray(x.cues)?x.cues.length:0}))},publication,media_prepared:mediaPrepared,media_preparation_error:mediaPreparationError,youtube_workflow:workflow,youtube_connected:connection?.status==='connected',is_final_reviewer:isFinal,can_review_ig:canReviewIg,can_publish_direct:canDirect});
 }
 if(['prepare_reel_upload','complete_reel_upload'].includes(body.action)){
  if(draft.social_media_type!=='reel'||!['processing','changes_requested'].includes(draft.status))return json(origin,409,{ok:false,error:'目前不能更換這支 Reel。'});
  const videoHash=String(body.videoHash||''),coverHash=String(body.coverHash||'');
  if(!/^[a-f0-9]{64}$/.test(videoHash)||!/^[a-f0-9]{64}$/.test(coverHash))return json(origin,400,{ok:false,error:'檔案驗證失敗。'});
  const videoPath='M+/sermons/'+draft.id+'/'+videoHash+'.mp4',coverPath='M+/sermons/'+draft.id+'/'+coverHash+'.jpg',storage=db.storage.from('church-website-public-media');
  if(body.action==='prepare_reel_upload'){
   const [video,cover]=await Promise.all([storage.createSignedUploadUrl(videoPath),storage.createSignedUploadUrl(coverPath)]);
   if(video.error||cover.error||!video.data?.token||!cover.data?.token)return json(origin,503,{ok:false,error:'無法準備檔案上傳。'});
   return json(origin,200,{ok:true,video:{path:videoPath,token:video.data.token},cover:{path:coverPath,token:cover.data.token}});
  }
  const [video,cover]=await Promise.all([storage.info(videoPath),storage.info(coverPath)]);
  if(video.error||cover.error||!video.data||!cover.data||Number(video.data.size)<1000||Number(video.data.size)>200*1024*1024||Number(cover.data.size)<1000||Number(cover.data.size)>5*1024*1024)return json(origin,409,{ok:false,error:'Reel 或封面尚未上傳完成，或檔案大小不符合規定。'});
  const coverUrl=MEDIA+coverPath.split('/').map(encodeURIComponent).join('/');
  const saved=await db.from('sermon_social_drafts').update({social_video_path:videoPath,social_image_url:coverUrl,status:'pending_review',review_stage:'initial_review',updated_at:new Date().toISOString()}).eq('id',draft.id).in('status',['processing','changes_requested']).select('id,status').maybeSingle();
  if(saved.error||!saved.data)return json(origin,409,{ok:false,error:'送初審失敗，請重新讀取草稿狀態。'});
  return json(origin,200,{ok:true,status:'pending_review'});
 }
 if(['save','reject','approve'].includes(body.action)&&!canReviewIg)return json(origin,409,{ok:false,error:initial?'這篇仍待邵鈺庭完成 IG 初審。':'目前不是您可處理的 IG 審核階段。'});
 if(body.action==='save'){let patch=cleaned(body,draft);if(draft.social_media_type!=='reel'&&String(body.socialImageUrl||'').trim()){try{patch.social_image_url=await persistSocialImage(db,draft.id,String(body.socialImageUrl).trim());}catch{return json(origin,503,{ok:false,error:'圖片轉存失敗，修改尚未儲存。'});}}const saved=await db.from('sermon_social_drafts').update(patch).eq('id',draft.id).select('*').single();return saved.error?json(origin,503,{ok:false,error:'修改未儲存。'}):json(origin,200,{ok:true,draft:saved.data});}
 if(body.action==='confirm_youtube_edit'){
  if(draft.youtube_caption_requested===false)return json(origin,409,{ok:false,error:'這支影片只發布 M+ Instagram，不處理 YouTube 字幕。'});
  if(!isFinal)return json(origin,403,{ok:false,error:'只有牧師或師母可以確認 YouTube 影片範圍。'});
  const mode=String(body.editMode||'');if(!['full_replay','trimmed_replay'].includes(mode))return json(origin,400,{ok:false,error:'請選擇影片保留方式。'});
  const offset=mode==='trimmed_replay'?Math.max(0,Number(body.captionOffsetSeconds)||Number(draft.sermon_start_seconds)||0):0,subtitles=await subtitleState(db,draft.id),now=new Date().toISOString(),status=subtitles.ready?'review_ready':'proofreading';
  const saved=await db.from('sermon_youtube_workflows').upsert({draft_id:draft.id,status,edit_mode:mode,caption_offset_seconds:offset,edit_confirmed_at:now,review_requested_at:subtitles.ready?now:null,error_code:null,updated_at:now},{onConflict:'draft_id'}).select('*').single();
  if(saved.error)return json(origin,503,{ok:false,error:'YouTube 剪輯狀態未儲存。'});
  if(draft.status==='approved'){const publication=await publishApproved(db,req,draft);return json(origin,200,{ok:true,status:'approved',youtube_workflow:saved.data,...publication});}
  return json(origin,200,{ok:true,status,youtube_workflow:saved.data});
 }
 if(body.action==='approve_youtube'){
  if(draft.youtube_caption_requested===false)return json(origin,409,{ok:false,error:'這支影片只發布 M+ Instagram，不處理 YouTube 字幕。'});
  if(draft.status!=='approved'||draft.review_stage!=='completed')return json(origin,409,{ok:false,error:'請先完成 IG 複審，才能上稿 YouTube 字幕。'});
  if(!isFinal)return json(origin,403,{ok:false,error:'只有牧師或師母可以上稿 YouTube 字幕。'});const setting=await db.from('media_publishing_settings').select('youtube_captions_enabled').eq('church_id','M+').maybeSingle();if(setting.error||setting.data?.youtube_captions_enabled!==true)return json(origin,409,{ok:false,error:'YouTube 字幕發布開關目前關閉。'});const subtitles=await subtitleState(db,draft.id);if(!subtitles.ready)return json(origin,409,{ok:false,error:'字幕校對尚未完成。'});
  const workflow=(await db.from('sermon_youtube_workflows').select('*').eq('draft_id',draft.id).maybeSingle()).data;if(!workflow?.edit_confirmed_at)return json(origin,409,{ok:false,error:'請先確認 YouTube 影片是否已剪除講道前內容。'});if(!['review_ready','failed','approved'].includes(workflow.status))return json(origin,409,{ok:false,error:'YouTube 字幕目前不能上稿。'});
  const now=new Date().toISOString();await db.from('sermon_youtube_workflows').update({status:'approved',reviewed_by:staff.id,reviewed_at:now,error_code:null,updated_at:now}).eq('draft_id',draft.id);
  try{const metadata=await youtubeAction(req,draft.id,'update_sermon_metadata'),captions=await youtubeAction(req,draft.id,'publish_subtitles',60000);await db.from('sermon_youtube_workflows').update({status:'published',published_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()}).eq('draft_id',draft.id);await db.from('pastoral_tasks').update({status:'completed',completed_at:now,updated_at:now}).eq('status','pending').contains('payload',{workflow:'sermon_youtube_caption_review',draft_id:draft.id});return json(origin,200,{ok:true,status:'youtube_published',youtube:{metadata,captions}});}catch(error){const message=error instanceof Error?error.message:'youtube_publish_failed';await db.from('sermon_youtube_workflows').update({status:'failed',error_code:message.slice(0,500),updated_at:new Date().toISOString()}).eq('draft_id',draft.id);return json(origin,503,{ok:false,error:'YouTube 字幕上稿失敗，已保留目前字幕，可稍後重試。'});}
 }
 if(body.action==='sync_publication'){if(!isFinal||draft.status!=='approved'||draft.review_stage!=='completed')return json(origin,409,{ok:false,error:'尚未完成 IG 複審。'});const publication=await publishApproved(db,req,draft);return json(origin,200,{ok:true,status:'approved',...publication});}
 if(body.action==='approve_direct'){
  if(!canDirect)return json(origin,403,{ok:false,error:'只有吳俊璋牧師本人可以略過初審直接發布。'});
  const existing=await publicationForDraft(db,draft.id);
  if(existing?.status==='published'&&existing.instagram_media_id)return json(origin,409,{ok:false,error:'already_published'});
  let publishBody=body;
  if(draft.social_media_type==='reel'){
   if(!await reelAssetsExist(db,draft))return json(origin,409,{ok:false,error:'Reel 或封面尚未上傳完成，請先確認影片可預覽。'});
  }else{
   const selected=String(body.socialImageUrl||'').trim(),options=Array.isArray(draft.social_image_options)?draft.social_image_options:[];
   if(!validArtwork(options)||!selected||!options.includes(selected))return json(origin,409,{ok:false,error:'請先從三張候選圖中選擇一張，才能直接發布。'});
   try{const publicImageUrl=await persistSocialImage(db,draft.id,selected);publishBody={...body,socialImageUrl:publicImageUrl};}
   catch{return json(origin,503,{ok:false,error:'圖卡無法轉存成 Instagram 可讀取的圖片，尚未發布。'});}
  }
  const now=new Date().toISOString(),comment=String(body.comment||'').trim().slice(0,1900);
  const approval=await db.from('sermon_social_drafts').update({...cleaned(publishBody,draft),status:'approved',review_stage:'completed',final_reviewed_at:now,final_reviewer_id:staff.id,final_review_comment:comment?'牧師直接核准，略過初審。'+comment:'牧師直接核准，略過初審。'}).eq('id',draft.id).eq('status','pending_review').eq('review_stage','initial_review').select('id').maybeSingle();
  if(approval.error)return json(origin,503,{ok:false,error:'approval_failed'});
  if(!approval.data)return json(origin,409,{ok:false,error:'already_submitted'});
  await db.from('pastoral_tasks').update({status:'completed',completed_at:now,updated_at:now}).eq('status','pending').contains('payload',{workflow:'sermon_social_initial_review',draft_id:draft.id});
  await db.from('sermon_social_notification_queue').delete().eq('draft_id',draft.id).eq('stage','initial_review').eq('status','pending');
  const publication=await publishApproved(db,req,draft);
  return json(origin,200,{ok:true,status:'approved',...publication});
 }
 if(body.action==='reject'){const comment=String(body.comment||'').trim().slice(0,2000);if(!comment)return json(origin,400,{ok:false,error:'退回時請填寫意見。'});await db.from('sermon_social_drafts').update({...cleaned(body,draft),status:'changes_requested',initial_review_comment:initial?comment:draft.initial_review_comment,final_review_comment:initial?null:comment}).eq('id',draft.id);const workflow=initial?'sermon_social_initial_review':'sermon_social_final_review';await db.from('pastoral_tasks').update({status:'completed',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('status','pending').contains('payload',{workflow,draft_id:draft.id});return json(origin,200,{ok:true,status:'changes_requested'});}
 if(body.action==='approve'){
  const existing=await publicationForDraft(db,draft.id);if(existing?.status==='published'&&existing.instagram_media_id)return json(origin,409,{ok:false,error:'already_published'});const now=new Date().toISOString();
  if(initial){
   let patch:any;
   if(draft.social_media_type==='reel'){
    if(!await reelAssetsExist(db,draft))return json(origin,409,{ok:false,error:'Reel 或封面尚未上傳完成，請先確認影片可預覽。'});
    patch=cleaned(body,draft);
   }else{
    const selected=String(body.socialImageUrl||'').trim(),options=Array.isArray(draft.social_image_options)?draft.social_image_options:[];
    if(!validArtwork(options))return json(origin,409,{ok:false,error:'請先完成兩張膝蓋以上、一張半身的 1080p M+ 主日信息圖卡。'});
    if(!selected||!options.includes(selected))return json(origin,400,{ok:false,error:'請先選擇一張講道講員圖，才能送牧師、師母確認。'});
    let publicImageUrl:string;
    try{publicImageUrl=await persistSocialImage(db,draft.id,selected);}
    catch{return json(origin,503,{ok:false,error:'圖卡轉存失敗，尚未送審；請確認圖片可預覽。'});}
    patch={...cleaned({...body,socialImageUrl:publicImageUrl},draft),social_image_options:options.map((value:string)=>value===selected?publicImageUrl:value)};
   }
   const transitioned=await db.from('sermon_social_drafts').update({...patch,status:'pending_review',review_stage:'pastoral_confirmation',initial_reviewed_at:now,initial_reviewer_id:staff.id,initial_review_comment:String(body.comment||'').trim().slice(0,2000)||null}).eq('id',draft.id).eq('status','pending_review').eq('review_stage','initial_review').select('id').maybeSingle();
   if(transitioned.error)return json(origin,503,{ok:false,error:'approval_failed'});if(!transitioned.data)return json(origin,409,{ok:false,error:'already_submitted'});await db.from('pastoral_tasks').update({status:'completed',completed_at:now,updated_at:now}).eq('status','pending').contains('payload',{workflow:'sermon_social_initial_review',draft_id:draft.id});for(const id of await finalNotificationIds(db,finals)){const key='sermon-social-final:'+draft.id+':'+id,url='/sermon-social-review.html?draft='+draft.id,description=draft.social_media_type==='reel'?(staff.display_name||'初審同工')+'已完成初審，請觀看 Reel 並確認封面與貼文後發布到 M+ Instagram。':draft.youtube_caption_requested===false?(staff.display_name||'初審同工')+'已完成初審，請確認圖片與貼文後發布到 M+ Instagram。這支公開來源影片不處理 YouTube 字幕。':(staff.display_name||'初審同工')+'已完成初審，請確認圖片與貼文後發佈 Instagram。YouTube 說明會在複審通過後更新，字幕校對完成後自動上稿。';await db.from('pastoral_tasks').upsert({entity_key:'mplus',title:'確認發出 '+draft.service_date+' 講道 IG',description,task_type:'document',status:'pending',assigned_to:id,idempotency_key:key,payload:{workflow:'sermon_social_final_review',draft_id:draft.id,review_stage:'pastoral_confirmation',action_url:url}},{onConflict:'idempotency_key'});await queueNotification(db,{draftId:draft.id,staffId:id,stage:'pastoral_confirmation',sourceKey:key,title:'講道 IG 內容等待確認',body:draft.service_date+'｜'+draft.sermon_title,url});}return json(origin,200,{ok:true,status:'pastoral_confirmation'});}
  if(!isFinal)return json(origin,403,{ok:false,error:'只有牧師或師母可以發佈 Instagram。'});
  let publishBody=body;
  if(draft.social_media_type==='reel'){
   if(!await reelAssetsExist(db,draft))return json(origin,409,{ok:false,error:'Reel 或封面已失效，尚未發布。'});
  }else{
   try{const selected=String(body.socialImageUrl||draft.social_image_url||'').trim(),publicImageUrl=await persistSocialImage(db,draft.id,selected);publishBody={...body,socialImageUrl:publicImageUrl};}
   catch{return json(origin,503,{ok:false,error:'圖卡無法轉存成 Instagram 可讀取的圖片，尚未發布。'});}
  }
  const approval=await db.from('sermon_social_drafts').update({...cleaned(publishBody,draft),status:'approved',review_stage:'completed',final_reviewed_at:now,final_reviewer_id:staff.id,final_review_comment:String(body.comment||'').trim().slice(0,2000)||null}).eq('id',draft.id).eq('status','pending_review').eq('review_stage','pastoral_confirmation').select('id').maybeSingle();if(approval.error)return json(origin,503,{ok:false,error:'approval_failed'});if(!approval.data&&draft.status!=='approved')return json(origin,409,{ok:false,error:'conflict'});
  const publication=await publishApproved(db,req,draft);return json(origin,200,{ok:true,status:'approved',...publication});
 }
 return json(origin,400,{ok:false,error:'不支援的操作。'});
});
