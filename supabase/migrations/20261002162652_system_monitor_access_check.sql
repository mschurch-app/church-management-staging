create or replace function public.get_my_system_monitor_access()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(select 1 from church_auth.owners o where o.user_id=auth.uid())
      or exists(select 1 from church_auth.system_monitor_viewers v where v.user_id=auth.uid());
$$;

revoke all on function public.get_my_system_monitor_access() from public,anon;
grant execute on function public.get_my_system_monitor_access() to authenticated;
