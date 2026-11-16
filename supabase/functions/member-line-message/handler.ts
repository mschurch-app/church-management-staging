const APP='https://mscos.mchurch.online';
const ACTIONS=new Set(['access','context','send','status','settings','set_permission','history']);
const KNOWN=new Set(['unsupported_church','forbidden','invalid_input','account_inactive','version_conflict','not_found','member_unavailable','request_reused','retry_expired','delivery_failed','delivery_busy','binding_changed','line_unavailable','duplicate_message','attempt_changed','session_revoked']);
export function createHandler(db:any,lineToken:string,fetcher:typeof fetch=fetch){
 return async(req:Request)=>{
  const origin=req.headers.get('origin')||'',headers:Record<string,string>={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
  if(origin===APP)headers['access-control-allow-origin']=APP;
  const reply=(status:number,data:any)=>Response.json(data,{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:origin===APP?204:403,headers:{...headers,'access-control-allow-headers':'authorization,content-type,apikey,x-client-info','access-control-allow-methods':'POST,OPTIONS'}});
  if(req.method!=='POST'||origin!==APP)return reply(403,{ok:false,error:'forbidden'});
  try{
   const bearer=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!bearer)return reply(401,{ok:false,error:'login_required'});
   const auth=await db.auth.getUser(bearer);if(auth.error||!auth.data?.user)return reply(401,{ok:false,error:'login_required'});
   let sid:string;try{sid=JSON.parse(atob(bearer.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id;if(!/^[0-9a-f-]{36}$/i.test(sid))throw Error();}catch{return reply(401,{ok:false,error:'login_required'});}
   const reader=req.body?.getReader();if(!reader)throw Error('invalid_input');let raw='',size=0;const decoder=new TextDecoder();while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>32000){await reader.cancel();throw Error('invalid_input');}raw+=decoder.decode(x.value,{stream:true});}
   const b=JSON.parse(raw+decoder.decode());if(!ACTIONS.has(b.action)||b.church!=='M+')throw Error('invalid_input');
   const actor=auth.data.user.id;
   const rpc=async(action:string,data:any)=>{const r=await db.rpc('member_line_operation',{p_actor:actor,p_action:action,p_data:{...data,church:'M+',session_id:sid}});if(r.error)throw Error(KNOWN.has(r.error.message)?r.error.message:'unavailable');return r.data;};
   if(b.action!=='send'){
    // Never forward arbitrary client fields into service-only transitions.
    const data=b.action==='history'?{member_search:b.member_search||'',sender_search:b.sender_search||'',from:b.from||'',to:b.to||'',page:b.page||0}:b.action==='set_permission'?{user_id:b.user_id,enabled:b.enabled,version:b.version}:b.action==='context'?{member_id:b.member_id}:b.action==='status'?{request_id:b.request_id}:{};
    return reply(200,{ok:true,...await rpc(b.action,data)});
   }
   if(!lineToken)throw Error('channel_unavailable');
   if(typeof b.message!=='string'||!b.message.trim()||b.message.length>5000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.message)||!/^\d+$/.test(String(b.member_id))||!(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.request_id||'')))throw Error('invalid_input');
   const r=await rpc('prepare',{member_id:b.member_id,message:b.message,request_id:b.request_id});
   if(r.status==='accepted')return reply(200,{ok:true,...r});
   let status='retryable',provider:string|null=null,error:string|null='line_unconfirmed';
   try{
    const sent=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+lineToken,'content-type':'application/json','X-Line-Retry-Key':r.id},body:JSON.stringify({to:r.line_subject,messages:[{type:'text',text:r.message}]})});
    provider=sent.headers.get('x-line-accepted-request-id')||sent.headers.get('x-line-request-id');
    if(sent.ok||(sent.status===409&&sent.headers.has('x-line-accepted-request-id'))){status='accepted';error=null;}
    else if([400,403,404].includes(sent.status)){status='failed';error='line_http_'+sent.status;}
    else error='line_http_'+sent.status;
   }catch{/* Same frozen UUID/payload must be used to recover an unknown result. */}
   const result=await rpc('finish',{request_id:r.id,attempt_token:r.attempt_token,status,provider_request_id:provider,error_code:error});
   return reply(200,{ok:true,...result});
  }catch(e){const code=e instanceof Error?e.message:'unavailable';return reply(['forbidden','session_revoked'].includes(code)?403:KNOWN.has(code)?409:503,{ok:false,error:KNOWN.has(code)||code==='channel_unavailable'?code:'unavailable'});}
 };
}
