do $block$
begin
  if exists(select 1 from cron.job where jobname='church-os-overdue-review-line') then
    perform cron.unschedule('church-os-overdue-review-line');
  end if;
  perform cron.schedule('church-os-overdue-review-line','*/5 * * * *',$job$
    select net.http_post(
      url:=(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-project-url' order by created_at desc limit 1)||'/functions/v1/review-overdue-line',
      headers:=jsonb_build_object('content-type','application/json','x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' order by created_at desc limit 1)),
      body:='{}'::jsonb,
      timeout_milliseconds:=50000
    );
  $job$);
end $block$;
