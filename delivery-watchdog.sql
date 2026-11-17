-- Daily at 21:15 Asia/Taipei. Notify the configured report recipient once per date.
select cron.schedule('church-os-delivery-watchdog-2115','15 13 * * *',$watchdog$
with day as (select (now() at time zone 'Asia/Taipei')::date as value),
checks as (
 select s.recipient_user_id,day.value,
  not exists(select 1 from public.daily_traffic_reports r where r.church_id='M+' and r.report_date=day.value) as report_missing,
  not exists(select 1 from public.app_notifications n where n.user_id=s.recipient_user_id and n.church_id='M+' and n.event_key='daily_traffic_report' and n.source_key='daily-traffic-report:'||day.value::text) as notice_missing,
  not exists(select 1 from public.pastoral_notification_deliveries d where d.idempotency_key like 'daily-traffic-line:'||day.value::text||':%' and d.line_status='sent') as line_unconfirmed
 from public.traffic_reporting_settings s cross join day
 where s.church_id='M+' and s.enabled and s.recipient_user_id is not null
)
insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key)
select recipient_user_id,'M+','church_os_delivery_attention','日報處理結果需要核對',
 value::text||'：'||concat_ws('；',case when report_missing then '尚未找到當日日報' end,case when notice_missing then '尚未找到日報站內通知' end,case when line_unconfirmed then '尚無私人 LINE 成功投遞紀錄，請先核對再補送' end),
 '/admin-workbench.html?church=M%2B','delivery-watchdog:'||value::text
from checks where report_missing or notice_missing or line_unconfirmed
on conflict(user_id,event_key,source_key) where source_key is not null do nothing;
$watchdog$);
