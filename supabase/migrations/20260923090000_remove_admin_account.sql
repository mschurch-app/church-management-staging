-- Owners may remove a non-owner administrator's access.
-- The Auth login and any member record remain independent and are not deleted.
begin;

create or replace function public.remove_admin_account(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from church_auth.owners o where o.user_id=auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  if p_user is null or p_user=auth.uid() or exists(
    select 1 from church_auth.owners o where o.user_id=p_user
  ) then
    raise exception 'owner_immutable';
  end if;

  delete from church_auth.accounts where user_id=p_user;
  if not found then raise exception 'account_not_found'; end if;
  return true;
end $$;

revoke all on function public.remove_admin_account(uuid) from public,anon,authenticated;
grant execute on function public.remove_admin_account(uuid) to authenticated;

commit;
