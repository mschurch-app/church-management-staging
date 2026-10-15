import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const allowedOrigins=new Set(['https://mchurch.online','https://www.mchurch.online','https://mscos.mchurch.online']);
const roleNames:Record<string,string>={group_leader:'小隊輔',worship:'敬拜團',basketball_assistant:'籃球助教'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const value=(input:unknown,max:number)=>typeof input==='string'?input.trim().slice(0,max+1):'';

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  const cors={
    'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://mchurch.online',
    'access-control-allow-headers':'content-type, authorization, apikey, x-client-info',
    'access-control-allow-methods':'POST, OPTIONS',
    'cache-control':'no-store','vary':'Origin'
  };
  const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST'||!allowedOrigins.has(origin))return json(403,{ok:false,error:'forbidden'});
  const raw=await req.text().catch(()=>null);
  if(!raw||raw.length>12000)return json(400,{ok:false,error:'invalid_request'});
  let input:Record<string,unknown>;
  try{input=JSON.parse(raw);}catch{return json(400,{ok:false,error:'invalid_request'});}
  if(!input||typeof input!=='object'||Array.isArray(input))return json(400,{ok:false,error:'invalid_request'});
  const url=Deno.env.get('SUPABASE_URL')||'';
  const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!anon||!key)return json(503,{ok:false,error:'service_unavailable'});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  async function sendLine(id:string,name:string,roles:string[]){
    const config=await db.rpc('heat_camp_volunteer_line_config');
    const group=String(config.data?.group_id||'');
    const token=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'';
    if(config.error||config.data?.enabled!==true||!/^C[0-9a-f]{32}$/i.test(group)||!token){
      await db.rpc('heat_camp_volunteer_delivery',{p_id:id,p_status:'unavailable',p_error:'line_not_configured'});
      return;
    }
    const title=`2027 熱火籃球營新志工報名：${name}`;
    const choice=roles.map(role=>roleNames[role]||role).join('、');
    const link=`https://mscos.mchurch.online/heat-camp-volunteers-admin.html?church=M%2B&id=${encodeURIComponent(id)}`;
    try{
      const response=await fetch('https://api.line.me/v2/bot/message/push',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
        body:JSON.stringify({to:group,messages:[{type:'text',text:`${title}\n意願：${choice}\n請由同工聯繫並審核：${link}`}]})
      });
      await db.rpc('heat_camp_volunteer_delivery',{p_id:id,p_status:response.ok?'sent':'failed',p_error:response.ok?null:`line_http_${response.status}`});
    }catch{
      await db.rpc('heat_camp_volunteer_delivery',{p_id:id,p_status:'failed',p_error:'line_unavailable'});
    }
  }

  if(input.action==='submit'){
    if(value(input.website,100))return json(200,{ok:true,accepted:true});
    const requestId=value(input.request_id,36);
    const name=value(input.name,80),phone=value(input.phone,24),email=value(input.email,160);
    const lineId=value(input.line_id,80),experience=value(input.experience,1000),notes=value(input.notes,1000);
    const roles=Array.isArray(input.roles)?input.roles.filter((x):x is string=>typeof x==='string'):[];
    if(!uuid.test(requestId)||name.length<2||name.length>80||!xPhone(phone)||!xEmail(email)
      ||roles.length<1||roles.length>3||new Set(roles).size!==roles.length||roles.some(x=>!roleNames[x])
      ||lineId.length>80||experience.length>1000||notes.length>1000
      ||input.training_agreed!==true||input.deployment_agreed!==true||input.privacy_agreed!==true)
      return json(400,{ok:false,error:'invalid_request'});
    const saved=await db.rpc('heat_camp_volunteer_submit',{p_request_id:requestId,p_payload:{
      name,phone,email,line_id:lineId,roles,experience,notes,
      training_agreed:true,deployment_agreed:true,privacy_agreed:true
    }});
    if(saved.error||!saved.data?.id)return json(503,{ok:false,error:'save_failed'});
    if(saved.data.created)await sendLine(saved.data.id,name,roles);
    return json(200,{ok:true,accepted:true,reference:String(saved.data.id).slice(0,8).toUpperCase()});
  }

  if(origin!=='https://mscos.mchurch.online')return json(403,{ok:false,error:'forbidden'});
  const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
  if(!token)return json(401,{ok:false,error:'login_required'});
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await auth.auth.getUser(token);
  if(verified.error||!verified.data.user)return json(401,{ok:false,error:'login_required'});
  const id=typeof input.id==='string'&&uuid.test(input.id)?input.id:null;
  const action=input.action==='update'?'update':'list';
  if(input.action!=='list'&&input.action!=='update')return json(400,{ok:false,error:'invalid_action'});
  if(action==='update'&&!id)return json(400,{ok:false,error:'invalid_request'});
  const status=value(input.status,20);
  const assigned=Array.isArray(input.assigned_roles)?input.assigned_roles.filter((x):x is string=>typeof x==='string'):[];
  const result=await db.rpc('heat_camp_volunteer_admin',{
    p_user:verified.data.user.id,p_action:action,p_id:id,p_status:status||null,p_assigned_roles:assigned
  });
  if(result.error){
    const code=String(result.error.message||'');
    return json(code.includes('forbidden')?403:code.includes('role_full')?409:400,{ok:false,error:
      ['forbidden','role_full','invalid_roles','not_found','invalid_status'].find(x=>code.includes(x))||'request_failed'});
  }
  return json(200,{ok:true,...result.data});
});

function xPhone(phone:string){return /^[0-9+() -]{8,24}$/.test(phone);}
function xEmail(email:string){return email.length>=5&&email.length<=160&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
