create table public.facebook_connection_health (
 channel text primary key check(channel in ('church','association')),
 credential_connected_at timestamptz not null,
 status text not null default 'unchecked' check(status in ('unchecked','healthy','reauthorization_required','permission_required','check_failed','not_connected')),
 checked_at timestamptz, last_success_at timestamptz, consecutive_failures integer not null default 0,
 token_lifetime text not null default 'unknown' check(token_lifetime in ('unknown','fixed','no_fixed_expiry')),
 expires_at timestamptz, lifetime_verified_at timestamptz,
 last_error text check(last_error in ('invalid_token','permission_required','page_mismatch','network_error','not_connected')),
 incident_counter integer not null default 0, updated_at timestamptz not null default now()
);
alter table public.facebook_connection_health enable row level security;
revoke all on public.facebook_connection_health from public,anon,authenticated;
grant all on public.facebook_connection_health to service_role;
create function public.record_facebook_connection_health(p_channel text,p_connected_at timestamptz,p_status text,p_error text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare current_at timestamptz; old public.facebook_connection_health; failures integer; incident integer; bucket text; recipient uuid; label text; note text; stamp text;
begin
 if p_channel='church' then select connected_at into current_at from public.church_facebook_connections where church_id='M+' for update;
 elsif p_channel='association' then select connected_at into current_at from public.association_story_settings where id for update;
 else raise exception 'invalid_channel'; end if;
 if current_at is distinct from p_connected_at then return false; end if;
 select * into old from public.facebook_connection_health where channel=p_channel for update;
 if old.credential_connected_at is distinct from current_at then old:=null; end if;
 failures:=case when p_status='healthy' then 0 else coalesce(old.consecutive_failures,0)+1 end;
 incident:=coalesce(old.incident_counter,0)+case when p_status<>'healthy' and coalesce(old.status,'unchecked') in ('healthy','unchecked') then 1 else 0 end;
 insert into public.facebook_connection_health(channel,credential_connected_at,status,checked_at,last_success_at,consecutive_failures,last_error,incident_counter)
 values(p_channel,current_at,p_status,now(),case when p_status='healthy' then now() else null end,failures,p_error,incident)
 on conflict(channel) do update set credential_connected_at=excluded.credential_connected_at,status=excluded.status,checked_at=now(),last_success_at=coalesce(excluded.last_success_at,old.last_success_at),consecutive_failures=failures,last_error=p_error,incident_counter=incident,
 token_lifetime=coalesce(old.token_lifetime,'unknown'),expires_at=old.expires_at,lifetime_verified_at=old.lifetime_verified_at,updated_at=now();
 label:=case when p_channel='church' then '教會 FB' else '協會 FB' end;
 if p_status in ('reauthorization_required','permission_required','not_connected') then bucket:=p_status;note:=label||'需要重新核對授權，請開啟服務授權管理。原有稿件與發布紀錄均保留。';
 elsif p_status='check_failed' and failures>=3 then bucket:='check_failed';note:=label||'連續三次未能完成連線檢查。請核對服務狀態；這不一定代表授權失效。';
 elsif p_status='healthy' and old.expires_at<=now()+interval '30 days' then
  bucket:=case when old.expires_at<=now() then 'expiry-due' when old.expires_at<=now()+interval '1 day' then 'expiry-1' when old.expires_at<=now()+interval '7 days' then 'expiry-7' when old.expires_at<=now()+interval '14 days' then 'expiry-14' else 'expiry-30' end;
  note:=label||'的授權即將達到記錄效期，請在服務授權管理核對並更新。';
 elsif p_status='healthy' and old.status in ('reauthorization_required','permission_required','check_failed','not_connected') then bucket:='recovered';note:=label||'連線檢查已恢復正常。';
 end if;
 if bucket is not null then
  stamp:=p_channel||':'||current_at::text||':'||incident::text||':'||bucket;
  for recipient in select distinct x.recipient from (select reviewer_id as recipient from public.association_story_settings where id union select additional_reviewer_id from public.association_story_settings where id) x where x.recipient is not null loop
   insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key)
   values(recipient,'M+','facebook_connection_health',label||'連線維護通知',note,'/authorization-settings.html?church=M%2B','facebook-health:'||stamp)
   on conflict(user_id,event_key,source_key) where source_key is not null do nothing;
  end loop;
 end if;
 return true;
end $$;
revoke all on function public.record_facebook_connection_health(text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_facebook_connection_health(text,timestamptz,text,text) to service_role;
insert into public.facebook_connection_health(channel,credential_connected_at)
 select 'church',connected_at from public.church_facebook_connections where church_id='M+'
 union all select 'association',connected_at from public.association_story_settings where id and connected_at is not null;
-- Daily 09:00 Taiwan time. Secrets remain inside Vault; none are returned to clients.
select cron.schedule('facebook-connection-health-daily','0 1 * * *',$job$
 select net.http_post(url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/facebook-connection-maintenance',headers:=jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' order by created_at desc limit 1)),body:='{"action":"check"}'::jsonb,timeout_milliseconds:=50000);
$job$);
-- Independent SQL watchdog detects a worker that never starts or stops reporting.
select cron.schedule('facebook-connection-health-watchdog','0 5 * * *',$job$
 insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key)
 select distinct s.recipient,'M+','facebook_connection_health','FB 連線檢查未完成','超過36小時沒有完成 FB 連線檢查，請開啟服務授權管理核對。這不表示粉專授權已失效。','/authorization-settings.html?church=M%2B','facebook-watchdog:'||h.channel||':'||current_date::text
 from public.facebook_connection_health h cross join (select reviewer_id as recipient from public.association_story_settings where id union select additional_reviewer_id from public.association_story_settings where id) s
 where s.recipient is not null and coalesce(h.checked_at,h.updated_at)<now()-interval '36 hours'
 on conflict(user_id,event_key,source_key) where source_key is not null do nothing;
$job$);
