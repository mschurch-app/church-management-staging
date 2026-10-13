import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
// Machine-only endpoint. Custom per-device credential; never accepts browser sessions.
Deno.serve(async req=>{
 const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(req.method!=='POST'||req.headers.has('origin'))return response(403,{ok:false,error:'forbidden'});
 const token=req.headers.get('x-worker-token')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return response(401,{ok:false,error:'forbidden'});
 try{
  const raw=await req.text();if(new TextEncoder().encode(raw).length>1000000)return response(413,{ok:false,error:'invalid_request'});
  const body=JSON.parse(raw);
  if(!body||body.worker!=='mac-mini-sermon'||!['ping','claim','progress','complete','fail','defer'].includes(body.action))return response(400,{ok:false,error:'invalid_request'});
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!key)return response(503,{ok:false,error:'unavailable'});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await db.rpc('sermon_worker_call',{p_worker:body.worker,p_token:token,p_action:body.action,p_input:body.input||{}});
  if(result.error)return response(result.error.message==='forbidden'?401:409,{ok:false,error:result.error.message==='lease_lost'?'lease_lost':'unavailable'});
  return response(200,{ok:true,...result.data});
 }catch{return response(503,{ok:false,error:'unavailable'});}
});

