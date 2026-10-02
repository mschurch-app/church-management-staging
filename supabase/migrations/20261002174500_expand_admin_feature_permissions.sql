-- Keep administrator permissions synchronized with the current Church OS features.
alter table church_auth.grants drop constraint if exists grants_permission_check;
alter table church_auth.grants add constraint grants_permission_check check (permission in ('attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources'));

create or replace function church_auth.role_permissions(target_role text)
returns text[] language sql immutable set search_path='' as $$
  select case target_role
    when 'pastor' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources']::text[]
    when 'pastor_spouse' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources']::text[]
    when 'administrator' then array['attendance','groups','members','schedules','spaces','newcomer_care','binding_review','notification_settings']::text[]
    when 'group_leader' then array['attendance','groups','members']::text[]
    when 'care' then array['members','pastoral_chats','private_prayers','newcomer_care']::text[]
    when 'facilities' then array['spaces']::text[]
    when 'custom' then array[]::text[]
    else null::text[] end;
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
         'private_prayers', 'pastoral_chats', 'spaces',
         'newcomer_care', 'tree_reading_admin', 'binding_review',
         'notification_settings', 'website_weekly', 'website_group_resources'
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

-- Keep configured feature metadata aligned with the permission checks used by the pages.
update public.church_customizations c
set feature_modules=(select jsonb_agg(case item->>'key'
  when 'newcomer_care' then jsonb_set(item,'{permission}','"newcomer_care"')
  when 'tree_reading_admin' then jsonb_set(item,'{permission}','"tree_reading_admin"')
  when 'binding_review' then jsonb_set(item,'{permission}','"binding_review"')
  when 'notification_settings' then jsonb_set(item,'{permission}','"notification_settings"')
  when 'website_weekly' then jsonb_set(item,'{permission}','"website_weekly"')
  when 'website_group_resources' then jsonb_set(item,'{permission}','"website_group_resources"')
  else item end order by ord)
  from jsonb_array_elements(c.feature_modules) with ordinality x(item,ord)),
  version=version+1,updated_at=now();
