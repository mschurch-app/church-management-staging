import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
const allowedOrigins=new Set(['https://mchurch.online','https://www.mchurch.online']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const get=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max+1):'';
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://mchurch.online','access-control-allow-headers':'content-type','access-control-allow-methods':'POST, OPTIONS','cache-control':'no-store','vary':'Origin'};
 const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST'||!allowedOrigins.has(origin))return json(403,{ok:false,error:'forbidden'});
 if(!req.headers.get('content-type')?.startsWith('application/json'))return json(400,{ok:false,error:'invalid_request'});
 const raw=await req.text().catch(()=>null);
 if(!raw||raw.length>2000)return json(400,{ok:false,error:'invalid_request'});
 let input:Record<string,unknown>;
 try{input=JSON.parse(raw);}catch{return json(400,{ok:false,error:'invalid_request'});}
 if(!input||typeof input!=='object'||Array.isArray(input)||input.action!=='save')return json(400,{ok:false,error:'invalid_request'});
 const requestId=get(input.request_id,36),registrationNo=get(input.registration_no,40),email=get(input.email,160),affiliation=get(input.church_affiliation,120);
 if(!uuid.test(requestId)||!registrationNo||registrationNo.length>40||email.length<5||email.length>160||!/^\S+@\S+\.\S+$/.test(email)||!affiliation||affiliation.length>120)return json(400,{ok:false,error:'invalid_request'});
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
 if(!url||!key)return json(503,{ok:false,error:'service_unavailable'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await db.rpc('heat_camp_2027_save_church_affiliation_public',{p_request_id:requestId,p_registration_no:registrationNo,p_email:email,p_affiliation:affiliation});
 if(result.error||result.data!==true)return json(503,{ok:false,error:'save_failed'});
 return json(200,{ok:true});
});