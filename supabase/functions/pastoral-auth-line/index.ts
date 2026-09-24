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

async function hashEnrollmentCode(code:string){
  const hex=code.replace(/^MPLUS-/,'').replaceAll('-','').toLowerCase();
  const codeBytes=Uint8Array.from(hex.match(/.{2}/g)||[],pair=>parseInt(pair,16));
  const digest=await crypto.subtle.digest('SHA-256',codeBytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return allowedOrigins.has(origin)
    ?new Response('ok',{headers:cors(origin)})
    :respond(origin,{ok:false,error:'forbidden'},403);
  if(request.method!=='POST'||!allowedOrigins.has(origin))return respond(origin,{ok:false,error:'forbidden'},403);
  const authorization=request.headers.get('authorization')||'';
  const match=authorization.match(/^Bearer\s+(\S+)$/i);
  if(!match)return respond(origin,{ok:false,error:'login_required'},401);
  const subject=await verifyLineIdToken(match[1]);
  if(!subject)return respond(origin,{ok:false,error:'login_required'},401);

  const requestBody=await request.json().catch(()=>({}));
  const enrollmentCode=requestBody&&typeof requestBody==='object'&&!Array.isArray(requestBody)
    ?(requestBody as Record<string,unknown>).enrollment_code:'';
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return respond(origin,{ok:false,error:'unavailable'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const lookup=await db.from('pastoral_staff')
    .select('id,display_name,role,is_active').eq('line_subject',subject).maybeSingle();
  if(lookup.error)return respond(origin,{ok:false,error:'unavailable'},503);
  const staff=lookup.data;
  if(staff&&!staff.is_active)return respond(origin,{ok:false,error:'staff_forbidden'},403);
  if(!staff){
    if(typeof enrollmentCode!=='string'||
       enrollmentCode.length!==41||
       !/^MPLUS-[0-9A-F]{8}(?:-[0-9A-F]{8}){3}$/.test(enrollmentCode)){
      return respond(origin,{ok:false,error:'staff_forbidden'},403);
    }
    const claim=await db.rpc('claim_pastoral_identity_invite',{
      p_code_hash:await hashEnrollmentCode(enrollmentCode),
      p_line_subject:subject,
    });
    if(claim.error)return respond(origin,{ok:false,error:'unavailable'},503);
    if(claim.data!=='claimed')return respond(origin,{ok:false,error:'invite_invalid'},403);
    return respond(origin,{ok:false,error:'identity_recorded'},202);
  }
  const access=await db.from('pastoral_staff_access').select('entity_key').eq('staff_id',staff.id);
  if(access.error)return respond(origin,{ok:false,error:'unavailable'},503);
  const churches=[...new Set((access.data||[]).map(row=>({mplus:'M+',shine:'SHiNE',tcsc:'台灣基督教社會關懷協會'} as Record<string,string>)[row.entity_key]).filter(Boolean))];
  if(!churches.length)return respond(origin,{ok:false,error:'staff_forbidden'},403);
  return respond(origin,{ok:true,staff:{name:staff.display_name,role:staff.role,churches}});
});