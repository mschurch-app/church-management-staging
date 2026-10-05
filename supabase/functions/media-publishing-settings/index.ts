import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const APP='https://mscos.mchurch.online';
const FIELDS=['sermon_analysis_enabled','youtube_captions_enabled','instagram_sermon_enabled','instagram_weekly_reel_enabled','instagram_weekday_reel_enabled','instagram_holiday_reel_enabled'] as const;
const cors=(origin:string)=>({...(origin===APP?{'access-control-allow-origin':origin}:{}),'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'});
const json=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(origin)});
function client(){const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';if(!url||!key)throw Error('config');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
async function user(req:Request,db:any){const token=(req.headers.get('authorization')||'').match(/^Bearer ([^\s]+)$/i)?.[1];if(!token)return null;const result=await db.auth.getUser(token);return result.error?null:result.data.user}
async function allowed(db:any,userId:string,church:string){const result=await db.rpc('get_weekly_bulletin_review_profile',{p_user:userId,p_church:church});return result.data?.reviewer===true}

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  if(req.method==='OPTIONS')return origin===APP?new Response('ok',{headers:cors(origin)}):json(origin,{ok:false,error:'forbidden'},403);
  if(req.method!=='POST'||origin!==APP)return json(origin,{ok:false,error:'forbidden'},403);
  let db;try{db=client()}catch{return json(origin,{ok:false,error:'unavailable'},503)}
  const current=await user(req,db);if(!current)return json(origin,{ok:false,error:'login_required'},401);
  const body=await req.json().catch(()=>null),church=body?.church;
  if(!body||!['M+','SHiNE'].includes(church)||!['get','save'].includes(body.action))return json(origin,{ok:false,error:'invalid_request'},400);
  if(!await allowed(db,current.id,church))return json(origin,{ok:false,error:'forbidden'},403);
  try{
    if(body.action==='save'){
      const payload:any={church_id:church,updated_by:current.id,updated_at:new Date().toISOString()};
      for(const field of FIELDS)payload[field]=body.settings?.[field]===true;
      const saved=await db.from('media_publishing_settings').upsert(payload,{onConflict:'church_id'}).select('*').single();
      if(saved.error)throw saved.error;
    }
    const [settings,instagram,youtube]=await Promise.all([
      db.from('media_publishing_settings').select('*').eq('church_id',church).single(),
      db.from('instagram_publishing_connections').select('username,status,last_verified_at,last_error').eq('church_id',church).maybeSingle(),
      db.from('youtube_oauth_connections').select('channel_title,status,last_verified_at,last_error').eq('church_id',church).maybeSingle(),
    ]);
    if(settings.error)throw settings.error;
    return json(origin,{ok:true,settings:settings.data,connections:{instagram:instagram.data||null,youtube:youtube.data||null}});
  }catch(error){console.error(error);return json(origin,{ok:false,error:'unavailable'},503)}
});
