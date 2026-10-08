alter table public.app_notifications
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_attempt_count integer not null default 0,
  add column if not exists push_last_error text;

alter table public.app_notifications
  alter column push_sent_at set default now();

update public.app_notifications
set push_sent_at=coalesce(push_sent_at,created_at)
where push_sent_at is null;

-- Requeue only the explicitly requested owner test notification.
update public.app_notifications
set push_sent_at=null,push_attempt_count=0,push_last_error=null
where source_key='admin-access-review-test-20261008';

do $block$
begin
  if exists(select 1 from cron.job where jobname='church-os-app-push-delivery') then
    perform cron.unschedule('church-os-app-push-delivery');
  end if;
  perform cron.schedule('church-os-app-push-delivery','* * * * *',$job$
    select net.http_post(
      url := 'https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/app-push',
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' order by created_at desc limit 1)
      ),
      body := jsonb_build_object('action','deliver-pending'),
      timeout_milliseconds := 50000
    );
  $job$);
end;
$block$;

comment on column public.app_notifications.push_sent_at is 'Timestamp when at least one registered App device accepted the background push.';
comment on column public.app_notifications.push_attempt_count is 'Number of background delivery attempts.';
comment on column public.app_notifications.push_last_error is 'Last non-secret delivery status for operations troubleshooting.';
