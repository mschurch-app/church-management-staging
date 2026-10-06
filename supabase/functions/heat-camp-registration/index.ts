import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const allowedOrigins=new Set(['https://mchurch.online','https://www.mchurch.online','http://127.0.0.1:4180','http://localhost:4180']);
const headers=(origin:string)=>({
  'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://mchurch.online',
  'access-control-allow-headers':'content-type, apikey, authorization',
  'access-control-allow-methods':'POST, OPTIONS',
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'vary':'Origin'
});
const json=(origin:string,status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:headers(origin)});

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return allowedOrigins.has(origin)?new Response('ok',{headers:headers(origin)}):json(origin,403,{ok:false,error:'forbidden'});
  if(request.method!=='POST'||!allowedOrigins.has(origin))return json(origin,403,{ok:false,error:'forbidden'});
  const body=await request.json().catch(()=>null);
  if(!body||!['configuration_status','jersey_availability'].includes(body.action))return json(origin,400,{ok:false,error:'invalid_request'});
  if(body.action==='configuration_status'){
    const merchantId=Deno.env.get('NEWEBPAY_MERCHANT_ID')||'';
    const hashKey=Deno.env.get('NEWEBPAY_HASH_KEY')||'';
    const hashIv=Deno.env.get('NEWEBPAY_HASH_IV')||'';
    const environment=Deno.env.get('NEWEBPAY_ENV')||'';
    return json(origin,200,{ok:true,configured:Boolean(merchantId&&hashKey&&hashIv),environment:environment||'unset',merchant_suffix:merchantId.slice(-4)});
  }
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!key)return json(origin,503,{ok:false,error:'unavailable'});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const result=await db.rpc('heat_camp_2027_available_jersey_numbers');
  if(result.error)return json(origin,503,{ok:false,error:'unavailable'});
  return json(origin,200,{ok:true,numbers:(result.data||[]).map((row:{jersey_number:number})=>row.jersey_number)});
});
