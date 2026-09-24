import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const CHANNEL_ID='2011645391';
const allowedOrigins=new Set(['https://mscos.mchurch.online']);
const cors=(origin:string)=>({
  ...(allowedOrigins.has(origin)?{'access-control-allow-origin':origin}:{}),
  'access-control-allow-headers':'authorization,content-type,apikey',
  'access-control-allow-methods':'POST,OPTIONS',
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'vary':'Origin',
});
const respond=(origin:string,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(origin)});

async function verifyLineIdToken(token:string){
  if(!token||token.length>8192)return null;
  try{
    const response=await fetch('https://api.line.me/oauth2/v2.1/verify',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({id_token:token,client_id:CHANNEL_ID}),
    });
    if(!response.ok)return null;
    const claims=await response.json(),now=Math.floor(Date.now()/1000);
    if(claims.iss!=='https://access.line.me'||claims.aud!==CHANNEL_ID||
       !Number.isSafeInteger(claims.exp)||claims.exp<=now||
       !Number.isSafeInteger(claims.iat)||claims.iat>now+60||
       typeof claims.sub!=='string'||!/^U[0-9a-f]{32}$/.test(claims.sub))return null;
    return claims.sub as string;
  }catch{return null;}
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return allowedOrigins.has(origin)
    ?new Response('ok',{headers:cors(origin)})
    :respond(origin,{ok:false,error:'forbidden'},403);
  if(request.method!=='POST'||!allowedOrigins.has(origin))return respond(origin,{ok:false,error:'forbidden'},403);
  const authorization=request.headers.get('authorization')||'';
  const match=authorization.match(/^Bearer ([^\s]+)$/i);
  if(!match)return respond(origin,{ok:false,error:'login_required'},401);
  const subject=await verifyLineIdToken(match[1]);
  if(!subject)return respond(origin,{ok:false,error:'login_required'},401);

  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return respond(origin,{ok:false,error:'unavailable'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const lookup=await db.from('pastoral_staff')
    .select('id,display_name,role,is_active').eq('line_subject',subject).maybeSingle();
  if(lookup.error)return respond(origin,{ok:false,error:'unavailable'},503);
  const staff=lookup.data;
  if(!staff||!staff.is_active)return respond(origin,{ok:false,error:'staff_forbidden'},403);
  const access=await db.from('pastoral_staff_access').select('entity_key').eq('staff_id',staff.id);
  if(access.error)return respond(origin,{ok:false,error:'unavailable'},503);
  const churches=[...new Set((access.data||[]).map(row=>({mplus:'M+',shine:'SHiNE'} as Record<string,string>)[row.entity_key]).filter(Boolean))];
  if(!churches.length)return respond(origin,{ok:false,error:'staff_forbidden'},403);
  return respond(origin,{ok:true,staff:{name:staff.display_name,role:staff.role,churches}});
});
