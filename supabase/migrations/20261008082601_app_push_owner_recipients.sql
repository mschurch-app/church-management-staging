create or replace function public.get_app_push_owner_users()
returns uuid[]
language sql
security definer
set search_path=''
as $function$
  select coalesce(array_agg(o.user_id order by o.user_id),'{}'::uuid[])
  from church_auth.owners o
  join church_auth.accounts a on a.user_id=o.user_id and a.is_active;
$function$;

revoke all on function public.get_app_push_owner_users() from public,anon,authenticated;
grant execute on function public.get_app_push_owner_users() to service_role;

comment on function public.get_app_push_owner_users() is 'Returns active Church OS project owners for service-side App notification delivery.';
