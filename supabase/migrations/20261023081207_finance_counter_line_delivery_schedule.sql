do $block$
begin
 if exists(select 1 from cron.job where jobname='finance-counter-line-delivery') then
  perform cron.unschedule('finance-counter-line-delivery');
 end if;
 perform cron.schedule('finance-counter-line-delivery','*/2 * * * *',$job$
 select net.http_post(
  url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/finance-cash-notifications',
  headers:=jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' order by created_at desc limit 1)),
  body:='{}'::jsonb,timeout_milliseconds:=50000);
 $job$);
end $block$;
