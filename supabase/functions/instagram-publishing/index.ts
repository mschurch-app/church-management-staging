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
async function instagramProfile(token:string){
  const url=new URL('https://graph.instagram.com/me');
  url.searchParams.set('fields','user_id,username,name,account_type');
  const response=await fetch(url,{headers:{authorization:`Bearer ${token}`,'user-agent':'MPlusChurchOS/1.0'},signal:AbortSignal.timeout(12000),redirect:'error'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.username||!(data.user_id||data.id))throw new Error('invalid_token');
  return {id:String(data.user_id||data.id),username:String(data.username),accountType:String(data.account_type||'PROFESSIONAL')};
}

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return origin===APP_ORIGIN?new Response('ok',{headers:headers(origin)}):json(origin,{ok:false,error:'forbidden'},403);
  if(request.method!=='POST'||origin!==APP_ORIGIN)return json(origin,{ok:false,error:'forbidden'},403);
  let client;try{client=adminClient();}catch{return json(origin,{ok:false,error:'unavailable'},503);}
  const user=await currentUser(request,client.db);if(!user)return json(origin,{ok:false,error:'login_required'},401);
  const body=await request.json().catch(()=>null),church=body?.church;
  if(!body||!['M+','SHiNE'].includes(church)||typeof body.action!=='string')return json(origin,{ok:false,error:'invalid_request'},400);
  if(!await canManage(client.db,user.id,church))return json(origin,{ok:false,error:'forbidden'},403);
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
      const saved=await client.db.from('instagram_publishing_connections').upsert({church_id:church,instagram_user_id:profile.id,username:profile.username,account_type:profile.accountType,access_token_ciphertext:encrypted.ciphertext,access_token_iv:encrypted.iv,status:'connected',connected_by:user.id,connected_at:now,last_verified_at:now,last_error:null,updated_at:now},{onConflict:'church_id'});
      if(saved.error)throw saved.error;
      return json(origin,{ok:true,connection:{username:profile.username,instagram_user_id:profile.id,account_type:profile.accountType,status:'connected',connected_at:now,last_verified_at:now}});
    }
    if(body.action==='disconnect'){
      const result=await client.db.from('instagram_publishing_connections').delete().eq('church_id',church);
      if(result.error)throw result.error;return json(origin,{ok:true,connection:null});
    }
    return json(origin,{ok:false,error:'invalid_action'},400);
  }catch(error){
    const code=error instanceof Error&&error.message==='invalid_token'?'invalid_token':'unavailable';
    return json(origin,{ok:false,error:code},code==='invalid_token'?400:503);
  }
});
