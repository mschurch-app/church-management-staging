create table if not exists church_auth.account_home_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  church_id text not null check (church_id in ('M+', 'SHiNE')),
  home_modules text[] not null default '{}',
  notification_topics text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, church_id),
  check (cardinality(home_modules) <= 24),
  check (cardinality(notification_topics) <= 24)
);
revoke all on table church_auth.account_home_preferences from public, anon, authenticated;
grant all on table church_auth.account_home_preferences to service_role;

create or replace function public.get_my_home_preferences(p_church text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; v_modules text[]; v_topics text[]; v_title text;
begin
  if p_church not in ('M+', 'SHiNE')
     or not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active)
     or not exists(select 1 from church_auth.grants g where g.user_id=auth.uid() and g.church_id=p_church) then
    raise exception 'forbidden';
  end if;
  select r.role_key into v_role from church_auth.account_roles r where r.user_id=auth.uid() and r.church_id=p_church;
  select a.job_title into v_title from church_auth.accounts a where a.user_id=auth.uid();
  if v_role is null and exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then
    v_role:=case when coalesce(v_title,'') like '%師母%' then 'pastor_spouse' else 'pastor' end;
  end if;
  v_role:=coalesce(v_role,'custom');
  select p.home_modules,p.notification_topics into v_modules,v_topics
  from church_auth.account_home_preferences p where p.user_id=auth.uid() and p.church_id=p_church;
  return jsonb_build_object('role_key',v_role,'home_modules',to_jsonb(v_modules),'notification_topics',to_jsonb(v_topics));
end $$;

create or replace function public.set_admin_home_preferences(p_user uuid,p_church text,p_home_modules text[],p_notification_topics text[] default '{}')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  allowed_modules constant text[]:=array['members','newcomer_care','pastoral_workspace','private_prayers','pastoral_chats','attendance','groups','schedules','spaces','website_weekly','website_group_resources','tree_reading_admin','binding_review','notification_settings','school','basketball','system_monitor','church_settings'];
  allowed_topics constant text[]:=array['newcomer','newcomer_care','tasks','calendar','prayers','schedules','school','system'];
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_church not in ('M+','SHiNE')
     or cardinality(coalesce(p_home_modules,'{}'))>24 or cardinality(coalesce(p_notification_topics,'{}'))>24
     or exists(select 1 from unnest(coalesce(p_home_modules,'{}')) x where not(x=any(allowed_modules)))
     or exists(select 1 from unnest(coalesce(p_notification_topics,'{}')) x where not(x=any(allowed_topics))) then
    raise exception 'invalid_preferences';
  end if;
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user) then raise exception 'account_not_found'; end if;
  insert into church_auth.account_home_preferences(user_id,church_id,home_modules,notification_topics,updated_at)
  values(p_user,p_church,coalesce(p_home_modules,'{}'),coalesce(p_notification_topics,'{}'),now())
  on conflict(user_id,church_id) do update set home_modules=excluded.home_modules,notification_topics=excluded.notification_topics,updated_at=now();
  return true;
end $$;

revoke all on function public.get_my_home_preferences(text) from public,anon;
grant execute on function public.get_my_home_preferences(text) to authenticated,service_role;
revoke all on function public.set_admin_home_preferences(uuid,text,text[],text[]) from public,anon;
grant execute on function public.set_admin_home_preferences(uuid,text,text[],text[]) to authenticated,service_role;

create table if not exists church_auth.account_feature_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  church_id text not null check (church_id in ('M+', 'SHiNE')),
  feature_key text not null,
  can_view boolean not null default true,
  can_create boolean not null default true,
  can_edit boolean not null default true,
  can_delete boolean not null default false,
  can_export boolean not null default false,
  can_approve boolean not null default false,
  can_manage boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,church_id,feature_key)
);
revoke all on table church_auth.account_feature_permissions from public,anon,authenticated;
grant all on table church_auth.account_feature_permissions to service_role;

create or replace function public.get_my_feature_permissions(p_church text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active)
     or not exists(select 1 from church_auth.grants g where g.user_id=auth.uid() and g.church_id=p_church) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('feature_key',p.feature_key,'view',p.can_view,'create',p.can_create,'edit',p.can_edit,'delete',p.can_delete,'export',p.can_export,'approve',p.can_approve,'manage',p.can_manage) order by p.feature_key) from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church),'[]'::jsonb);
end $$;

create or replace function public.set_admin_feature_permissions(p_user uuid,p_church text,p_permissions jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item jsonb; allowed_features constant text[]:=array['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources'];
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_church not in ('M+','SHiNE') or jsonb_typeof(p_permissions)<>'array' or jsonb_array_length(p_permissions)>20 then raise exception 'invalid_permissions'; end if;
  for item in select value from jsonb_array_elements(p_permissions) loop
    if not(item->>'feature_key'=any(allowed_features)) then raise exception 'invalid_feature'; end if;
  end loop;
  delete from church_auth.account_feature_permissions where user_id=p_user and church_id=p_church;
  insert into church_auth.account_feature_permissions(user_id,church_id,feature_key,can_view,can_create,can_edit,can_delete,can_export,can_approve,can_manage)
  select p_user,p_church,x->>'feature_key',coalesce((x->>'view')::boolean,false),coalesce((x->>'create')::boolean,false),coalesce((x->>'edit')::boolean,false),coalesce((x->>'delete')::boolean,false),coalesce((x->>'export')::boolean,false),coalesce((x->>'approve')::boolean,false),coalesce((x->>'manage')::boolean,false)
  from jsonb_array_elements(p_permissions) x;
  return true;
end $$;

revoke all on function public.get_my_feature_permissions(text) from public,anon;
grant execute on function public.get_my_feature_permissions(text) to authenticated,service_role;
revoke all on function public.set_admin_feature_permissions(uuid,text,jsonb) from public,anon;
grant execute on function public.set_admin_feature_permissions(uuid,text,jsonb) to authenticated,service_role;

drop function if exists public.list_admin_accounts_v3();
create function public.list_admin_accounts_v3()
returns table(user_id uuid,email text,is_active boolean,display_name text,job_title text,grants jsonb,roles jsonb,is_owner boolean,invitation_state text,invited_at timestamptz,home_preferences jsonb,feature_permissions jsonb)
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  return query select a.user_id,u.email::text,a.is_active,a.display_name,a.job_title,
    coalesce((select jsonb_agg(jsonb_build_object('church_id',g.church_id,'permission',g.permission) order by g.church_id,g.permission) from church_auth.grants g where g.user_id=a.user_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('church_id',r.church_id,'role_key',r.role_key) order by r.church_id) from church_auth.account_roles r where r.user_id=a.user_id),'[]'::jsonb),
    exists(select 1 from church_auth.owners o where o.user_id=a.user_id),a.invitation_state,a.invited_at,
    coalesce((select jsonb_agg(jsonb_build_object('church_id',p.church_id,'home_modules',p.home_modules,'notification_topics',p.notification_topics) order by p.church_id) from church_auth.account_home_preferences p where p.user_id=a.user_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('church_id',p.church_id,'feature_key',p.feature_key,'view',p.can_view,'create',p.can_create,'edit',p.can_edit,'delete',p.can_delete,'export',p.can_export,'approve',p.can_approve,'manage',p.can_manage) order by p.church_id,p.feature_key) from church_auth.account_feature_permissions p where p.user_id=a.user_id),'[]'::jsonb)
  from church_auth.accounts a join auth.users u on u.id=a.user_id order by a.display_name,u.email;
end $$;
revoke all on function public.list_admin_accounts_v3() from public,anon;
grant execute on function public.list_admin_accounts_v3() to authenticated,service_role;
