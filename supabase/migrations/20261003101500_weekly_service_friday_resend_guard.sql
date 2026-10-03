create or replace function public.prepare_weekly_service_line_scheduled_delivery(target_sunday date)
returns void
language sql
security definer
set search_path=''
as $function$
  update private.weekly_service_line_deliveries
  set status='failed',details='Prepared for the Friday scheduled delivery',sent_at=null
  where sunday_date=target_sunday
    and status='sent'
    and (sent_at at time zone 'Asia/Taipei')::date < (now() at time zone 'Asia/Taipei')::date;
$function$;

revoke all on function public.prepare_weekly_service_line_scheduled_delivery(date) from public,anon,authenticated;
grant execute on function public.prepare_weekly_service_line_scheduled_delivery(date) to service_role;
