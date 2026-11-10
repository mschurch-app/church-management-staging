import {notifyStaffApp} from './app-push-notification.mjs';

export async function notificationRoute(db,churchId,eventKey){
 const result=await db.from('notification_channel_routes').select('app_enabled,line_enabled').eq('church_id',churchId).eq('event_key',eventKey).maybeSingle();
 return result.error||!result.data?{app:true,line:true}:{app:result.data.app_enabled!==false,line:result.data.line_enabled!==false};
}
async function staffLine(db,staffId,message,churchId){
 const person=await db.from('pastoral_staff').select('line_subject,is_active').eq('id',staffId).eq('is_active',true).maybeSingle();
 const token=churchId==='SHiNE'?(Deno.env.get('LINE_SHINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||''):(Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'');
 if(!token)return 'not_configured';
 if(person.error||!/^U[0-9a-f]{32}$/i.test(person.data?.line_subject||''))return 'identity_missing';
 try{const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:person.data.line_subject,messages:[{type:'text',text:message}]})});return response.ok?'sent':`http_${response.status}`;}catch{return 'unavailable';}
}
export async function notifyStaffDual({db,staffId,churchId='M+',eventKey,routeKey=eventKey,sourceKey,title,body,url,lineMessage,idempotencyKey}){
 const route=await notificationRoute(db,churchId,routeKey),previous=await db.from('pastoral_notification_deliveries').select('app_status,line_status').eq('idempotency_key',idempotencyKey).maybeSingle();
 let appStatus=route.app?(previous.data?.app_status==='sent'?'sent':null):'disabled';
 let lineStatus=route.line?(previous.data?.line_status==='sent'?'sent':null):'disabled';
 if(appStatus===null){const result=await notifyStaffApp({db,staffId,churchId,eventKey,sourceKey,title,body,url});appStatus=result.status==='sent'||result.status==='stored'?'sent':result.status;}
 if(lineStatus===null)lineStatus=await staffLine(db,staffId,lineMessage||`${title}\n${body}`,churchId);
 return {appStatus,lineStatus,status:appStatus==='sent'||lineStatus==='sent'?'sent':'failed'};
}
export async function notifyLineGroup({db,churchId,eventKey,groupId,message}){
 const route=await notificationRoute(db,churchId,eventKey);if(!route.line)return 'disabled';
 const token=churchId==='SHiNE'?(Deno.env.get('LINE_SHINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||''):(Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'');
 if(!token)return 'not_configured';if(!/^C[0-9a-f]{32}$/i.test(groupId||''))return 'identity_missing';
 try{const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',signal:AbortSignal.timeout(8000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:groupId,messages:[{type:'text',text:message}]})});return response.ok?'sent':`http_${response.status}`;}catch{return 'unavailable';}
}
