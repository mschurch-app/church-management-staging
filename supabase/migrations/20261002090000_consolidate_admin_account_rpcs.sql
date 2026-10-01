-- Keep one audited implementation for each administrator-account operation.
-- The v3 names remain stable for the deployed frontend and Edge Functions.

create or replace function public.list_admin_accounts_v3()
returns table(
  user_id uuid,
  email text,
  is_active boolean,
  display_name text,
  job_title text,
  grants jsonb,
  roles jsonb,
  is_owner boolean,
  invitation_state text,
  invited_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from church_auth.owners o where o.user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;

  return query
  select
    a.user_id,
    u.email::text,
    a.is_active,
    a.display_name,
    a.job_title,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('church_id', g.church_id, 'permission', g.permission)
        order by g.church_id, g.permission
      )
      from church_auth.grants g
      where g.user_id = a.user_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('church_id', r.church_id, 'role_key', r.role_key)
        order by r.church_id
      )
      from church_auth.account_roles r
      where r.user_id = a.user_id
    ), '[]'::jsonb),
    exists(select 1 from church_auth.owners o where o.user_id = a.user_id),
    a.invitation_state,
    a.invited_at
  from church_auth.accounts a
  join auth.users u on u.id = a.user_id
  order by a.display_name, u.email;
end
$$;

create or replace function public.set_admin_account_access_v3(
  p_user uuid,
  p_active boolean,
  p_grants jsonb,
  p_roles jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  target_church text;
  target_role text;
  expected text[];
  church_count integer;
begin
  if not exists (
    select 1 from church_auth.owners o where o.user_id = auth.uid()
  ) then
    raise exception 'not_owner';
  end if;
  if exists (
    select 1 from church_auth.owners o where o.user_id = p_user
  ) then
    raise exception 'owner_immutable';
  end if;
  if jsonb_typeof(p_grants) <> 'array'
     or jsonb_array_length(p_grants) > 20
     or jsonb_typeof(p_roles) <> 'array'
     or jsonb_array_length(p_roles) > 1 then
    raise exception 'invalid_access';
  end if;

  select count(distinct church_id)
  into church_count
  from (
    select value->>'church_id' as church_id from jsonb_array_elements(p_grants)
    union all
    select value->>'church_id' as church_id from jsonb_array_elements(p_roles)
  ) selected
  where church_id is not null;
  if church_count > 1 then
    raise exception 'one_church_only';
  end if;

  for item in select value from jsonb_array_elements(p_grants)
  loop
    if item->>'church_id' not in ('M+', 'SHiNE')
       or item->>'permission' not in (
         'members', 'attendance', 'groups', 'schedules',
         'private_prayers', 'pastoral_chats', 'spaces'
       ) then
      raise exception 'invalid_grant';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_roles)
  loop
    target_church := item->>'church_id';
    target_role := item->>'role_key';
    if target_church not in ('M+', 'SHiNE')
       or church_auth.role_permissions(target_role) is null then
      raise exception 'invalid_role';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(p_grants) g
      where g->>'church_id' = target_church
    ) then
      raise exception 'role_without_grants';
    end if;
    if target_role <> 'custom' then
      expected := church_auth.role_permissions(target_role);
      if exists (
        select 1 from unnest(expected) permission
        where not exists (
          select 1 from jsonb_array_elements(p_grants) g
          where g->>'church_id' = target_church
            and g->>'permission' = permission
        )
      ) or exists (
        select 1 from jsonb_array_elements(p_grants) g
        where g->>'church_id' = target_church
          and not (g->>'permission' = any(expected))
      ) then
        raise exception 'role_grants_mismatch';
      end if;
    end if;
  end loop;

  if exists (
    select 1
    from (
      select distinct g->>'church_id' as church_id
      from jsonb_array_elements(p_grants) g
    ) selected_grant
    where not exists (
      select 1 from jsonb_array_elements(p_roles) r
      where r->>'church_id' = selected_grant.church_id
    )
  ) then
    raise exception 'missing_role';
  end if;

  update church_auth.accounts
  set is_active = p_active, updated_at = now()
  where user_id = p_user;
  if not found then
    raise exception 'account_not_found';
  end if;

  delete from church_auth.grants where user_id = p_user;
  insert into church_auth.grants(user_id, church_id, permission)
  select distinct p_user, x.value->>'church_id', x.value->>'permission'
  from jsonb_array_elements(p_grants) x(value);

  delete from church_auth.account_roles where user_id = p_user;
  insert into church_auth.account_roles(user_id, church_id, role_key)
  select p_user, x.value->>'church_id', x.value->>'role_key'
  from jsonb_array_elements(p_roles) x(value);

  return true;
end
$$;

revoke all on function public.list_admin_accounts_v3() from public, anon;
grant execute on function public.list_admin_accounts_v3() to authenticated, service_role;
revoke all on function public.set_admin_account_access_v3(uuid, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.set_admin_account_access_v3(uuid, boolean, jsonb, jsonb) to authenticated, service_role;

drop function if exists public.list_admin_accounts();
drop function if exists public.list_admin_accounts_v2();
drop function if exists public.set_admin_account_access(uuid, boolean, jsonb);
drop function if exists public.set_admin_account_access_v2(uuid, boolean, jsonb, jsonb);
