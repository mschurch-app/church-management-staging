import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const allowedOrigins=new Set((Deno.env.get('LINE_ALLOWED_ORIGINS')||'https://mscos.mchurch.online,https://mschurch-app.github.io').split(',').map(v=>v.trim()).filter(Boolean));
const headers=(origin:string)=>({'access-control-allow-origin':allowedOrigins.has(origin)?origin:'https://mscos.mchurch.online','access-control-allow-headers':'content-type,authorization,apikey','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'});
const reply=(origin:string,payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:headers(origin)});

Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return new Response('ok',{headers:headers(origin)});
  if(request.method!=='POST'||!allowedOrigins.has(origin))return reply(origin,{ok:false,error:'forbidden'},403);
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/.test(authorization))return reply(origin,{ok:false,error:'login_required'},401);
  let body:{church?:unknown;registrationId?:unknown;status?:unknown;action?:unknown;requestId?:unknown;decision?:unknown;note?:unknown};
  try{body=await request.json();}catch{return reply(origin,{ok:false,error:'invalid_request'},400);}
  const church=String(body.church||''),action=String(body.action||'registration_review'),registrationId=Number(body.registrationId),status=String(body.status||'');
  if(church!=='M+')return reply(origin,{ok:false,error:'invalid_request'},400);
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
  if(!url||!key)return reply(origin,{ok:false,error:'unavailable'},503);
  const db=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:userResult,error:userError}=await db.auth.getUser(authorization.slice(7));
  if(userError||!userResult.user)return reply(origin,{ok:false,error:'login_required'},401);
  if(action==='change_review'){
    const requestId=Number(body.requestId),decision=String(body.decision||''),note=String(body.note||'').trim().slice(0,600);
    if(!Number.isSafeInteger(requestId)||requestId<1||!['approve','reject'].includes(decision))return reply(origin,{ok:false,error:'invalid_request'},400);
    const reviewed=await db.rpc('service_signup_review_change_request',{p_church:church,p_request:requestId,p_decision:decision,p_note:note||null});
    if(reviewed.error){const error=String(reviewed.error.message||'');return reply(origin,{ok:false,error:error.includes('forbidden')?'forbidden':'unavailable'},error.includes('forbidden')?403:503);}
    const token=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||'',result=reviewed.data;
    if(result?.line_subject&&token){const stage=result.status==='admin_review'?'已通過服事領袖初審，等待行政同工複審。':result.status==='approved'?'已由行政同工核准。':'未獲核准，請與服事領袖聯絡。';await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:result.line_subject,messages:[{type:'text',text:`${result.member_name}，你的服事調整申請${stage}\nhttps://mscos.mchurch.online/service-signup.html`}]})}).catch(()=>{});}
    return reply(origin,{ok:true,...result});
  }
  if(!Number.isSafeInteger(registrationId)||registrationId<1||!['confirmed','declined'].includes(status))return reply(origin,{ok:false,error:'invalid_request'},400);
  const result=await db.rpc('service_signup_review_registration',{p_church:church,p_registration:registrationId,p_status:status});
  if(result.error){const error=String(result.error.message||'');return reply(origin,{ok:false,error:error.includes('forbidden')?'forbidden':'unavailable'},error.includes('forbidden')?403:503);}
  const offer=result.data?.next_offer,token=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||'';
  if(offer?.line_subject&&token){const expires=offer.expires_at?new Date(offer.expires_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'24 小時內';await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:offer.line_subject,messages:[{type:'text',text:`主日服事有名額釋出，現在輪到你確認是否承接。請在 ${expires} 前開啟登記頁，按下「接受候補邀請」才會保留名額。\nhttps://mscos.mchurch.online/service-signup.html`}]})}).catch(()=>{});}
  return reply(origin,{ok:true,status:result.data.status,offer_sent:Boolean(offer)});
});
