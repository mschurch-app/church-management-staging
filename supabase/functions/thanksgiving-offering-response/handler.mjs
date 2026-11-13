import {UUID,validateResponse} from './validation.mjs';
const PUBLIC_ORIGINS=new Set(['https://mscos.mchurch.online','https://mchurch.online','https://www.mchurch.online']);
const ADMIN_ORIGIN='https://mscos.mchurch.online';
export function makeHandler({rpc,verifyUser,hashIP,channelsReady,dispatch,enabled=true,origins=PUBLIC_ORIGINS}){
 return async req=>{
  const origin=req.headers.get('origin')||'';
  const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','vary':'Origin',...(origins.has(origin)?{'access-control-allow-origin':origin}:{})};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:origins.has(origin)?204:403,headers:{...headers,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-idempotency-key,authorization,apikey,x-client-info'}});
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  try{
   // Worker authentication is validated inside the service-only claim RPC. No caller-supplied recipients.
   const worker=req.headers.get('x-offering-worker-key');
   if(worker){if(!/^[0-9a-f]{64}$/.test(worker))return reply(401,{error:'unauthorized'});return reply(200,await dispatch(worker));}
   if(!enabled||!origins.has(origin))return reply(403,{error:'origin_rejected'});
   if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'json_required'});
   const reader=req.body?.getReader();if(!reader)return reply(400,{error:'invalid_input'});let size=0,raw='';const decoder=new TextDecoder();
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10000){await reader.cancel();return reply(413,{error:'too_large'});}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
   let input;try{input=JSON.parse(raw);}catch{return reply(400,{error:'invalid_input'});}
   const auth=req.headers.get('authorization');
   if(auth){
    if(origin!==ADMIN_ORIGIN)return reply(403,{error:'origin_rejected'});
    const actor=await verifyUser(auth);if(!actor)return reply(401,{error:'login_required'});
    if(!input||Array.isArray(input)||typeof input!=='object')return reply(400,{error:'invalid_input'});
    const allowed={admin_list:['tests'],reconcile:['id','version','status','note','confirmed_amount','confirmed_date','bank_reference'],retry:['id'],settings:['enabled']};
    if(!Object.hasOwn(allowed,input.action)||Object.keys(input).some(k=>!['action',...allowed[input.action]].includes(k)))return reply(400,{error:'invalid_input'});
    if(input.action==='settings'&&input.enabled===true&&!channelsReady())return reply(503,{error:'notification_not_configured'});
    if(input.action==='reconcile'&&(!UUID.test(input.id||'')||!Number.isSafeInteger(input.version)||typeof input.note!=='string'||input.note.length>500||input.bank_reference?.length>120))return reply(400,{error:'invalid_input'});
    if(input.action==='retry'&&!UUID.test(input.id||''))return reply(400,{error:'invalid_input'});
    const {action,...data}=input;return reply(200,{ok:true,...await rpc(action,{...data,actor}),channels_configured:channelsReady()});
   }
   const key=req.headers.get('x-idempotency-key');if(!UUID.test(key||''))return reply(400,{error:'invalid_idempotency_key'});
   const payload=validateResponse(input);
   const ip_hash=await hashIP(req);
   if(!(await rpc('rate',{ip_hash})).allowed)return reply(429,{error:'try_later'});
   const result=await rpc('submit',{key,payload,ip_hash});
   if(result.status!=='accepted'||!result.reference_no||result.notifications_queued!==true)throw Error('queue_incomplete');
   return reply(202,result);
  }catch(error){
   const code=String(error?.message||'');
   const errors={invalid_input:400,invalid_date:400,invalid_amount:400,invalid_last5:400,contact_required:400,invalid_email:400,invalid_phone:400,bot_rejected:400,forbidden:403,idempotency_conflict:409,version_conflict:409,reason_required:400,reconciliation_required:400,manual_review_required:409,acceptance_required:409,unavailable:503,recipient_unavailable:503};
   return reply(errors[code]||503,{error:Object.hasOwn(errors,code)?code:'service_unavailable'});
  }
 };
}
