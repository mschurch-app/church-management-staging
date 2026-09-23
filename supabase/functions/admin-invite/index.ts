import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const ROLE_PERMISSIONS:Record<string,string[]>={
  pastor:['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces'],
  pastor_spouse:['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces'],
  administrator:['attendance','groups','members','schedules','spaces'],
  group_leader:['attendance','groups','members'],
  care:['members','pastoral_chats','private_prayers'],
  facilities:['spaces']
};
const allowedOrigins=new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS')||'https://mschurch-app.github.io,https://mscos.mchurch.online,http://127.0.0.1:4180,http://localhost:4180').split(',').map(v=>v.trim()).filter(Boolean));
const headers=(origin:string)=>({'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://mschurch-app.github.io','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','vary':'Origin','content-type':'application/json; charset=utf-8'});
const reply=(origin:string,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});
const clean=(value:unknown,max=60)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return new Response('ok',{headers:headers(origin)});
  if(request.method!=='POST'||!allowedOrigins.has(origin))return reply(origin,{ok:false,error:'forbidden'},403);
  const url=Deno.env.get('SUPABASE_URL')||'',publishable=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'',secret=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const bearer=request.headers.get('authorization')||'';
  if(!url||!publishable||!secret||!bearer.startsWith('Bearer '))return reply(origin,{ok:false,error:'unauthorized'},401);
  const token=bearer.slice(7),userClient=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}),service=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const verified=await userClient.auth.getUser();
  if(verified.error||!verified.data.user)return reply(origin,{ok:false,error:'unauthorized'},401);
  let body:Record<string,unknown>={};try{body=await request.json();}catch{return reply(origin,{ok:false,error:'invalid_request'},400);}
  const email=clean(body.email,254).toLowerCase(),displayName=clean(body.display_name),jobTitle=clean(body.job_title),churchId=clean(body.church_id,10),roleKey=clean(body.role_key,40),permissions=ROLE_PERMISSIONS[roleKey];
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!displayName||!jobTitle||!['M+','SHiNE'].includes(churchId)||!permissions)return reply(origin,{ok:false,error:'invalid_request'},400);
  const ownerCheck=await userClient.rpc('list_admin_accounts_v3');
  if(ownerCheck.error)return reply(origin,{ok:false,error:'not_owner'},403);
  const redirectTo=Deno.env.get('ADMIN_INVITE_REDIRECT_URL')||'https://mschurch-app.github.io/church-management-staging/admin-set-password.html';
  const invited=await service.auth.admin.inviteUserByEmail(email,{redirectTo,data:{display_name:displayName,job_title:jobTitle}});
  if(invited.error||!invited.data.user){
    const message=String(invited.error?.message||'').toLowerCase(),code=String(invited.error?.code||'').toLowerCase(),status=Number(invited.error?.status||0);
    const error=status===429||message.includes('rate limit')||code.includes('rate_limit')?'email_rate_limited':message.includes('already')||message.includes('registered')?'already_registered':'email_delivery_failed';
    return reply(origin,{ok:false,error});
  }
  const provisioned=await service.rpc('provision_invited_admin',{p_actor:verified.data.user.id,p_user:invited.data.user.id,p_display_name:displayName,p_job_title:jobTitle,p_church:churchId,p_role:roleKey});
  if(provisioned.error||provisioned.data!==true){await service.auth.admin.deleteUser(invited.data.user.id);return reply(origin,{ok:false,error:'provision_failed'});}
  return reply(origin,{ok:true,state:'pending',church_id:churchId,role_key:roleKey});
});
