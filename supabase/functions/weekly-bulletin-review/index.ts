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
  if(!profile.editor)return json(APP_ORIGIN,{ok:false,error:'forbidden'},403);
  if(body.action==='submit'){
    if(!UUID.test(body.bulletinId||''))return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
    const found=await db.from('website_weekly_bulletins').select('id,church_id,service_date,title,status,version').eq('id',body.bulletinId).eq('church_id',church).maybeSingle();
    if(found.error||!found.data)return json(APP_ORIGIN,{ok:false,error:'not_found'},404);
    if(!['draft','changes_requested'].includes(found.data.status))return json(APP_ORIGIN,{ok:false,error:'invalid_status'},409);
    const now=new Date().toISOString();
    const saved=await db.from('website_weekly_bulletins').update({status:'pending_review',submitted_by:user.id,submitted_at:now,reviewed_by:null,reviewed_at:null,review_comment:null,updated_by:user.id,updated_at:now}).eq('id',found.data.id).eq('status',found.data.status).select('id,service_date,title,version').maybeSingle();
    if(saved.error||!saved.data)return json(APP_ORIGIN,{ok:false,error:'conflict'},409);
    await db.from('website_weekly_bulletin_review_events').insert({bulletin_id:found.data.id,church_id:church,bulletin_version:found.data.version,action:'submitted',actor_user_id:user.id});
    const recipientCount=await notifyReviewers(db,church,saved.data,profile.staff?.id||null);
    return json(APP_ORIGIN,{ok:true,status:'pending_review',recipientCount});
  }
  if(body.action==='list'){
    if(!profile.reviewer)return json(APP_ORIGIN,{ok:false,error:'reviewer_required'},403);
    const result=await db.from('website_weekly_bulletins').select('id,service_date,title,subtitle,status,version,submitted_at,review_comment').eq('church_id',church).in('status',['pending_review','changes_requested','published']).order('submitted_at',{ascending:false}).limit(50);
    if(result.error)throw new Error('db');
    return json(APP_ORIGIN,{ok:true,items:result.data||[]});
  }
  if(body.action==='get'){
    if(!profile.reviewer||!UUID.test(body.bulletinId||''))return json(APP_ORIGIN,{ok:false,error:'reviewer_required'},403);
    const result=await db.from('website_weekly_bulletins').select('id,church_id,service_date,title,subtitle,service_time,hero_image_path,sections,status,version,submitted_at,review_comment,reel_enabled,reel_video_path,reel_caption,reel_audio_path').eq('id',body.bulletinId).eq('church_id',church).maybeSingle();
    if(result.error||!result.data)return json(APP_ORIGIN,{ok:false,error:'not_found'},404);
    return json(APP_ORIGIN,{ok:true,bulletin:result.data});
  }
  if(['approve','request_changes'].includes(body.action)){
    if(!profile.reviewer||!UUID.test(body.bulletinId||''))return json(APP_ORIGIN,{ok:false,error:'reviewer_required'},403);
    const comment=String(body.comment||'').trim().slice(0,2000);
    if(body.action==='request_changes'&&!comment)return json(APP_ORIGIN,{ok:false,error:'comment_required'},400);
    const found=await db.from('website_weekly_bulletins').select('id,church_id,service_date,title,status,version,submitted_by').eq('id',body.bulletinId).eq('church_id',church).maybeSingle();
    if(found.error||!found.data)return json(APP_ORIGIN,{ok:false,error:'not_found'},404);
    if(found.data.status!=='pending_review'||Number(body.version)!==found.data.version)return json(APP_ORIGIN,{ok:false,error:'conflict'},409);
    const approved=body.action==='approve',now=new Date().toISOString(),nextStatus=approved?'published':'changes_requested';
    const saved=await db.from('website_weekly_bulletins').update({status:nextStatus,reviewed_by:user.id,reviewed_at:now,review_comment:comment||null,updated_by:user.id,updated_at:now,published_at:approved?now:null}).eq('id',found.data.id).eq('status','pending_review').eq('version',found.data.version).select('id').maybeSingle();
    if(saved.error||!saved.data)return json(APP_ORIGIN,{ok:false,error:'conflict'},409);
    await db.from('website_weekly_bulletin_review_events').insert({bulletin_id:found.data.id,church_id:church,bulletin_version:found.data.version,action:approved?'approved':'changes_requested',actor_user_id:user.id,comment:comment||null});
    await db.from('pastoral_tasks').update({status:'completed',completed_at:now,updated_at:now,payload:{workflow:'weekly_bulletin_review',bulletin_id:found.data.id,bulletin_version:found.data.version,review_result:nextStatus,review_comment:comment||null}}).eq('entity_key',churchEntity(church)).eq('status','pending').contains('payload',{workflow:'weekly_bulletin_review',bulletin_id:found.data.id,bulletin_version:found.data.version});
    await notifyEditor(db,church,found.data,approved,comment);
    let instagramQueued=false;if(approved&&church==='M+'){instagramQueued=true;const token=request.headers.get('authorization')||'';EdgeRuntime.waitUntil(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/instagram-publishing`,{method:'POST',headers:{authorization:token,'content-type':'application/json',origin:APP_ORIGIN},body:JSON.stringify({action:'publish',church,bulletinId:found.data.id})}).catch(()=>undefined));}
    return json(APP_ORIGIN,{ok:true,status:nextStatus,instagramQueued});
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
