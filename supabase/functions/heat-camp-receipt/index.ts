import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {receiptHtml} from './receipt.mjs';
import {seals} from './seals.mjs';

const allowed=new Set(['https://mscos.mchurch.online','https://mchurch.online']);
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  const headers={'access-control-allow-origin':allowed.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'content-type, apikey, authorization, x-client-info','access-control-allow-methods':'POST, OPTIONS','cache-control':'no-store','vary':'Origin','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
  const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST'||!allowed.has(origin))return json(403,{ok:false,error:'forbidden'});
  if(Number(req.headers.get('content-length')||0)>2000)return json(413,{ok:false,error:'invalid_request'});
  const raw=await req.text();if(raw.length>2000)return json(413,{ok:false,error:'invalid_request'});
  let input;try{input=JSON.parse(raw);}catch{return json(400,{ok:false,error:'invalid_request'});}
  if(!input||!['admin','customer'].includes(input.action))return json(400,{ok:false,error:'invalid_request'});
  const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!anon||!key)return json(503,{ok:false,error:'service_unavailable'});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let result;
  if(input.action==='admin'){
    const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
    if(!token)return json(401,{ok:false,error:'login_required'});
    const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const verified=await auth.auth.getUser(token);
    if(verified.error||!verified.data.user)return json(401,{ok:false,error:'login_required'});
    if(typeof input.registration_no!=='string'||!/^HC27-[A-Z0-9]+$/.test(input.registration_no))return json(400,{ok:false,error:'invalid_request'});
    result=await admin.rpc('heat_camp_2027_issue_receipt',{p_user:verified.data.user.id,p_registration_no:input.registration_no});
  }else{
    if(origin!=='https://mchurch.online'||typeof input.request_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.request_id))return json(400,{ok:false,error:'invalid_request'});
    result=await admin.rpc('heat_camp_2027_customer_receipt',{p_request_id:input.request_id});
  }
  if(result.error){
    const code=result.error.message;
    const safe=['forbidden','receipt_not_requested','receipt_profile_incomplete','receipt_not_active','external_receipt_conflict','paid_production_required','daily_serial_exhausted'].includes(code)?code:'receipt_unavailable';
    return json(safe==='forbidden'?403:409,{ok:false,error:safe});
  }
  try{
    const html=receiptHtml(result.data,{seals});
    return json(200,{ok:true,receipt_no:result.data.receipt_no,file_name:result.data.receipt_no+'.html',mime_type:'text/html; charset=utf-8',html});
  }catch{return json(503,{ok:false,error:'receipt_render_failed'});}
});
