import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyStaffDual} from '../_shared/dual-notification.mjs';

const ORIGIN='https://mscos.mchurch.online';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers=(origin:string)=>({'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type,apikey',...(origin===ORIGIN?{'access-control-allow-origin':origin}:{})});
const json=(origin:string,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});
const entity=(church:string)=>church==='M+'?'mplus':'shine';
const route=(church:string,id:string)=>`/weekly-bulletin-review.html?church=${encodeURIComponent(church)}&bulletin=${id}&track=promo`;
function client(){const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';if(!url||!key)throw new Error('config');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
type Db=ReturnType<typeof client>;
async function actor(request:Request,db:Db){const token=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];if(!token)return null;const found=await db.auth.getUser(token);return found.error?null:found.data.user;}
async function profile(db:Db,userId:string,church:string){const r=await db.rpc('get_weekly_bulletin_review_profile',{p_user:userId,p_church:church});return {editor:r.data?.editor===true,reviewer:r.data?.reviewer===true,staffId:String(r.data?.staff_id||'')};}
async function setting(db:Db,church:string){const r=await db.from('review_workflow_settings').select('initial_reviewer_id,final_reviewer_id').eq('church_id',church).eq('workflow_key','weekly_promo').maybeSingle();if(r.error)throw new Error('db');return r.data;}
async function staffId(db:Db,userId:string){const r=await db.from('pastoral_staff').select('id').eq('app_user_id',userId).eq('is_active',true).maybeSingle();return r.data?.id||null;}
async function notify(db:Db,church:string,id:string,date:string,title:string,stage:'initial'|'final',version:number,by:string|null){
  const initial=stage==='initial',settings=await setting(db,church);let ids:string[]=[];
  if(initial){if(!settings?.initial_reviewer_id)throw new Error('reviewer_not_configured');const id=await staffId(db,settings.initial_reviewer_id);if(!id)throw new Error('reviewer_not_configured');ids=[id];}
  else{const r=await db.rpc('get_weekly_bulletin_reviewers',{p_church:church});ids=(Array.isArray(r.data)?r.data:[]).map((v:{id:string})=>v.id).filter((recipient:string)=>recipient!==by);}
  const url=route(church,id);
  for(const recipient of ids){const key=`weekly-promo:${id}:${version}:${stage}:${recipient}`;
    await db.from('pastoral_tasks').upsert({entity_key:entity(church),title:`${date} 主日社群預告${initial?'初審':'審核'}`,description:`${title} 等待${initial?'鈺庭初審':'牧師或師母審核'}。`,task_type:'document',status:'pending',assigned_to:recipient,created_by:by,idempotency_key:key,payload:{workflow:'weekly_promo_review',bulletin_id:id,version,stage,action_url:url}},{onConflict:'idempotency_key',ignoreDuplicates:true});
    await notifyStaffDual({db,staffId:recipient,churchId:church,eventKey:'weekly_bulletin_review',routeKey:'weekly_bulletin_review',sourceKey:key,title:'主日社群預告等待審核',body:`${date} 的預告請進行${initial?'初審':'審核'}。`,url,lineMessage:`主日社群預告等待${initial?'初審':'審核'}：${date}\n${ORIGIN}${url}`,idempotencyKey:key});
  }
  return ids.length;
}
async function closeTasks(db:Db,church:string,id:string,stage:string,version:number){await db.from('pastoral_tasks').update({status:'completed',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('entity_key',entity(church)).eq('status','pending').contains('payload',{workflow:'weekly_promo_review',bulletin_id:id,version,stage});}
async function notifyEditor(db:Db,church:string,promo:any,status:'approved'|'changes_requested',comment:string){
  if(!promo.submitted_by)return;const recipient=await staffId(db,promo.submitted_by);if(!recipient)return;
  const approved=status==='approved',key=`weekly-promo-result:${promo.bulletin_id}:${promo.version}:${status}`,url=`/website-maintenance.html?church=${encodeURIComponent(church)}&bulletin=${promo.bulletin_id}&tab=promo`,title=approved?'主日社群預告已核准':'主日社群預告已退回修改',body=approved?`${promo.snapshot.service_date} 的預告已通過複審。週報上稿頁可帶入核准資料。`:`${promo.snapshot.service_date} 的預告需要修改。審核意見：${comment}`;
  await notifyStaffDual({db,staffId:recipient,churchId:church,eventKey:approved?'weekly_bulletin_approved':'weekly_bulletin_changes_requested',routeKey:'weekly_bulletin_result',sourceKey:key,title,body,url,lineMessage:`${title}\n${body}\n${ORIGIN}${url}`,idempotencyKey:key});
}
function snapshot(row:any){return {service_date:row.service_date,title:row.title,sermon_topic:row.sermon_topic,sermon_scripture:row.sermon_scripture,sermon_speaker:row.sermon_speaker,speaker_photo_path:row.speaker_photo_path,subtitle:row.subtitle,service_time:row.service_time,hero_image_path:row.hero_image_path,reel_cover_image_path:row.reel_cover_image_path,reel_enabled:row.reel_enabled,reel_video_path:row.reel_video_path,reel_caption:row.reel_caption,youtube_sync_enabled:row.youtube_sync_enabled,youtube_video_id:row.youtube_video_id,youtube_title:row.youtube_title,youtube_description:row.youtube_description,youtube_tags:row.youtube_tags};}
async function handle(request:Request,db:Db,user:{id:string},origin:string){
  const body=await request.json().catch(()=>null),church=body?.church,id=String(body?.bulletinId||'');if(!body||!['M+','SHiNE'].includes(church)||typeof body.action!=='string')return json(origin,{ok:false,error:'invalid_request'},400);
  const access=await profile(db,user.id,church),settings=await setting(db,church),initial=settings?.initial_reviewer_id===user.id,final=access.reviewer;
  if(!access.editor)return json(origin,{ok:false,error:'forbidden'},403);
  if(body.action==='list'){
    if(!initial&&!final)return json(origin,{ok:false,error:'reviewer_required'},403);
    const r=await db.from('website_weekly_promos').select('bulletin_id,status,version,submitted_at,submitted_by,review_comment,snapshot').eq('church_id',church).in('status',['pending_initial','pending_review','changes_requested','approved']).order('submitted_at',{ascending:false}).limit(50);
    if(r.error)throw new Error('db');return json(origin,{ok:true,items:(r.data||[]).filter((v:any)=>v.status==='pending_initial'?initial&&v.submitted_by!==user.id:final&&v.submitted_by!==user.id).map((v:any)=>({id:v.bulletin_id,service_date:v.snapshot?.service_date,title:v.snapshot?.sermon_topic||v.snapshot?.title,status:v.status,version:v.version,submitted_at:v.submitted_at,review_comment:v.review_comment,track:'promo'}))});
  }
  if(!UUID.test(id))return json(origin,{ok:false,error:'invalid_request'},400);
  const result=await db.from('website_weekly_promos').select('*').eq('bulletin_id',id).eq('church_id',church).maybeSingle();if(result.error)throw new Error('db');const promo=result.data;
  if(body.action==='status'){return json(origin,{ok:true,submitStage:initial?'final':'initial',promo:promo?{status:promo.status,version:promo.version,review_comment:promo.review_comment,snapshot:promo.snapshot,directToFinal:promo.submitted_by===settings?.initial_reviewer_id&&promo.status==='pending_review'}:null});}
  if(body.action==='get'){
    if(!initial&&!final)return json(origin,{ok:false,error:'reviewer_required'},403);
    if(!promo)return json(origin,{ok:false,error:'not_found'},404);
    return json(origin,{ok:true,promo:{id,church_id:church,...promo.snapshot,status:promo.status,version:promo.version,review_comment:promo.review_comment},canDecide:promo.submitted_by!==user.id&&(promo.status==='pending_initial'?initial:final)});
  }
  if(body.action==='submit'){
    if(promo&&!['draft','changes_requested'].includes(promo.status))return json(origin,{ok:false,error:'invalid_status'},409);
    const stage=initial?'final':'initial';
    if(!settings?.initial_reviewer_id||!await staffId(db,settings.initial_reviewer_id))return json(origin,{ok:false,error:'reviewer_not_configured'},409);
    if(stage==='final'){const reviewers=await db.rpc('get_weekly_bulletin_reviewers',{p_church:church});if(reviewers.error||!Array.isArray(reviewers.data)||!reviewers.data.some((person:{app_user_id:string})=>person.app_user_id!==user.id))return json(origin,{ok:false,error:'reviewer_not_configured'},409);}
    const rowResult=await db.from('website_weekly_bulletins').select('*').eq('id',id).eq('church_id',church).maybeSingle(),row=rowResult.data;
    if(rowResult.error||!row)return json(origin,{ok:false,error:'not_found'},404);
    if(!['draft','changes_requested'].includes(row.status))return json(origin,{ok:false,error:'bulletin_locked'},409);
    if(!row.sermon_topic||!row.sermon_scripture||!row.sermon_speaker||!row.hero_image_path||!row.reel_cover_image_path||church==='M+'&&(!row.reel_enabled||!row.reel_video_path))return json(origin,{ok:false,error:'promo_incomplete'},400);
    const jobs=await db.from('weekly_canva_jobs').select('id,input').eq('bulletin_id',id).eq('church_id',church).eq('status','ready').order('created_at',{ascending:false}).limit(10);
    if(jobs.error)throw new Error('db');
    const base=(jobs.data||[]).find((item:any)=>item.input?.TOPIC===row.sermon_topic&&item.input?.SCRIPTURE===row.sermon_scripture&&item.input?.SPEAKER===row.sermon_speaker&&item.input?.SERVICE_DATE===row.service_date);
    const status=stage==='final'?'pending_review':'pending_initial';
    const data={bulletin_id:id,church_id:church,status,version:(promo?.version||0)+1,snapshot:{...snapshot(row),canva_base_job_id:base?.id||null},submitted_by:user.id,submitted_at:new Date().toISOString(),reviewed_by:null,reviewed_at:null,review_comment:null,updated_at:new Date().toISOString()};
    const saved=promo?await db.from('website_weekly_promos').update(data).eq('bulletin_id',id).eq('status',promo.status).eq('version',promo.version).select('bulletin_id').maybeSingle():await db.from('website_weekly_promos').insert(data).select('bulletin_id').maybeSingle();
    if(saved.error||!saved.data)return json(origin,{ok:false,error:'conflict'},409);
    await db.from('website_weekly_bulletin_review_events').insert({bulletin_id:id,church_id:church,bulletin_version:data.version,track:'promo',action:'submitted',actor_user_id:user.id});
    let notificationPending=false;try{await notify(db,church,id,row.service_date,row.sermon_topic,stage,data.version,access.staffId||null);}catch{notificationPending=true;}
    return json(origin,{ok:true,status,notificationPending});
  }
  if(body.action==='approve'||body.action==='request_changes'){
    if(!promo)return json(origin,{ok:false,error:'not_found'},404);
    const stage=promo.status==='pending_initial'?'initial':promo.status==='pending_review'?'final':'';
    if(!stage||Number(body.version)!==promo.version)return json(origin,{ok:false,error:'conflict'},409);
    if(promo.submitted_by===user.id)return json(origin,{ok:false,error:'self_review_forbidden'},403);
    if(stage==='initial'&&!initial||stage==='final'&&!final)return json(origin,{ok:false,error:'reviewer_required'},403);
    const approved=body.action==='approve',comment=String(body.comment||'').trim().slice(0,2000);if(!approved&&!comment)return json(origin,{ok:false,error:'comment_required'},400);
    const next=approved?(stage==='initial'?'pending_review':'approved'):'changes_requested',now=new Date().toISOString();
    const saved=await db.from('website_weekly_promos').update({status:next,reviewed_by:user.id,reviewed_at:now,review_comment:comment||null,updated_at:now,...(next==='approved'?{approved_at:now}:{})}).eq('bulletin_id',id).eq('status',promo.status).eq('version',promo.version).select('bulletin_id').maybeSingle();
    if(saved.error||!saved.data)return json(origin,{ok:false,error:'conflict'},409);
    await db.from('website_weekly_bulletin_review_events').insert({bulletin_id:id,church_id:church,bulletin_version:promo.version,track:'promo',action:approved?(stage==='initial'?'initial_approved':'approved'):'changes_requested',actor_user_id:user.id,comment:comment||null});
    await closeTasks(db,church,id,stage,promo.version).catch(()=>undefined);
    let notificationPending=false;
    if(next==='pending_review')try{await notify(db,church,id,promo.snapshot.service_date,promo.snapshot.sermon_topic,'final',promo.version,access.staffId||null);}catch{notificationPending=true;}
    if(next==='approved'||next==='changes_requested')try{await notifyEditor(db,church,promo,next,comment);}catch{notificationPending=true;}
    if(next==='approved'){
      const token=request.headers.get('authorization')||'';
      if(church==='M+'&&promo.snapshot.youtube_sync_enabled)EdgeRuntime.waitUntil(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/youtube-oauth`,{method:'POST',headers:{authorization:token,'content-type':'application/json',origin:ORIGIN},body:JSON.stringify({action:'weekly_sync',church,bulletinId:id,version:promo.version})}).catch(()=>undefined));
      if(church==='M+'&&promo.snapshot.reel_enabled)EdgeRuntime.waitUntil(fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/instagram-publishing`,{method:'POST',headers:{authorization:token,'content-type':'application/json',origin:ORIGIN},body:JSON.stringify({action:'publish',church,bulletinId:id})}).catch(()=>undefined));
    }
    return json(origin,{ok:true,status:next,notificationPending});
  }
  return json(origin,{ok:false,error:'invalid_action'},400);
}
Deno.serve(async request=>{const origin=request.headers.get('origin')||'';if(request.method==='OPTIONS')return origin===ORIGIN?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false,error:'forbidden'},403);if(request.method!=='POST'||origin!==ORIGIN)return json(origin,{ok:false,error:'forbidden'},403);let db:Db;try{db=client();}catch{return json(origin,{ok:false,error:'unavailable'},503);}const user=await actor(request,db);if(!user)return json(origin,{ok:false,error:'login_required'},401);try{return await handle(request,db,user,origin);}catch{return json(origin,{ok:false,error:'unavailable'},503);}});
