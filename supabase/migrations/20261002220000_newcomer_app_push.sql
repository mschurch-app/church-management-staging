alter table public.app_notifications add column if not exists source_key text;
create unique index if not exists app_notifications_source_unique
  on public.app_notifications(user_id,event_key,source_key) where source_key is not null;

create or replace function public.get_app_push_recipient_users(p_church text,p_permission text)
returns uuid[] language sql security definer set search_path='' as $$
  select coalesce(array_agg(distinct a.user_id),'{}'::uuid[])
  from church_auth.accounts a
  join church_auth.grants g on g.user_id=a.user_id
  where a.is_active and g.church_id=p_church and g.permission=p_permission;
$$;
revoke all on function public.get_app_push_recipient_users(text,text) from public,anon,authenticated;
grant execute on function public.get_app_push_recipient_users(text,text) to service_role;

