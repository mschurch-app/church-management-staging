import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyStaffApp} from '../_shared/app-push-notification.mjs';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
function adminClient(){
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)throw new Error('config');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
async function deliver(db:ReturnType<typeof adminClient>,row:{id:string;entity_key:string;shared_task_id:string;assigned_staff_ids:string[];first_contact_due_at:string;member:{name:string;know_us_from:string|null}},recipientId:string,type:'newcomer_care_reminder_24h'|'newcomer_care_overdue_48h'){
  const key=`${type}:${row.id}:${recipientId}`;
  const late=type==='newcomer_care_overdue_48h';
  const due=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(row.first_contact_due_at));
  const title=late?'新朋友关怀已逾期':'新朋友关怀提醒';
  const body=late?`${row.member.name} 的第一次联络已超过期限。期限：${due}`:`${row.member.name} 登记已满 24 小时，请安排第一次联络。期限：${due}`;
  const pushed=await notifyStaffApp({db,staffId:recipientId,churchId:row.entity_key==='shine'?'SHiNE':'M+',eventKey:type,sourceKey:key,title,body,url:'/newcomer-care.html'});
  const status=pushed.status==='sent'||pushed.status==='stored'?'sent':'failed',errorCode=status==='sent'?null:pushed.status;
  const saved=await db.from('pastoral_notification_deliveries').upsert({entity_key:row.entity_key,notification_type:type,
    recipient_staff_id:recipientId,related_id:row.shared_task_id,idempotency_key:key,status,error_code:errorCode,
    sent_at:status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString()},{onConflict:'idempotency_key'});
  if(saved.error)throw new Error('db');
  return status;
}
Deno.serve(async request=>{
  if(request.method!=='POST')return json(405,{ok:false});
  const secret=request.headers.get('x-cron-secret')||'';
  if(!secret)return json(401,{ok:false});
  let db:ReturnType<typeof adminClient>;
  try{db=adminClient();}catch{return json(503,{ok:false});}
  const allowed=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});
  if(allowed.error||allowed.data!==true)return json(401,{ok:false});
  try{
    const [cases,settings,notifications]=await Promise.all([
      db.from('pastoral_newcomer_care_cases').select('id,member_id,entity_key,shared_task_id,assigned_staff_ids,first_contact_due_at,first_visit_at,member:members!pastoral_newcomer_care_cases_member_id_fkey(name,know_us_from)')
        .eq('status','open').is('first_contacted_at',null).not('shared_task_id','is',null).limit(500),
      db.from('pastoral_newcomer_care_settings').select('entity_key,reminder_24h_enabled,overdue_48h_enabled'),
      db.from('line_notification_settings').select('church_id,enabled,recipient_staff_ids,group_id').eq('event_key','newcomer_care_reminders'),
    ]);
    if(cases.error||settings.error||notifications.error)throw new Error('db');
    const config=new Map((settings.data||[]).map((r:{entity_key:string;reminder_24h_enabled:boolean;overdue_48h_enabled:boolean})=>[r.entity_key,r]));
    const deliveryConfig=new Map((notifications.data||[]).map((r:{church_id:string;enabled:boolean;recipient_staff_ids:string[];group_id:string})=>[r.church_id==='M+'?'mplus':'shine',r]));
    let sent=0,failed=0;
    for(const row of cases.data||[]){
      const setting=config.get(row.entity_key);
      const delivery=deliveryConfig.get(row.entity_key);
      if(!setting||delivery?.enabled===false)continue;
      const age=Date.now()-Date.parse(row.first_visit_at);
      const type=age>=48*3600000&&setting.overdue_48h_enabled?'newcomer_care_overdue_48h'
        :age>=24*3600000&&age<48*3600000&&setting.reminder_24h_enabled?'newcomer_care_reminder_24h':null;
      if(!type)continue;
      let anySent=false;
      for(const recipient of delivery?.recipient_staff_ids?.length?delivery.recipient_staff_ids:(row.assigned_staff_ids||[])){
        const result=await deliver(db,row as never,recipient,type);
        if(result==='sent'){sent++;anySent=true;}else failed++;
      }
      if(anySent){
        const history=await db.from('pastoral_newcomer_care_history').upsert({case_id:row.id,member_id:row.member_id,event_type:'reminder_sent',
          summary:type==='newcomer_care_overdue_48h'?'已送出逾期 48 小時關懷提醒。':'已送出 24 小時關懷提醒。',
          idempotency_key:`reminder:${row.id}:${type}`},{onConflict:'idempotency_key',ignoreDuplicates:true});
        if(history.error)throw new Error('db');
      }
    }
    return json(200,{ok:true,sent,failed});
  }catch{return json(503,{ok:false});}
});
