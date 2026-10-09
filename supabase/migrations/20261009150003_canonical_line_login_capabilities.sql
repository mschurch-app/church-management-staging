create or replace function church_auth.get_my_app_capabilities()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'is_owner',auth.uid() is not null and exists(select 1 from church_auth.owners o join church_auth.accounts a on a.user_id=o.user_id and a.is_active where o.user_id=auth.uid()),
    'has_line',auth.uid() is not null and exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active) and exists(select 1 from auth.identities i where i.user_id in (select church_auth.account_users(auth.uid())) and i.provider='custom:line-web'),
    'canonical_user_id',church_auth.canonical_account(auth.uid())
  )
$$;
revoke all on function church_auth.get_my_app_capabilities() from public,anon;
grant execute on function church_auth.get_my_app_capabilities() to authenticated;
create or replace function public.get_my_app_capabilities() returns jsonb language sql stable security invoker set search_path='' as $$ select church_auth.get_my_app_capabilities() $$;
revoke all on function public.get_my_app_capabilities() from public,anon;
grant execute on function public.get_my_app_capabilities() to authenticated;
notify pgrst,'reload schema';
