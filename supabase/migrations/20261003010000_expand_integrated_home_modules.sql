alter table church_auth.account_home_preferences
  drop constraint if exists account_home_preferences_home_modules_check;
alter table church_auth.account_home_preferences
  add constraint account_home_preferences_home_modules_check
  check(cardinality(home_modules)<=40);

create or replace function public.set_admin_home_preferences(p_user uuid,p_church text,p_home_modules text[],p_notification_topics text[] default '{}')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  allowed_modules constant text[]:=array[
    'members','newcomer_care','pastoral_workspace','private_prayers','pastoral_chats','attendance','groups','schedules','spaces',
    'website_weekly','website_group_resources','tree_reading_admin','binding_review','notification_settings',
    'school','school_checkin','school_schedules','school_rollcall','school_students','school_counseling','school_reports',
    'basketball','basketball_gamecenter','basketball_tactics','basketball_assignments','basketball_schedule','basketball_daily',
    'system_monitor','church_settings'
  ];
  allowed_topics constant text[]:=array['newcomer','newcomer_care','tasks','calendar','prayers','schedules','school','system'];
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_church not in ('M+','SHiNE')
     or cardinality(coalesce(p_home_modules,'{}'))>40 or cardinality(coalesce(p_notification_topics,'{}'))>24
     or exists(select 1 from unnest(coalesce(p_home_modules,'{}')) x where not(x=any(allowed_modules)))
     or exists(select 1 from unnest(coalesce(p_notification_topics,'{}')) x where not(x=any(allowed_topics))) then
    raise exception 'invalid_preferences';
  end if;
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user) then raise exception 'account_not_found'; end if;
  insert into church_auth.account_home_preferences(user_id,church_id,home_modules,notification_topics,updated_at)
  values(p_user,p_church,coalesce(p_home_modules,'{}'),coalesce(p_notification_topics,'{}'),now())
  on conflict(user_id,church_id) do update set home_modules=excluded.home_modules,notification_topics=excluded.notification_topics,updated_at=now();
  return true;
end $$;

revoke all on function public.set_admin_home_preferences(uuid,text,text[],text[]) from public,anon;
grant execute on function public.set_admin_home_preferences(uuid,text,text[],text[]) to authenticated,service_role;
