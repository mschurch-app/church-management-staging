begin;

-- An Email Auth tombstone can still have an unexpired JWT.  Its verified
-- identity link is retained for historical lookup, but it must not inherit
-- the active LINE account's work profile access.
create or replace function public.get_work_profile(p_user uuid default null, p_church text default 'M+')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid;
  target uuid;
  own boolean;
  row church_auth.work_profiles;
begin
  if auth.uid() is null or not exists (
    select 1 from church_auth.accounts a
    where a.user_id=auth.uid() and a.is_active
  ) then raise exception 'forbidden'; end if;
  actor:=church_auth.canonical_account(auth.uid());
  target:=church_auth.canonical_account(coalesce(p_user,auth.uid()));
  select exists(select 1 from church_auth.owners where user_id in (select church_auth.account_users(actor))) into own;
  if not own and actor<>target then raise exception 'forbidden'; end if;
  if p_church not in ('M+','SHiNE') or not exists(select 1 from church_auth.accounts where user_id=actor and is_active) then raise exception 'forbidden'; end if;
  if not own and not exists(select 1 from church_auth.grants where user_id in (select church_auth.account_users(actor)) and church_id=p_church) then raise exception 'forbidden'; end if;
  select * into row from church_auth.work_profiles where user_id=target and church_id=p_church;
  return jsonb_build_object('profile',case when row.user_id is null then null else to_jsonb(row)-'updated_by' end,'can_edit',own);
end $$;
revoke all on function public.get_work_profile(uuid,text) from public,anon;
grant execute on function public.get_work_profile(uuid,text) to authenticated,service_role;

commit;
