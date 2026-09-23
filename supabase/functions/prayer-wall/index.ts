import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

type Body={action?:unknown;church?:unknown;idToken?:unknown;request_id?:unknown;prayer_id?:unknown;title?:unknown;content?:unknown;is_private?:unknown;comment?:unknown};
const churches=new Set(['M+','SHiNE']);
const allowedOrigins=new Set((Deno.env.get('PRAYER_ALLOWED_ORIGINS')||'https://mschurch-app.github.io,https://mscos.mchurch.online,http://127.0.0.1:4180,http://localhost:4180').split(',').map(v=>v.trim()).filter(Boolean));
const cors=(origin:string)=>({'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'content-type, apikey, authorization','access-control-allow-methods':'POST, OPTIONS','content-type':'application/json; charset=utf-8','vary':'Origin','cache-control':'no-store'});
const respond=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(origin)});
const clean=(value:unknown,max:number)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
const isUuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function overWriteLimit(db:ReturnType<typeof createClient>,table:'prayers'|'prayer_comments',lineUserId:string,maximum:number){
  const since=new Date(Date.now()-60_000).toISOString();
  const result=await db.from(table).select('id',{count:'exact',head:true}).eq('line_user_id',lineUserId).gte('created_at',since);
  if(result.error)throw new Error('rate_check_failed');
  return (result.count||0)>=maximum;
}

async function verifyLine(idToken:unknown){
  const channel=Deno.env.get('LINE_LOGIN_CHANNEL_ID')||'2011645391';
  if(typeof idToken!=='string'||idToken.length>8192||!idToken)return null;
  try{
    const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:idToken,client_id:channel})});
    if(!response.ok)return null;
    const claims=await response.json(),now=Math.floor(Date.now()/1000);
    if(claims.iss!=='https://access.line.me'||claims.aud!==channel||!Number.isSafeInteger(claims.exp)||claims.exp<=now||!Number.isSafeInteger(claims.iat)||claims.iat>now+60||typeof claims.sub!=='string'||!/^U[0-9a-f]{32}$/.test(claims.sub))return null;
    return {subject:claims.sub,name:clean(claims.name,80)||'主內家人'};
  }catch{return null;}
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors(origin)});
  if(request.method!=='POST'||!allowedOrigins.has(origin))return respond(origin,{ok:false,error:'forbidden'},403);
  let body:Body={};try{body=await request.json();}catch{return respond(origin,{ok:false,error:'invalid_request'},400);}
  const church=clean(body.church,10),identity=await verifyLine(body.idToken);
  if(!churches.has(church))return respond(origin,{ok:false,error:'invalid_church'},400);
  if(!identity)return respond(origin,{ok:false,error:'login_required'},401);
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return respond(origin,{ok:false,error:'unavailable'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

  if(body.action==='list'){
    const now=new Date(),since=new Date(now.getTime()-3*60*60*1000).toISOString();
    const prayers=await db.from('prayers').select('id,author_name,group_name,title,content,hands_count,is_answered,created_at,expires_at').eq('church_id',church).eq('is_private',false).gt('expires_at',now.toISOString()).order('created_at',{ascending:false}).limit(120);
    if(prayers.error)return respond(origin,{ok:false,error:'unavailable'},503);
    const ids=(prayers.data||[]).map(row=>row.id);
    if(!ids.length)return respond(origin,{ok:true,prayers:[]});
    const [comments,events]=await Promise.all([
      db.from('prayer_comments').select('id,prayer_id,author_name,comment_text,created_at').eq('church_id',church).in('prayer_id',ids).order('created_at',{ascending:true}).limit(600),
      db.from('prayer_intercessions').select('prayer_id,created_at').eq('church_id',church).in('prayer_id',ids).gte('created_at',since)
    ]);
    if(comments.error||events.error)return respond(origin,{ok:false,error:'unavailable'},503);
    const grouped=new Map<number,unknown[]>(),halos=new Map<number,number>();
    for(const row of comments.data||[]){const list=grouped.get(row.prayer_id)||[];list.push(row);grouped.set(row.prayer_id,list);}
    for(const row of events.data||[])halos.set(row.prayer_id,Math.min(7,(halos.get(row.prayer_id)||0)+1));
    return respond(origin,{ok:true,prayers:(prayers.data||[]).map(row=>({...row,comments:grouped.get(row.id)||[],halo_level:halos.get(row.id)||0}))});
  }

  if(body.action==='pray'){
    const prayerId=Number(body.prayer_id);
    if(!Number.isSafeInteger(prayerId)||prayerId<=0||!isUuid(body.request_id))return respond(origin,{ok:false,error:'invalid_request'},400);
    const result=await db.rpc('record_prayer_intercession',{p_request_id:body.request_id,p_prayer_id:prayerId,p_church_id:church,p_line_user_id:identity.subject});
    if(result.error||!result.data?.[0])return respond(origin,{ok:false,error:result.error?.message?.includes('rate_limited')?'rate_limited':'prayer_unavailable'},result.error?.message?.includes('rate_limited')?429:409);
    return respond(origin,{ok:true,...result.data[0]});
  }

  if(body.action==='comment'){
    const prayerId=Number(body.prayer_id),comment=clean(body.comment,300);
    if(!Number.isSafeInteger(prayerId)||prayerId<=0||comment.length<2||!isUuid(body.request_id))return respond(origin,{ok:false,error:'invalid_request'},400);
    const parent=await db.from('prayers').select('id').eq('id',prayerId).eq('church_id',church).eq('is_private',false).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(parent.error||!parent.data)return respond(origin,{ok:false,error:'prayer_unavailable'},409);
    try{if(await overWriteLimit(db,'prayer_comments',identity.subject,8))return respond(origin,{ok:false,error:'rate_limited'},429);}catch{return respond(origin,{ok:false,error:'unavailable'},503);}
    const inserted=await db.from('prayer_comments').insert({prayer_id:prayerId,church_id:church,line_user_id:identity.subject,author_name:identity.name,comment_text:comment,wall_request_id:body.request_id}).select('id,prayer_id,author_name,comment_text,created_at').single();
    if(inserted.error){if(inserted.error.code==='23505'){const previous=await db.from('prayer_comments').select('id,prayer_id,author_name,comment_text,created_at').eq('wall_request_id',body.request_id).eq('line_user_id',identity.subject).eq('church_id',church).maybeSingle();if(previous.data)return respond(origin,{ok:true,comment:previous.data});}return respond(origin,{ok:false,error:'unavailable'},503);}
    await db.from('prayer_activity').insert({prayer_id:prayerId,church_id:church,activity_type:'watched'});
    return respond(origin,{ok:true,comment:inserted.data});
  }

  if(body.action==='create'){
    const title=clean(body.title,80),content=clean(body.content,1000),isPrivate=body.is_private===true;
    if(title.length<2||content.length<2||!isUuid(body.request_id))return respond(origin,{ok:false,error:'invalid_request'},400);
    try{if(await overWriteLimit(db,'prayers',identity.subject,3))return respond(origin,{ok:false,error:'rate_limited'},429);}catch{return respond(origin,{ok:false,error:'unavailable'},503);}
    const inserted=await db.from('prayers').insert({church_id:church,line_user_id:identity.subject,author_name:identity.name,group_name:'未編組',title,content,hands_count:1,is_private:isPrivate,status:'pending',wall_request_id:body.request_id}).select('id').single();
    if(inserted.error){if(inserted.error.code==='23505'){const previous=await db.from('prayers').select('id,is_private').eq('wall_request_id',body.request_id).eq('line_user_id',identity.subject).eq('church_id',church).maybeSingle();if(previous.data)return respond(origin,{ok:true,id:previous.data.id,is_private:previous.data.is_private});}return respond(origin,{ok:false,error:'unavailable'},503);}
    if(!isPrivate)await db.from('prayer_activity').insert({prayer_id:inserted.data.id,church_id:church,activity_type:'created'});
    return respond(origin,{ok:true,id:inserted.data.id,is_private:isPrivate});
  }
  return respond(origin,{ok:false,error:'invalid_action'},400);
});
