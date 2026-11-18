-- Accept the daily-report delivery type already emitted by daily-traffic-report v25.
-- Preserve the current allowed types, RLS, unique retry key and all delivery rows.
set local lock_timeout = '3s';
do $migration$
declare old_expression text;
begin
  lock table public.pastoral_notification_deliveries in access exclusive mode;
  select pg_get_expr(conbin, conrelid) into strict old_expression
  from pg_constraint
  where conrelid='public.pastoral_notification_deliveries'::regclass
    and conname='pastoral_notification_deliveries_notification_type_check';
  if position(quote_literal('daily_traffic_report') in old_expression) = 0 then
    alter table public.pastoral_notification_deliveries
      drop constraint pastoral_notification_deliveries_notification_type_check;
    execute format('alter table public.pastoral_notification_deliveries add constraint pastoral_notification_deliveries_notification_type_check check ((%s) OR notification_type = %L)',old_expression,'daily_traffic_report');
  end if;
end
$migration$;
