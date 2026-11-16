alter table public.pastoral_staff_leave_requests add column if not exists calendar_sync_attempted_at timestamptz, add column if not exists calendar_sync_error_code text;
-- Retry approved leave only, using the same Google event ID. No approval changes.
select cron.schedule('admin-leave-calendar-recovery','15 * * * *',$job$
 select net.http_post(url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/pastoral-coworker-tools',headers:=jsonb_build_object('content-type','application/json','origin','https://mscos.mchurch.online','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' order by created_at desc limit 1)),body:='{"action":"repair-leave-calendar"}'::jsonb,timeout_milliseconds:=55000);
$job$);
