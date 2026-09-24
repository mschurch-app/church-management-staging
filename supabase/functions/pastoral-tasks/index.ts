import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {validTaskInput, validTaskTransition} from './task-policy.ts';

const CHANNEL_ID='2011645391';
const APP_ORIGIN='https://mscos.mchurch.online';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Staff={id:string;role:string;entityKeys:string[]};
const allowedEntity=(value:unknown):value is string=>value==='mplus'||value==='shine'||value==='tcsc';
function headers(origin:string){return {
  ...(origin===APP_ORIGIN?{'access-control-allow-origin':origin}:{}),
  'access-control-allow-headers':'authorization,content-type,apikey',
  'access-control-allow-methods':'POST,OPTIONS',
  'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
};}
function json(origin:string,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:headers(origin)});}
function adminClient(){
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)throw new Error('config');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
async function verifyLineIdToken(token:string){
  if(!token||token.length>8192)return null;
  try{
    const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:token,client_id:CHANNEL_ID})});
    if(!response.ok)return null;
    const claims=await response.json(),now=Math.floor(Date.now()/1000);
    if(claims.iss!=='https://access.line.me'||claims.aud!==CHANNEL_ID||!Number.isSafeInteger(claims.exp)||claims.exp<=now||
      !Number.isSafeInteger(claims.iat)||claims.iat>now+60||typeof claims.sub!=='string'||!/^U[0-9a-f]{32}$/.test(claims.sub))return null;
    return claims.sub as string;
  }catch{return null;}
}
async function staffFromRequest(request:Request,db:ReturnType<typeof adminClient>):Promise<Staff|null>{
  const match=(request.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i);
  if(!match)return null;
  const subject=await verifyLineIdToken(match[1]);if(!subject)return null;
  const lookup=await db.from('pastoral_staff').select('id,role,is_active').eq('line_subject',subject).maybeSingle();
  if(lookup.error)throw new Error('db');
  if(!lookup.data?.is_active)return null;
  const access=await db.from('pastoral_staff_access').select('entity_key').eq('staff_id',lookup.data.id);
  if(access.error)throw new Error('db');
  return {id:lookup.data.id,role:lookup.data.role,entityKeys:[...new Set((access.data||[]).map((r:{entity_key:string})=>r.entity_key))]};
}
const canManage=(staff:Staff)=>staff.role==='pastor'||staff.role==='admin';
async function activeEntityStaff(db:ReturnType<typeof adminClient>,entityKey:string){
  const access=await db.from('pastoral_staff_access').select('staff_id').eq('entity_key',entityKey);
  if(access.error)throw new Error('db');
  const ids=[...new Set((access.data||[]).map((row:{staff_id:string})=>row.staff_id))];
  if(!ids.length)return [];
  const result=await db.from('pastoral_staff').select('id,display_name,role').eq('is_active',true).in('id',ids).order('display_name');
  if(result.error)throw new Error('db');
  return result.data||[];
}
async function handle(request:Request,db:ReturnType<typeof adminClient>,staff:Staff){
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.action!=='string'||!allowedEntity(body.entityKey))return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
  const entityKey=body.entityKey as string;
  if(!staff.entityKeys.includes(entityKey))return json(APP_ORIGIN,{ok:false,error:'entity_forbidden'},403);
  if(body.action==='assignees'){
    const people=await activeEntityStaff(db,entityKey);
    return json(APP_ORIGIN,{ok:true,staff:people.map((p:{id:string;display_name:string;role:string})=>({id:p.id,name:p.display_name,role:p.role}))});
  }
  if(body.action==='create'){
    if(!canManage(staff))return json(APP_ORIGIN,{ok:false,error:'pastor_required'},403);
    if(!validTaskInput(body))return json(APP_ORIGIN,{ok:false,error:'invalid_task'},400);
    const people=await activeEntityStaff(db,entityKey);
    if(!people.some((p:{id:string})=>p.id===body.assignedTo))return json(APP_ORIGIN,{ok:false,error:'invalid_assignee'},400);
    const values={entity_key:entityKey,title:(body.title as string).trim(),description:(body.description as string||'').trim(),
      task_type:body.taskType,status:'draft',assigned_to:body.assignedTo,created_by:staff.id,
      idempotency_key:body.idempotencyKey,due_at:body.dueAt||null};
    const inserted=await db.from('pastoral_tasks').insert(values).select('id').single();
    if(inserted.error){
      if(inserted.error.code==='23505'){
        const previous=await db.from('pastoral_tasks').select('id').eq('idempotency_key',body.idempotencyKey).eq('created_by',staff.id).maybeSingle();
        if(!previous.error&&previous.data)return json(APP_ORIGIN,{ok:true,id:previous.data.id,duplicate:true});
      }
      throw new Error('db');
    }
    return json(APP_ORIGIN,{ok:true,id:inserted.data.id});
  }
  if(body.action==='list'){
    let query=db.from('pastoral_tasks').select('id,title,description,task_type,status,assigned_to,created_by,approved_by,due_at,created_at')
      .eq('entity_key',entityKey).order('created_at',{ascending:false}).limit(100);
    if(!canManage(staff))query=query.or(`assigned_to.eq.${staff.id},created_by.eq.${staff.id}`);
    const result=await query;
    if(result.error)throw new Error('db');
    const rows=result.data||[];
    const people=await activeEntityStaff(db,entityKey);
    const names=new Map(people.map((p:{id:string;display_name:string})=>[p.id,p.display_name]));
    return json(APP_ORIGIN,{ok:true,tasks:rows.map((row:{id:string;title:string;description:string;task_type:string;status:string;assigned_to:string|null;created_by:string|null;approved_by:string|null;due_at:string|null})=>({
      id:row.id,title:row.title,description:row.description,taskType:row.task_type,status:row.status,assigneeName:row.assigned_to?names.get(row.assigned_to)||'已停用同工':'未指派',dueAt:row.due_at,
      canSubmit:row.status==='draft'&&canManage(staff)&&row.created_by===staff.id,
      canApprove:row.status==='pending'&&canManage(staff),
      canComplete:row.status==='approved'&&(row.assigned_to===staff.id||canManage(staff)),
    }))});
  }
  if(['submit','approve','complete'].includes(body.action)){
    if(typeof body.taskId!=='string'||!UUID.test(body.taskId))return json(APP_ORIGIN,{ok:false,error:'invalid_request'},400);
    const currentStatus=body.action==='submit'?'draft':body.action==='approve'?'pending':'approved';
    const nextStatus=({submit:'pending',approve:'approved',complete:'completed'} as Record<string,string>)[body.action];
    if(!validTaskTransition(currentStatus,nextStatus))return json(APP_ORIGIN,{ok:false,error:'invalid_transition'},409);
    if((body.action==='submit'||body.action==='approve')&&!canManage(staff))return json(APP_ORIGIN,{ok:false,error:'pastor_required'},403);
    if(body.action==='complete'&&!canManage(staff)){
      const assigned=await db.from('pastoral_tasks').select('assigned_to,status').eq('id',body.taskId).eq('entity_key',entityKey).maybeSingle();
      if(assigned.error)throw new Error('db');
      if(!assigned.data||assigned.data.assigned_to!==staff.id||assigned.data.status!=='approved')return json(APP_ORIGIN,{ok:false,error:'invalid_transition'},409);
    }
    let update=db.from('pastoral_tasks').update({status:nextStatus,updated_at:new Date().toISOString(),
      ...(body.action==='approve'?{approved_by:staff.id}:{}),...(body.action==='complete'?{completed_at:new Date().toISOString()}:{})})
      .eq('id',body.taskId).eq('entity_key',entityKey)
      .eq('status',body.action==='submit'?'draft':body.action==='approve'?'pending':'approved');
    if(body.action==='submit'&&!canManage(staff))return json(APP_ORIGIN,{ok:false,error:'pastor_required'},403);
    if(body.action==='submit')update=update.eq('created_by',staff.id);
    if(body.action==='complete'&&!canManage(staff))update=update.eq('assigned_to',staff.id);
    const saved=await update.select('id').maybeSingle();
    if(saved.error)throw new Error('db');
    if(!saved.data)return json(APP_ORIGIN,{ok:false,error:'invalid_transition'},409);
    return json(APP_ORIGIN,{ok:true,status:nextStatus});
  }
  return json(APP_ORIGIN,{ok:false,error:'invalid_action'},400);
}
Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return origin===APP_ORIGIN?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false,error:'forbidden'},403);
  if(request.method!=='POST'||origin!==APP_ORIGIN)return json(origin,{ok:false,error:'forbidden'},403);
  let db:ReturnType<typeof adminClient>;try{db=adminClient();}catch{return json(origin,{ok:false,error:'unavailable'},503);}
  const staff=await staffFromRequest(request,db).catch(()=>null);
  if(!staff)return json(origin,{ok:false,error:'login_required'},401);
  try{return await handle(request,db,staff);}catch{return json(origin,{ok:false,error:'unavailable'},503);}
});
