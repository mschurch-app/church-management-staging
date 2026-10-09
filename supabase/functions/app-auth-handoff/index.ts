import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
const origins=new Set(['https://mscos.mchurch.online']);
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'',headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
 const result=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!origins.has(origin))return result({error:'origin_not_allowed'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return result({error:'method_not_allowed'},405);
 try{
  const raw=await request.text();if(raw.length>16000)return result({error:'too_large'},413);
  const body=JSON.parse(raw),{action,id,secret}=body;
  if(!/^[0-9a-f-]{36}$/i.test(id||'')||!/^[0-9a-f]{64}$/.test(secret||'')||!['complete','read','finish'].includes(action))return result({error:'invalid_request'},400);
  const hash=await digest(secret),now=new Date().toISOString();
  if(action==='complete'){
   const token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');
   const verified=await db.auth.getUser(token);
   const user=verified.data.user;
   if(verified.error||!user?.identities?.some(i=>i.provider==='custom:line-web'))return result({error:'invalid_line_session'},401);
   const cipher=body.cipher;
   if(!cipher||!/^[A-Za-z0-9+/]{16}$/.test(cipher.iv||'')||typeof cipher.data!=='string'||cipher.data.length<32||cipher.data.length>13000||!/^[A-Za-z0-9+/]+={0,2}$/.test(cipher.data))return result({error:'invalid_cipher'},400);
   // Cleanup and rate limits happen only for a verified LINE user.
   await db.from('app_auth_handoffs').delete().lt('expires_at',now);
   const recent=await db.from('app_auth_handoffs').select('id',{count:'exact',head:true}).eq('creator_user_id',user.id).gte('created_at',new Date(Date.now()-300000).toISOString());
   if(recent.error)return result({error:'unavailable'},503);
   if((recent.count||0)>=20)return result({error:'rate_limited'},429);
   const inserted=await db.from('app_auth_handoffs').insert({id,secret_hash:hash,cipher_payload:cipher,creator_user_id:user.id});
   if(inserted.error){
    if(inserted.error.code!=='23505')return result({error:'unavailable'},503);
    const existing=await db.from('app_auth_handoffs').select('id').eq('id',id).eq('secret_hash',hash).eq('creator_user_id',user.id).gt('expires_at',now).maybeSingle();
    if(existing.error||!existing.data)return result({error:'invalid_handoff'},409);
   }
   return result({ready:true});
  }
  const stored=await db.from('app_auth_handoffs').select('cipher_payload').eq('id',id).eq('secret_hash',hash).gt('expires_at',now).maybeSingle();
  if(stored.error)return result({error:'unavailable'},503);
  // Incorrect capabilities disclose neither existence nor user information.
  if(!stored.data)return result({ready:false});
  if(action==='finish'){
   const deleted=await db.from('app_auth_handoffs').delete().eq('id',id).eq('secret_hash',hash);
   if(deleted.error)return result({error:'unavailable'},503);
   return result({finished:true});
  }
  return result({ready:true,cipher:stored.data.cipher_payload});
 }catch{return result({error:'invalid_request'},400);}
});
