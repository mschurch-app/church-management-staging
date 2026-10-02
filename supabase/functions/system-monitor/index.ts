import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const cors={'access-control-allow-origin':'https://mscos.mchurch.online','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'};
const headers={...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const targets=[
  {key:'church_os',name:'教會 OS',url:'https://mscos.mchurch.online/',marker:'教會管理系統'},
  {key:'school',name:'課輔管理系統',url:'https://school.mchurch.online/',marker:'課輔行政系統'},
  {key:'basketball',name:'籃球隊管理系統',url:'https://mschurch-app.github.io/m-plus-basketball/',marker:'藍球隊球員系統'},
  {key:'church_site',name:'M+ 教會網站',url:'https://mchurch.online/',marker:'M+大雅教會'},
  {key:'association_site',name:'夢想加油站網站',url:'https://www.tcsc.org.tw/',marker:'夢想加油站'},
];
function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
function admin(){const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!url||!key)throw new Error('config');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
async function health(target:typeof targets[number]){
  const started=performance.now();
  try{
    const response=await fetch(target.url,{redirect:'follow',signal:AbortSignal.timeout(9000),headers:{'user-agent':'MChurch-System-Monitor/1.0'}});
    const text=(await response.text()).slice(0,250000);
    return {key:target.key,name:target.name,url:target.url,online:response.ok&&text.includes(target.marker),status:response.status,latency_ms:Math.round(performance.now()-started),checked_at:new Date().toISOString()};
  }catch{return {key:target.key,name:target.name,url:target.url,online:false,status:0,latency_ms:Math.round(performance.now()-started),checked_at:new Date().toISOString()};}
}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
  try{
    const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(!token)return json(401,{ok:false,error:'unauthorized'});
    const db=admin(),verified=await db.auth.getUser(token);
    if(verified.error||!verified.data.user)return json(401,{ok:false,error:'unauthorized'});
    const [snapshot,systems]=await Promise.all([
      db.rpc('get_system_monitor_snapshot',{p_user_id:verified.data.user.id}),
      Promise.all(targets.map(health)),
    ]);
    if(snapshot.error)return json(String(snapshot.error.message).includes('forbidden')?403:503,{ok:false,error:String(snapshot.error.message).includes('forbidden')?'forbidden':'data_unavailable'});
    return json(200,{ok:true,...snapshot.data,systems});
  }catch{return json(503,{ok:false,error:'monitor_unavailable'});}
});
