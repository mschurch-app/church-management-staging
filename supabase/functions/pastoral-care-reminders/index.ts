import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';

const TASK_LIFF_URL='https://liff.line.me/2011645391-VGkQRZ9d/workspace.html?tab=tasks';
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
  const previous=await db.from('pastoral_notification_deliveries').select('status').eq('idempotency_key',key).maybeSingle();
  if(previous.error)throw new Error('db');
  if(previous.data?.status==='sent')return 'sent';
  const person=await db.from('pastoral_staff').select('display_name,line_subject,is_active').eq('id',recipientId).eq('is_active',true).maybeSingle();
  if(person.error)throw new Error('db');
  let status='failed',errorCode:string|null=null;
  const token=Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')||Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')||'';
  if(!token){status='not_configured';errorCode='channel_token_missing';}
  else if(!person.data||!/^U[0-9a-f]{32}$/i.test(person.data.line_subject||'')){errorCode='line_identity_missing';}
  else{
    const late=type==='newcomer_care_overdue_48h';
    const due=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(row.first_contact_due_at));
    const message=late
      ?`關懷提醒：${row.member.name} 的第一次聯絡已超過期限，請牧師或師母其中一位查看並完成回報。期限：${due}\n開啟同工工作台：${TASK_LIFF_URL}`
      :`關懷提醒：${row.member.name} 登記已滿 24 小時，請安排第一次聯絡；共同任務由其中一位完成即可。期限：${due}\n開啟同工工作台：${TASK_LIFF_URL}`;
    try{
      const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:person.data.line_subject,messages:[{type:'text',text:message}]})});
      if(response.ok)status='sent';else errorCode=`line_http_${response.status}`;
    }catch{errorCode='line_unavailable';}
  }
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
  const allowed=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret}).catch(()=>({data:false,error:true}));
  if(allowed.error||allowed.data!==true)return json(401,{ok:false});
  try{
    const [cases,settings]=await Promise.all([
      db.from('pastoral_newcomer_care_cases').select('id,member_id,entity_key,shared_task_id,assigned_staff_ids,first_contact_due_at,first_visit_at,member:members!pastoral_newcomer_care_cases_member_id_fkey(name,know_us_from)')
        .eq('status','open').is('first_contacted_at',null).not('shared_task_id','is',null).limit(500),
      db.from('pastoral_newcomer_care_settings').select('entity_key,reminder_24h_enabled,overdue_48h_enabled'),
    ]);
    if(cases.error||settings.error)throw new Error('db');
    const config=new Map((settings.data||[]).map((r:{entity_key:string;reminder_24h_enabled:boolean;overdue_48h_enabled:boolean})=>[r.entity_key,r]));
    let sent=0,failed=0;
    for(const row of cases.data||[]){
      const setting=config.get(row.entity_key);
      if(!setting)continue;
      const age=Date.now()-Date.parse(row.first_visit_at);
      const type=age>=48*3600000&&setting.overdue_48h_enabled?'newcomer_care_overdue_48h'
        :age>=24*3600000&&age<48*3600000&&setting.reminder_24h_enabled?'newcomer_care_reminder_24h':null;
      if(!type)continue;
      let anySent=false;
      for(const recipient of row.assigned_staff_ids||[]){
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
