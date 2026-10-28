import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
const origin='https://mscos.mchurch.online';
export async function handler(request:Request){
 const cors={'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
 if(request.headers.get('origin')!==origin)return reply(403,{ok:false,code:'forbidden'});
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return reply(405,{ok:false,code:'invalid_request'});
 const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return reply(401,{ok:false,code:'login_required'});
 try{
  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
  const user=await admin.auth.getUser(token);if(user.error||!user.data.user)return reply(401,{ok:false,code:'login_required'});
  const raw=await request.text();if(raw.length>50000)return reply(413,{ok:false,code:'invalid_request'});
  let input;try{input=JSON.parse(raw);}catch{return reply(400,{ok:false,code:'invalid_request'});}
  if(!input||typeof input!=='object'||Array.isArray(input)||!['profile','list','get','save','issue','void','issuer','camp_list','camp_issue','camp_get','export'].includes(input.action))return reply(400,{ok:false,code:'invalid_request'});
  const result=await admin.rpc('finance_receipt_api',{p_actor:user.data.user.id,p_action:input.action,p_input:input});
  if(result.error){const known=['forbidden','not_found','request_conflict','version_conflict','prefix_locked','receipt_locked','donation_date_not_eligible','invalid_items','valuation_required','verification_required','issuer_required','serial_exhausted','invalid_transition','reason_required','invalid_request','registration_not_found','paid_production_required','receipt_not_requested','receipt_profile_incomplete','external_receipt_conflict','receipt_not_active','daily_serial_exhausted'];const code=known.find(x=>result.error.message===x)||(result.error.code==='23505'?'duplicate_source':'invalid_request');return reply(code==='forbidden'?403:400,{ok:false,code});}
  return reply(200,{ok:true,...result.data});
 }catch{return reply(503,{ok:false,code:'unavailable'});}
}
Deno.serve(handler);
