create or replace function public.set_system_monitor_cron_active(p_user_id uuid,p_job_name text,p_active boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare target_id bigint;
begin
  if p_user_id is null or not exists(select 1 from church_auth.accounts a where a.user_id=p_user_id and a.is_active)
    or not (exists(select 1 from church_auth.owners o where o.user_id=p_user_id) or exists(select 1 from church_auth.system_monitor_viewers v where v.user_id=p_user_id)) then raise exception 'forbidden'; end if;
  if p_job_name not in ('mplus-line-discussion-summary-daily','mschool-daily-line-report-9pm','pastoral-newcomer-care-reminders-hourly','shine-weekly-sunday-service-line-card','weekly-sunday-service-line-card') then raise exception 'invalid_job'; end if;
  select jobid into target_id from cron.job where jobname=p_job_name;
  if target_id is null then raise exception 'job_not_found'; end if;
  perform cron.alter_job(job_id=>target_id,active=>p_active);
  return true;
end $$;
revoke all on function public.set_system_monitor_cron_active(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.set_system_monitor_cron_active(uuid,text,boolean) to service_role;
