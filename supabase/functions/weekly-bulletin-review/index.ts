import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyStaffDual} from '../_shared/dual-notification.mjs';

const APP_ORIGIN='https://mscos.mchurch.online';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers=(origin:string)=>({
  ...(origin===APP_ORIGIN?{'access-control-allow-origin':origin}:{}),
  'access-control-allow-headers':'authorization,content-type,apikey',
  'access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
});
const json=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});
const churchEntity=(church:string)=>church==='M+'?'mplus':'shine';
const reviewUrl=(church:string,id:string)=>`/weekly-bulletin-review.html?church=${encodeURIComponent(church)}&bulletin=${encodeURIComponent(id)}`;
const lineReviewUrl=(church:string,id:string)=>`${APP_ORIGIN}${reviewUrl(church,id)}`;

async function syncYoutube(db:ReturnType<typeof adminClient>,authorization:string,id:string,version:number){
  await db.from('weekly_youtube_publications').upsert({bulletin_id:id,church_id:'M+',bulletin_version:version,status:'pending'},{onConflict:'bulletin_id',ignoreDuplicates:true});
  try{
    const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/youtube-oauth`,{method:'POST',headers:{authorization,'content-type':'application/json',origin:APP_ORIGIN},body:JSON.stringify({action:'weekly_sync',church:'M+',bulletinId:id,version}),signal:AbortSignal.timeout(120000)});
    const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw new Error(result.error||'sync_failed');
  }catch(e){
    const code=e instanceof Error&&/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'sync_failed';
    await db.from('weekly_youtube_publications').update({status:'failed',error_code:code,updated_at:new Date().toISOString()}).eq('bulletin_id',id).eq('bulletin_version',version).is('lease_expires_at',null).neq('status','synced');
  }
}

function adminClient(){
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!key)throw new Error('config');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
async function currentUser(request:Request,db:ReturnType<typeof adminClient>){
  const token=(request.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!token)return null;
  const result=await db.auth.getUser(token);
  return result.error?null:result.data.user;
}
async function accountProfile(db:ReturnType<typeof adminClient>,userId:string,church:string){
  const result=await db.rpc('get_weekly_bulletin_review_profile',{p_user:userId,p_church:church});
  const value=result.data||{};
  return {editor:value.editor===true,reviewer:value.reviewer===true,staff:value.staff_id?{id:value.staff_id}:null,name:value.name||'同工',jobTitle:value.job_title||''};
}
async function reviewers(db:ReturnType<typeof adminClient>,church:string){
  const result=await db.rpc('get_weekly_bulletin_reviewers',{p_church:church});
  return Array.isArray(result.data)?result.data:[];
}
async function initialReviewer(db:ReturnType<typeof adminClient>,church:string){
  const settings=await db.from('review_workflow_settings').select('initial_reviewer_id').eq('church_id',church).eq('workflow_key','weekly_bulletin').maybeSingle();
  if(settings.error||!settings.data?.initial_reviewer_id)return null;
  const staff=await db.from('pastoral_staff').select('id').eq('app_user_id',settings.data.initial_reviewer_id).eq('is_active',true).maybeSingle();
  return staff.data?{userId:settings.data.initial_reviewer_id,staffId:staff.data.id}:null;
}
async function delivery(db:ReturnType<typeof adminClient>,values:Record<string,unknown>){
  await db.from('pastoral_notification_deliveries').upsert(values,{onConflict:'idempotency_key'});
}
async function notifyReviewers(db:ReturnType<typeof adminClient>,church:string,bulletin:{id:string;service_date:string;title:string;version:number},actorStaffId:string|null){
  const people=await reviewers(db,church),entity=churchEntity(church),url=reviewUrl(church,bulletin.id),fullUrl=lineReviewUrl(church,bulletin.id);
  for(const person of people){
    const key=`weekly-review:${bulletin.id}:${bulletin.version}:${person.id}`;
    await db.from('pastoral_tasks').upsert({entity_key:entity,title:`審核 ${bulletin.service_date} 週報`,description:`${bulletin.title} 已送審，請預覽內容後核准發布或填寫退回意見。`,task_type:'document',status:'pending',assigned_to:person.id,created_by:actorStaffId,idempotency_key:key,payload:{workflow:'weekly_bulletin_review',bulletin_id:bulletin.id,bulletin_version:bulletin.version,action_url:url}},{onConflict:'idempotency_key',ignoreDuplicates:true});
    const sent=await notifyStaffDual({db,staffId:person.id,churchId:church,eventKey:'weekly_bulletin_review',routeKey:'weekly_bulletin_review',sourceKey:key,title:'週報等待審核',body:`${bulletin.service_date} 的週報已完成編輯，請預覽後核准發布或退回修改。`,url,lineMessage:`週報等待審核：${bulletin.service_date}\n請預覽後核准發布或退回修改：${fullUrl}`,idempotencyKey:key});
    await delivery(db,{entity_key:entity,notification_type:'weekly_bulletin_review',recipient_staff_id:person.id,related_id:bulletin.id,idempotency_key:key,status:sent.status,error_code:sent.status==='sent'?null:`app:${sent.appStatus};line:${sent.lineStatus}`,app_status:sent.appStatus,line_status:sent.lineStatus,sent_at:sent.status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString()});
  }
  return people.length;
}
async function notifyInitial(db:ReturnType<typeof adminClient>,church:string,bulletin:{id:string;service_date:string;title:string;version:number},actorStaffId:string|null){
  const person=await initialReviewer(db,church);if(!person)throw new Error('reviewer_not_configured');
  const key=`weekly-initial:${bulletin.id}:${bulletin.version}:${person.staffId}`,url=reviewUrl(church,bulletin.id);
  await db.from('pastoral_tasks').upsert({entity_key:churchEntity(church),title:`初審 ${bulletin.service_date} 週報`,description:`${bulletin.title} 已送初審，請核對週報文字與核准的預告圖。`,task_type:'document',status:'pending',assigned_to:person.staffId,created_by:actorStaffId,idempotency_key:key,payload:{workflow:'weekly_bulletin_initial_review',bulletin_id:bulletin.id,bulletin_version:bulletin.version,action_url:url}},{onConflict:'idempotency_key',ignoreDuplicates:true});
  await notifyStaffDual({db,staffId:person.staffId,churchId:church,eventKey:'weekly_bulletin_review',routeKey:'weekly_bulletin_review',sourceKey:key,title:'主日週報等待初審',body:`${bulletin.service_date} 的週報文字請進行初審。`,url,lineMessage:`主日週報等待初審：${bulletin.service_date}\n${APP_ORIGIN}${url}`,idempotencyKey:key});
}
async function notifyEditor(db:ReturnType<typeof adminClient>,church:string,bulletin:{id:string;service_date:string;submitted_by:string|null},approved:boolean,comment:string){
  if(!bulletin.submitted_by)return;
  const staff=await db.from('pastoral_staff').select('id').eq('app_user_id',bulletin.submitted_by).eq('is_active',true).maybeSingle();
  if(!staff.data)return;
  const eventKey=approved?'weekly_bulletin_approved':'weekly_bulletin_changes_requested',routeKey='weekly_bulletin_result',key=`${eventKey}:${bulletin.id}:${Date.now()}`,url=`/website-maintenance.html?church=${encodeURIComponent(church)}&bulletin=${bulletin.id}`;
  const title=approved?'週報已核准發布':'週報已退回修改',body=approved?`${bulletin.service_date} 的週報已核准並發布。`:`${bulletin.service_date} 的週報需要修改。審核意見：${comment}`;
  const sent=await notifyStaffDual({db,staffId:staff.data.id,churchId:church,eventKey,routeKey,sourceKey:key,title,body,url,lineMessage:`${title}\n${body}\n${APP_ORIGIN}${url}`,idempotencyKey:key});
  await delivery(db,{entity_key:churchEntity(church),notification_type:eventKey,recipient_staff_id:staff.data.id,related_id:bulletin.id,idempotency_key:key,status:sent.status,error_code:sent.status==='sent'?null:`app:${sent.appStatus};line:${sent.lineStatus}`,app_status:sent.appStatus,line_status:sent.lineStatus,sent_at:sent.status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString()});
}

async function handle(request:Request,db:ReturnType<typeof adminClient>,user:{id:string}){
  const body=await request.json().catch(()=>null),church=body?.church;
  if(!body||typeof body.action!=='string'||!['M+','SHiNE'].includes(church))return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
  const profile=await accountProfile(db,user.id,church);
  const initial=await initialReviewer(db,church),isInitial=initial?.userId===user.id;
  if(!profile.editor)return json(APP_ORIGIN,{ok:false,error:'forbidden'},403);
  if(body.action==='submit'){
    if(!UUID.test(body.bulletinId||''))return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
    const found=await db.from('website_weekly_bulletins').select('id,church_id,service_date,title,status,version,sections').eq('id',body.bulletinId).eq('church_id',church).maybeSingle();
    if(found.error||!found.data)return json(APP_ORIGIN,{ok:false,error:'not_found'},404);
    if(!['draft','changes_requested'].includes(found.data.status))return json(APP_ORIGIN,{ok:false,error:'invalid_status'},409);
    const promo=await db.from('website_weekly_promos').select('status,snapshot').eq('bulletin_id',found.data.id).eq('church_id',church).maybeSingle();
    if(promo.error||promo.data?.status!=='approved')return json(APP_ORIGIN,{ok:false,error:'promo_not_approved'},409);
    if(!initial)return json(APP_ORIGIN,{ok:false,error:'reviewer_not_configured'},409);
    if(!Array.isArray(found.data.sections)||!found.data.sections.some((section:{description?:string;items?:Array<{label?:string;body?:string}>})=>String(section.description||'').trim()||Array.isArray(section.items)&&section.items.some(item=>String(item.label||'').trim()||String(item.body||'').trim())))return json(APP_ORIGIN,{ok:false,error:'bulletin_incomplete'},400);
    const now=new Date().toISOString();
    const saved=await db.from('website_weekly_bulletins').update({hero_image_path:promo.data.snapshot.hero_image_path,reel_cover_image_path:promo.data.snapshot.reel_cover_image_path,status:'pending_initial',submitted_by:user.id,submitted_at:now,reviewed_by:null,reviewed_at:null,review_comment:null,updated_by:user.id,updated_at:now}).eq('id',found.data.id).eq('status',found.data.status).eq('version',found.data.version).select('id,service_date,title,version').maybeSingle();
    if(saved.error||!saved.data)return json(APP_ORIGIN,{ok:false,error:'conflict'},409);
    await db.from('website_weekly_bulletin_review_events').insert({bulletin_id:found.data.id,church_id:church,bulletin_version:found.data.version,action:'submitted',actor_user_id:user.id});
    let notificationPending=false;try{await notifyInitial(db,church,saved.data,profile.staff?.id||null);}catch{notificationPending=true;}
    return json(APP_ORIGIN,{ok:true,status:'pending_initial',recipientCount:1,notificationPending});
  }
  if(body.action==='list'){
    if(!profile.reviewer&&!isInitial)return json(APP_ORIGIN,{ok:false,error:'reviewer_required'},403);
    const result=await db.from('website_weekly_bulletins').select('id,service_date,title,subtitle,status,version,submitted_at,review_comment').eq('church_id',church).in('status',['pending_initial','pending_review','changes_requested','published']).order('submitted_at',{ascending:false}).limit(50);
    if(result.error)throw new Error('db');
    return json(APP_ORIGIN,{ok:true,items:(result.data||[]).filter(row=>row.status==='pending_initial'?isInitial:profile.reviewer).map(row=>({...row,track:'bulletin'}))});
  }
  if(body.action==='get'){
    if((!profile.reviewer&&!isInitial)||!UUID.test(body.bulletinId||''))return json(APP_ORIGIN,{ok:false,error:'reviewer_required'},403);
    const result=await db.from('website_weekly_bulletins').select('id,church_id,service_date,title,subtitle,service_time,sermon_topic,sermon_scripture,sermon_speaker,hero_image_path,reel_cover_image_path,sections,schedule_overrides,status,version,submitted_at,review_comment,reel_enabled,reel_video_path,reel_caption,reel_audio_path,youtube_sync_enabled,youtube_video_id,youtube_title,youtube_description,youtube_tags').eq('id',body.bulletinId).eq('church_id',church).maybeSingle();
    if(result.error||!result.data)return json(APP_ORIGIN,{ok:false,error:'not_found'},404);
    const date=String(result.data.service_date),next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+7);const nextDate=next.toISOString().slice(0,10);
    const [scheduleResult,roleResult]=await Promise.all([db.from('service_schedules').select('*').eq('church_id',church).in('service_date',[date,date.replaceAll('-','/'),nextDate,nextDate.replaceAll('-','/')]),db.from('schedule_role_preferences').select('role_key,label,sort_order').eq('church_id',church).eq('is_visible',true).order('sort_order')]);
    if(scheduleResult.error||roleResult.error)throw new Error('db');
    const week=(day:string,which:'current'|'next')=>{const record=(scheduleResult.data||[]).find(row=>String(row.service_date).replaceAll('/','-')===day)||{},override=result.data.schedule_overrides?.[which]||{};return (roleResult.data||[]).map(role=>({label:role.label,value:String(override[role.role_key]??record.custom_assignments?.[role.role_key]??record[role.role_key]??'').trim()})).filter(item=>item.value);};
    const promo=await db.from('website_weekly_promos').select('bulletin_id').eq('bulletin_id',result.data.id).maybeSingle();if(promo.error)throw new Error('db');
    return json(APP_ORIGIN,{ok:true,bulletin:{...result.data,legacy:!promo.data,weekly_schedule:{current:week(date,'current'),next:week(nextDate,'next')}},canDecide:result.data.status==='pending_initial'?isInitial:profile.reviewer});
  }
  if(['approve','request_changes'].includes(body.action)){
    if((!profile.reviewer&&!isInitial)||!UUID.test(body.bulletinId||''))return json(APP_ORIGIN,{ok:false,error:'reviewer_required'},403);
    const comment=String(body.comment||'').trim().slice(0,2000);
    if(body.action==='request_changes'&&!comment)return json(APP_ORIGIN,{ok:false,error:'comment_required'},400);
    const found=await db.from('website_weekly_bulletins').select('id,church_id,service_date,title,status,version,submitted_by,youtube_sync_enabled').eq('id',body.bulletinId).eq('church_id',church).maybeSingle();
    if(found.error||!found.data)return json(APP_ORIGIN,{ok:false,error:'not_found'},404);
    const stage=found.data.status==='pending_initial'?'initial':found.data.status==='pending_review'?'final':'';
    if(!stage||Number(body.version)!==found.data.version)return json(APP_ORIGIN,{ok:false,error:'conflict'},409);
    if(stage==='initial'&&!isInitial||stage==='final'&&!profile.reviewer)return json(APP_ORIGIN,{ok:false,error:'reviewer_required'},403);
    const promo=await db.from('website_weekly_promos').select('bulletin_id').eq('bulletin_id',found.data.id).maybeSingle();if(promo.error)throw new Error('db');
    const legacy=!promo.data,approved=body.action==='approve',now=new Date().toISOString(),nextStatus=approved?(stage==='initial'?'pending_review':'published'):'changes_requested';
    const saved=await db.from('website_weekly_bulletins').update({status:nextStatus,reviewed_by:user.id,reviewed_at:now,review_comment:comment||null,updated_by:user.id,updated_at:now,published_at:nextStatus==='published'?now:null}).eq('id',found.data.id).eq('status',found.data.status).eq('version',found.data.version).select('id').maybeSingle();
    if(saved.error||!saved.data)return json(APP_ORIGIN,{ok:false,error:'conflict'},409);
    await db.from('website_weekly_bulletin_review_events').insert({bulletin_id:found.data.id,church_id:church,bulletin_version:found.data.version,action:approved?(stage==='initial'?'initial_approved':'approved'):'changes_requested',actor_user_id:user.id,comment:comment||null});
    await db.from('pastoral_tasks').update({status:'completed',completed_at:now,updated_at:now}).eq('entity_key',churchEntity(church)).eq('status','pending').contains('payload',{workflow:stage==='initial'?'weekly_bulletin_initial_review':'weekly_bulletin_review',bulletin_id:found.data.id,bulletin_version:found.data.version});
    let notificationPending=false;
    if(nextStatus==='pending_review')try{await notifyReviewers(db,church,found.data,profile.staff?.id||null);}catch{notificationPending=true;}
    if(nextStatus==='published'||nextStatus==='changes_requested')try{await notifyEditor(db,church,found.data,nextStatus==='published',comment);}catch{notificationPending=true;}
    const youtubeQueued=nextStatus==='published'&&legacy&&church==='M+'&&found.data.youtube_sync_enabled===true;
    if(youtubeQueued)EdgeRuntime.waitUntil(syncYoutube(db,request.headers.get('authorization')||'',found.data.id,found.data.version));
    let instagramQueued=false;
    if(nextStatus==='published'&&legacy&&church==='M+'){
      const setting=await db.from('media_publishing_settings').select('instagram_weekly_reel_enabled').eq('church_id',church).maybeSingle();
      if(!setting.error&&setting.data?.instagram_weekly_reel_enabled===true){instagramQueued=true;const token=request.headers.get('authorization')||'';EdgeRuntime.waitUntil(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/instagram-publishing`,{method:'POST',headers:{authorization:token,'content-type':'application/json',origin:APP_ORIGIN},body:JSON.stringify({action:'publish',church,bulletinId:found.data.id})}).catch(()=>undefined));}
    }
    return json(APP_ORIGIN,{ok:true,status:nextStatus,instagramQueued,youtubeQueued,notificationPending});
  }
  return json(APP_ORIGIN,{ok:false,error:'invalid_action'},400);
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return origin===APP_ORIGIN?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false,error:'forbidden'},403);
  if(request.method!=='POST'||origin!==APP_ORIGIN)return json(origin,{ok:false,error:'forbidden'},403);
  let db;try{db=adminClient();}catch{return json(origin,{ok:false,error:'unavailable'},503);}
  const user=await currentUser(request,db);
  if(!user)return json(origin,{ok:false,error:'login_required'},401);
  try{return await handle(request,db,user);}catch{return json(origin,{ok:false,error:'unavailable'},503);}
});
