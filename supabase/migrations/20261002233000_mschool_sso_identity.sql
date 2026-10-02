-- Read-only identity bridge for the optional Church OS -> M+ School login path.
-- The existing M+ School manual login and sessions remain unchanged.
create or replace function public.get_mschool_sso_identity(p_user uuid)
returns text language sql security definer set search_path='' as $$
 select a.display_name from church_auth.accounts a
 where a.user_id=p_user and a.is_active
   and exists(select 1 from church_auth.grants g where g.user_id=a.user_id and g.church_id='M+')
 limit 1;
$$;
revoke all on function public.get_mschool_sso_identity(uuid) from public,anon,authenticated;
grant execute on function public.get_mschool_sso_identity(uuid) to service_role;

