import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyChurchDual} from '../_shared/dual-notification.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
function admin(){
 const url=Deno.env.get('SUPABASE_URL')||'';
 const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!key)throw new Error('config');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function taipeiDate(){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
Deno.serve(async request=>{
 if(request.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
 const secret=request.headers.get('x-cron-secret')||'';
 if(!secret)return json(401,{ok:false,error:'unauthorized'});
 const db=admin();
 const allowed=await db.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});
 if(allowed.error||allowed.data!==true)return json(401,{ok:false,error:'unauthorized'});
 let body:any={}; try{body=await request.json();}catch{}
 const reportDate=/^\d{4}-\d{2}-\d{2}$/.test(String(body.report_date||''))?String(body.report_date):taipeiDate();
 const test=body.test===true;
 const setting=await db.from('line_group_summary_settings').select('group_id,enabled').eq('id',true).maybeSingle();
 const groupId=setting.data?.enabled?String(setting.data.group_id||''):'';
 if(setting.error)return json(503,{ok:false,error:'group_settings_failed'});
 const summary=await db.schema('mschool').rpc('get_daily_tutoring_summary',{p_date:reportDate});
 if(summary.error)return json(503,{ok:false,error:'mschool_summary_failed'});
 const rows=summary.data;
 const row=Array.isArray(rows)?rows[0]:rows;
 if(!row)return json(503,{ok:false,error:'summary_empty'});
 if(!test){
   const prior=await db.from('mschool_daily_report_deliveries').select('status').eq('report_date',reportDate).maybeSingle();
   if(prior.data?.status==='sent')return json(200,{ok:true,status:'already_sent',report_date:reportDate});
 }
 const title=test?'【課輔每日報告｜測試】':'【課輔每日報告】';
 const text=`${title}
日期：${reportDate}

1. 今日應到
國中：${row.expected_junior} 人
國小：${row.expected_elementary} 人

2. 今日實到
國中：${row.attended_junior} 人
國小：${row.attended_elementary} 人

3. 今日輔導紀錄
${row.counseling_count} 筆`;
 const delivered=await notifyChurchDual({db,churchId:'M+',eventKey:'school_daily_report',sourceKey:`school-daily-report:${reportDate}`,title:`課輔每日報告｜${reportDate}`,body:`應到：國中 ${row.expected_junior} 人、國小 ${row.expected_elementary} 人｜實到：國中 ${row.attended_junior} 人、國小 ${row.attended_elementary} 人｜輔導紀錄 ${row.counseling_count} 筆`,url:'/admin-dashboard.html?church=M%2B',lineGroupId:groupId,lineMessage:text,permission:'notification_settings'});
 const status=delivered.status;
 if(!test)await db.from('mschool_daily_report_deliveries').upsert({
   report_date:reportDate,status,error_code:status==='sent'?null:`app:${delivered.appStatus};line:${delivered.lineStatus}`,
   sent_at:status==='sent'?new Date().toISOString():null,updated_at:new Date().toISOString(),payload:{...row,app_status:delivered.appStatus,line_status:delivered.lineStatus}
 },{onConflict:'report_date'});
 if(status!=='sent')return json(503,{ok:false,error:`app:${delivered.appStatus};line:${delivered.lineStatus}`});
 return json(200,{ok:true,status,report_date:reportDate,summary:row,test,channels:delivered});
});
