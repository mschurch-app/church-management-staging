import {notifyStaffDual,notifyLineGroup} from '../_shared/dual-notification.mjs';
function phoneTail(value){const digits=String(value||'').replace(/\D/g,'');return digits.length>=3?digits.slice(-3):'未提供';}
export async function notifyBindingReview({client,requestId,church,name,phone}){
 const configured=await client.from('line_notification_settings').select('enabled,recipient_staff_ids,group_id').eq('church_id',church).eq('event_key','binding_review').maybeSingle();
 if(configured.error)return {status:'lookup_failed',sent:0,total:0};
 const recipientIds=configured.data?.recipient_staff_ids||[],text=`有新的 LINE 會友綁定申請\n申請人：${String(name||'未提供').trim()}\n手機末三碼：${phoneTail(phone)}\n請至管理平台審核：https://mscos.mchurch.online/binding-review.html?church=${encodeURIComponent(church)}`;
 let sent=0,total=recipientIds.length;
 for(const staffId of recipientIds){const key=`member-binding-review:${requestId}:${staffId}`,delivered=await notifyStaffDual({db:client,staffId,churchId:church,eventKey:'binding_review',sourceKey:key,title:'新的會友綁定申請',body:`申請人：${String(name||'未提供').trim()}｜手機末三碼：${phoneTail(phone)}`,url:`/binding-review.html?church=${encodeURIComponent(church)}`,lineMessage:text,idempotencyKey:key});await client.from('pastoral_notification_deliveries').upsert({entity_key:church==='M+'?'mplus':'shine',notification_type:'member_binding_review',recipient_staff_id:staffId,related_id:requestId,idempotency_key:key,status:delivered.status,error_code:delivered.status==='sent'?null:`app:${delivered.appStatus};line:${delivered.lineStatus}`,app_status:delivered.appStatus,line_status:delivered.lineStatus,sent_at:delivered.status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:'idempotency_key'});if(delivered.status==='sent')sent++;}
 const groupId=configured.data?.group_id||'';if(groupId){total++;const result=await notifyLineGroup({db:client,churchId:church,eventKey:'binding_review',groupId,message:text});if(result==='sent'||result==='disabled')sent++;}
 return {status:sent===total&&total?'sent':sent?'partial':'failed',sent,total};
}
