-- New notifications start pending. Only an accepted Web Push may mark them sent.
-- Historical records retain their state; this change does not replay old alerts.
alter table public.app_notifications alter column push_sent_at drop default;

-- Only the backend delivery service may resolve another recipient's linked IDs.
create or replace function public.get_app_push_recipient_users(p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(ids.user_id order by ids.user_id),'[]'::jsonb)
  from (select distinct u as user_id from church_auth.account_users(p_user) u where u is not null) ids;
$$;
revoke all on function public.get_app_push_recipient_users(uuid) from public,anon,authenticated;
grant execute on function public.get_app_push_recipient_users(uuid) to service_role;

create or replace function public.list_my_app_notifications(p_limit integer default 30)
returns table(id uuid,church_id text,event_key text,title text,body text,target_url text,read_at timestamptz,created_at timestamptz)
language sql security definer set search_path='' as $$
  select n.id,n.church_id,n.event_key,n.title,n.body,n.target_url,n.read_at,n.created_at
  from public.app_notifications n
  where auth.uid() is not null and n.user_id in(select church_auth.account_users(auth.uid()))
  order by n.created_at desc,n.id desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;
create or replace function public.mark_app_notification_read(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.app_notifications set read_at=coalesce(read_at,now())
  where auth.uid() is not null and id=p_id and user_id in(select church_auth.account_users(auth.uid()));
  return found;
end;
$$;
revoke all on function public.list_my_app_notifications(integer),public.mark_app_notification_read(uuid) from public,anon;
grant execute on function public.list_my_app_notifications(integer),public.mark_app_notification_read(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
