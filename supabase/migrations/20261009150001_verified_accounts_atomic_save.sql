-- Phase 1: explicit, owner-reviewed identity associations; no matching by name.
create table church_auth.account_identity_links (
  alias_user_id uuid primary key references auth.users(id) on delete cascade,
  canonical_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  check(alias_user_id<>canonical_user_id)
);
create index account_identity_links_canonical_idx on church_auth.account_identity_links(canonical_user_id);
alter table church_auth.account_identity_links enable row level security;
revoke all on church_auth.account_identity_links from public,anon,authenticated;

create table church_auth.account_operation_receipts (
  actor_user_id uuid not null references auth.users(id),
  request_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_user_id,request_id)
);
alter table church_auth.account_operation_receipts enable row level security;
revoke all on church_auth.account_operation_receipts from public,anon,authenticated;
create table church_auth.account_change_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id),
  canonical_user_id uuid not null references auth.users(id),
  action text not null check(action in ('save','revoke','link')),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index account_change_audit_account_idx on church_auth.account_change_audit(canonical_user_id,created_at);
alter table church_auth.account_change_audit enable row level security;
revoke all on church_auth.account_change_audit from public,anon,authenticated;

create function church_auth.canonical_account(p_user uuid) returns uuid language sql stable set search_path='' as $$
  select coalesce((select canonical_user_id from church_auth.account_identity_links where alias_user_id=p_user),p_user)
$$;
create function church_auth.account_users(p_user uuid) returns setof uuid language sql stable set search_path='' as $$
  select church_auth.canonical_account(p_user)
  union select alias_user_id from church_auth.account_identity_links where canonical_user_id=church_auth.canonical_account(p_user)
$$;
create function church_auth.account_snapshot(p_user uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id) from church_auth.accounts a where a.user_id in (select church_auth.account_users(p_user))),'[]'::jsonb),
    'grants',coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id,a.church_id,a.permission) from church_auth.grants a where a.user_id in (select church_auth.account_users(p_user))),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id,a.church_id) from church_auth.account_roles a where a.user_id in (select church_auth.account_users(p_user))),'[]'::jsonb),
    'features',coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id,a.church_id,a.feature_key) from church_auth.account_feature_permissions a where a.user_id in (select church_auth.account_users(p_user))),'[]'::jsonb),
    'home',coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id,a.church_id) from church_auth.account_home_preferences a where a.user_id in (select church_auth.account_users(p_user))),'[]'::jsonb),
    'scopes',coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id,a.church_id,a.ministry_key) from church_auth.service_ministry_scopes a where a.user_id in (select church_auth.account_users(p_user))),'[]'::jsonb),
    'links',coalesce((select jsonb_agg(to_jsonb(a) order by a.alias_user_id) from church_auth.account_identity_links a where a.canonical_user_id=church_auth.canonical_account(p_user)),'[]'::jsonb)
  )
$$;
-- Live DB authorization, not mutable user_metadata or stale JWT permission claims.
create function church_auth.assert_account_owner() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from church_auth.accounts where user_id=auth.uid() and is_active and invitation_state='active')
    or not exists(select 1 from church_auth.owners where user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if nullif(auth.jwt()->>'session_id','') is not null and not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid()) then raise exception 'session_revoked'; end if;
  -- One short transaction serializes identity linking and administrative edits.
  perform pg_catalog.pg_advisory_xact_lock(57201,1);
end $$;
revoke all on function church_auth.canonical_account(uuid),church_auth.account_users(uuid),church_auth.account_snapshot(uuid),church_auth.assert_account_owner() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION church_auth.single_set_admin_account_profile(p_user uuid, p_display_name text, p_job_title text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                        declare clean_name text:=trim(coalesce(p_display_name,'')); clean_title text:=trim(coalesce(p_job_title,''));
                                                                        begin
                                                                          if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
                                                                            if length(clean_name) not between 1 and 60 or length(clean_title) not between 1 and 60 then raise exception 'invalid_profile'; end if;
                                                                              update church_auth.accounts set display_name=clean_name,job_title=clean_title,updated_at=now() where user_id=p_user;
                                                                                if not found then raise exception 'account_not_found'; end if; return true;
                                                                                end $function$;

revoke all on function church_auth.single_set_admin_account_profile(uuid,text,text) from public,anon,authenticated;
create function church_auth.set_admin_account_profile(p_user uuid,p_display_name text,p_job_title text) returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid;
begin
  perform church_auth.assert_account_owner();
  for u in select church_auth.account_users(p_user) loop perform church_auth.single_set_admin_account_profile(u,p_display_name,p_job_title); end loop;
  return true;
end $$;
create or replace function public.set_admin_account_profile(p_user uuid,p_display_name text,p_job_title text) returns boolean language sql security invoker set search_path='' as $$ select church_auth.set_admin_account_profile(p_user,p_display_name,p_job_title) $$;
revoke all on function public.set_admin_account_profile(uuid,text,text),church_auth.set_admin_account_profile(uuid,text,text) from public,anon;
grant execute on function public.set_admin_account_profile(uuid,text,text),church_auth.set_admin_account_profile(uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION church_auth.single_set_admin_account_access_v3(p_user uuid, p_active boolean, p_grants jsonb, p_roles jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; target_church text; target_role text; expected text[]; church_count integer;
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if exists(select 1 from church_auth.owners o where o.user_id=p_user) then raise exception 'owner_immutable'; end if;
  if jsonb_typeof(p_grants)<>'array' or jsonb_array_length(p_grants)>24 or jsonb_typeof(p_roles)<>'array' or jsonb_array_length(p_roles)>1 then raise exception 'invalid_access'; end if;
  select count(distinct church_id) into church_count from (
    select value->>'church_id' church_id from jsonb_array_elements(p_grants)
    union all select value->>'church_id' from jsonb_array_elements(p_roles)
  ) selected where church_id is not null;
  if church_count>1 then raise exception 'one_church_only'; end if;
  for item in select value from jsonb_array_elements(p_grants) loop
    if item->>'church_id' not in ('M+','SHiNE') or item->>'permission' not in (
      'members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces',
      'newcomer_care','tree_reading_admin','binding_review','notification_settings',
      'website_weekly','website_group_resources','inventory','heat_camp'
    ) then raise exception 'invalid_grant'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_roles) loop
    target_church:=item->>'church_id'; target_role:=item->>'role_key';
    if target_church not in ('M+','SHiNE') or church_auth.role_permissions(target_role) is null then raise exception 'invalid_role'; end if;
    if not exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church) then raise exception 'role_without_grants'; end if;
    if target_role<>'custom' then
      expected:=church_auth.role_permissions(target_role);
      if exists(select 1 from unnest(expected) permission where not exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church and g->>'permission'=permission))
         or exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church and not(g->>'permission'=any(expected))) then raise exception 'role_grants_mismatch'; end if;
    end if;
  end loop;
  if exists(select 1 from (select distinct g->>'church_id' church_id from jsonb_array_elements(p_grants) g) x where not exists(select 1 from jsonb_array_elements(p_roles) r where r->>'church_id'=x.church_id)) then raise exception 'missing_role'; end if;
  update church_auth.accounts set is_active=p_active,updated_at=now() where user_id=p_user;
  if not found then raise exception 'account_not_found'; end if;
  delete from church_auth.grants where user_id=p_user;
  insert into church_auth.grants(user_id,church_id,permission) select distinct p_user,x.value->>'church_id',x.value->>'permission' from jsonb_array_elements(p_grants) x(value);
  delete from church_auth.account_roles where user_id=p_user;
  insert into church_auth.account_roles(user_id,church_id,role_key) select p_user,x.value->>'church_id',x.value->>'role_key' from jsonb_array_elements(p_roles) x(value);
  return true;
end $function$;

revoke all on function church_auth.single_set_admin_account_access_v3(uuid,boolean,jsonb,jsonb) from public,anon,authenticated;
create function church_auth.set_admin_account_access_v3(p_user uuid,p_active boolean,p_grants jsonb,p_roles jsonb) returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid;
begin
  perform church_auth.assert_account_owner();
  for u in select church_auth.account_users(p_user) loop perform church_auth.single_set_admin_account_access_v3(u,p_active,p_grants,p_roles); end loop;
  return true;
end $$;
create or replace function public.set_admin_account_access_v3(p_user uuid,p_active boolean,p_grants jsonb,p_roles jsonb) returns boolean language sql security invoker set search_path='' as $$ select church_auth.set_admin_account_access_v3(p_user,p_active,p_grants,p_roles) $$;
revoke all on function public.set_admin_account_access_v3(uuid,boolean,jsonb,jsonb),church_auth.set_admin_account_access_v3(uuid,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.set_admin_account_access_v3(uuid,boolean,jsonb,jsonb),church_auth.set_admin_account_access_v3(uuid,boolean,jsonb,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION church_auth.single_set_admin_home_preferences(p_user uuid, p_church text, p_home_modules text[], p_notification_topics text[] DEFAULT '{}'::text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  allowed_modules constant text[]:=array[
    'members','newcomer_care','pastoral_workspace','private_prayers','pastoral_chats','attendance','groups','schedules','spaces','inventory','heat_camp',
    'website_weekly','website_group_resources','tree_reading_admin','binding_review','notification_settings',
    'school','school_checkin','school_schedules','school_rollcall','school_students','school_counseling','school_reports',
    'basketball','basketball_gamecenter','basketball_tactics','basketball_assignments','basketball_schedule','basketball_daily',
    'system_monitor','church_settings'
  ];
  allowed_topics constant text[]:=array['newcomer','newcomer_care','tasks','calendar','prayers','schedules','school','system'];
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_church not in ('M+','SHiNE')
     or cardinality(coalesce(p_home_modules,'{}'))>40 or cardinality(coalesce(p_notification_topics,'{}'))>24
     or exists(select 1 from unnest(coalesce(p_home_modules,'{}')) x where not(x=any(allowed_modules)))
     or exists(select 1 from unnest(coalesce(p_notification_topics,'{}')) x where not(x=any(allowed_topics))) then raise exception 'invalid_preferences'; end if;
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user) then raise exception 'account_not_found'; end if;
  insert into church_auth.account_home_preferences(user_id,church_id,home_modules,notification_topics,updated_at)
  values(p_user,p_church,coalesce(p_home_modules,'{}'),coalesce(p_notification_topics,'{}'),now())
  on conflict(user_id,church_id) do update set home_modules=excluded.home_modules,notification_topics=excluded.notification_topics,updated_at=now();
  return true;
end $function$;

revoke all on function church_auth.single_set_admin_home_preferences(uuid,text,text[],text[]) from public,anon,authenticated;
create function church_auth.set_admin_home_preferences(p_user uuid,p_church text,p_home_modules text[],p_notification_topics text[] default '{}'::text[]) returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid;
begin
  perform church_auth.assert_account_owner();
  for u in select church_auth.account_users(p_user) loop perform church_auth.single_set_admin_home_preferences(u,p_church,p_home_modules,p_notification_topics); end loop;
  return true;
end $$;
create or replace function public.set_admin_home_preferences(p_user uuid,p_church text,p_home_modules text[],p_notification_topics text[] default '{}'::text[]) returns boolean language sql security invoker set search_path='' as $$ select church_auth.set_admin_home_preferences(p_user,p_church,p_home_modules,p_notification_topics) $$;
revoke all on function public.set_admin_home_preferences(uuid,text,text[],text[]),church_auth.set_admin_home_preferences(uuid,text,text[],text[]) from public,anon;
grant execute on function public.set_admin_home_preferences(uuid,text,text[],text[]),church_auth.set_admin_home_preferences(uuid,text,text[],text[]) to authenticated;

CREATE OR REPLACE FUNCTION church_auth.single_set_admin_feature_permissions(p_user uuid, p_church text, p_permissions jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; allowed_features constant text[]:=array['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp'];
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
end $function$;

revoke all on function church_auth.single_set_admin_feature_permissions(uuid,text,jsonb) from public,anon,authenticated;
create function church_auth.set_admin_feature_permissions(p_user uuid,p_church text,p_permissions jsonb) returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid;
begin
  perform church_auth.assert_account_owner();
  for u in select church_auth.account_users(p_user) loop perform church_auth.single_set_admin_feature_permissions(u,p_church,p_permissions); end loop;
  return true;
end $$;
create or replace function public.set_admin_feature_permissions(p_user uuid,p_church text,p_permissions jsonb) returns boolean language sql security invoker set search_path='' as $$ select church_auth.set_admin_feature_permissions(p_user,p_church,p_permissions) $$;
revoke all on function public.set_admin_feature_permissions(uuid,text,jsonb),church_auth.set_admin_feature_permissions(uuid,text,jsonb) from public,anon;
grant execute on function public.set_admin_feature_permissions(uuid,text,jsonb),church_auth.set_admin_feature_permissions(uuid,text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION church_auth.single_set_service_signup_scopes(p_user uuid, p_church text, p_ministries text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ministry text;
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'forbidden'; end if;
  if p_church not in ('M+','SHiNE') or not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
    or (cardinality(coalesce(p_ministries,'{}'))>0 and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id=p_church and g.permission='schedules')) then raise exception 'invalid_account'; end if;
  if exists(select 1 from unnest(coalesce(p_ministries,'{}')) x where x not in ('media','worship','welcome','children','all')) then raise exception 'invalid_scope'; end if;
  if 'all'=any(coalesce(p_ministries,'{}')) and cardinality(coalesce(p_ministries,'{}'))>1 then raise exception 'invalid_scope'; end if;
  delete from church_auth.service_ministry_scopes where user_id=p_user and church_id=p_church;
  foreach v_ministry in array coalesce(p_ministries,'{}') loop insert into church_auth.service_ministry_scopes(user_id,church_id,ministry_key) values(p_user,p_church,v_ministry);end loop;
  return true;
end $function$;

revoke all on function church_auth.single_set_service_signup_scopes(uuid,text,text[]) from public,anon,authenticated;
create function church_auth.set_service_signup_scopes(p_user uuid,p_church text,p_ministries text[]) returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid;
begin
  perform church_auth.assert_account_owner();
  for u in select church_auth.account_users(p_user) loop perform church_auth.single_set_service_signup_scopes(u,p_church,p_ministries); end loop;
  return true;
end $$;
create or replace function public.set_service_signup_scopes(p_user uuid,p_church text,p_ministries text[]) returns boolean language sql security invoker set search_path='' as $$ select church_auth.set_service_signup_scopes(p_user,p_church,p_ministries) $$;
revoke all on function public.set_service_signup_scopes(uuid,text,text[]),church_auth.set_service_signup_scopes(uuid,text,text[]) from public,anon;
grant execute on function public.set_service_signup_scopes(uuid,text,text[]),church_auth.set_service_signup_scopes(uuid,text,text[]) to authenticated;

create function church_auth.list_admin_accounts_v4() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform church_auth.assert_account_owner();
  select coalesce(jsonb_agg(x.record order by x.record->>'display_name',x.record->>'email'),'[]'::jsonb) into result from (
    select distinct on (church_auth.canonical_account(a.user_id))
      to_jsonb(a)||jsonb_build_object(
        'canonical_user_id',church_auth.canonical_account(a.user_id),
        'linked_user_ids',coalesce((select jsonb_agg(u order by u) from church_auth.account_users(a.user_id) u where u<>a.user_id),'[]'::jsonb),
        'has_line',exists(select 1 from auth.identities i where i.user_id in (select church_auth.account_users(a.user_id)) and i.provider='custom:line-web'),
        'line_user_id',(select i.user_id from auth.identities i where i.user_id in (select church_auth.account_users(a.user_id)) and i.provider='custom:line-web' order by i.user_id limit 1),
        'identity_review_required',exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web') and not exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='email') and not exists(select 1 from church_auth.account_identity_links l where l.alias_user_id=a.user_id or l.canonical_user_id=a.user_id),
        'member_associations',coalesce((select jsonb_agg(distinct jsonb_build_object('church_id',b.church_id,'member_id',b.member_id)) from church_auth.member_bindings b join auth.identities i on i.provider_id=b.line_subject and i.provider='custom:line-web' where i.user_id in (select church_auth.account_users(a.user_id)) and b.active),'[]'::jsonb),
        'version',md5(church_auth.account_snapshot(a.user_id)::text)
      ) record
    from public.list_admin_accounts_v3() a
    order by church_auth.canonical_account(a.user_id),(a.user_id=church_auth.canonical_account(a.user_id)) desc
  ) x;
  return result;
end $$;
create function public.list_admin_accounts_v4() returns jsonb language sql security invoker set search_path='' as $$ select church_auth.list_admin_accounts_v4() $$;

create function church_auth.save_admin_account_bundle(p_user uuid,p_church text,p_input jsonb,p_expected_version text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare root uuid; u uuid; before_data jsonb; after_data jsonb; v_hash text; v_receipt church_auth.account_operation_receipts; v_result jsonb; is_owner boolean; item jsonb; ministries text[]; homes text[]; topics text[];
begin
  perform church_auth.assert_account_owner();
  if p_user is null or p_request_id is null or p_church is null or p_church not in ('M+','SHiNE') or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'invalid_input'; end if;
  v_hash:=md5(jsonb_build_object('user',p_user,'church',p_church,'input',p_input,'version',p_expected_version)::text);
  select * into v_receipt from church_auth.account_operation_receipts where actor_user_id=auth.uid() and request_id=p_request_id;
  if found then
    if v_receipt.payload_hash<>v_hash then raise exception 'request_reused'; end if;
    return v_receipt.result;
  end if;
  root:=church_auth.canonical_account(p_user);
  before_data:=church_auth.account_snapshot(root);
  if jsonb_array_length(before_data->'accounts')=0 then raise exception 'account_not_found'; end if;
  if p_expected_version is null or p_expected_version<>md5(before_data::text) then raise exception 'account_changed'; end if;
  select exists(select 1 from church_auth.owners where user_id in (select church_auth.account_users(root))) into is_owner;
  if jsonb_typeof(p_input->'active') is distinct from 'boolean' or jsonb_typeof(p_input->'grants') is distinct from 'array' or jsonb_typeof(p_input->'roles') is distinct from 'array'
    or jsonb_typeof(p_input->'features') is distinct from 'array' or jsonb_typeof(p_input->'home_modules') is distinct from 'array'
    or jsonb_typeof(p_input->'notification_topics') is distinct from 'array' or jsonb_typeof(p_input->'ministries') is distinct from 'array' then raise exception 'invalid_input'; end if;
  if length(trim(coalesce(p_input->>'display_name',''))) not between 1 and 60 or length(trim(coalesce(p_input->>'job_title',''))) not between 1 and 60 then raise exception 'invalid_profile'; end if;
  if jsonb_array_length(p_input->'grants')>24 or jsonb_array_length(p_input->'roles')>1 or jsonb_array_length(p_input->'features')>20 then raise exception 'invalid_access'; end if;
  for item in select value from jsonb_array_elements(p_input->'grants') loop
    if (item->>'church_id') is distinct from p_church or item->>'permission' is null then raise exception 'invalid_grant'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_input->'roles') loop
    if (item->>'church_id') is distinct from p_church or item->>'role_key' is null then raise exception 'invalid_role'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_input->'features') loop
    if item->>'feature_key' is null or (not is_owner and not exists(select 1 from jsonb_array_elements(p_input->'grants') g where g->>'permission'=item->>'feature_key')) then raise exception 'feature_without_grant'; end if;
    if exists(select 1 from unnest(array['view','create','edit','delete','export','approve','manage']) k where jsonb_typeof(item->k) is distinct from 'boolean') then raise exception 'invalid_feature_action'; end if;
  end loop;
  if not is_owner and (p_input->>'active')::boolean and jsonb_array_length(p_input->'grants')=0 then raise exception 'active_without_grants'; end if;
  select coalesce(array_agg(value),'{}') into homes from jsonb_array_elements_text(p_input->'home_modules');
  select coalesce(array_agg(value),'{}') into topics from jsonb_array_elements_text(p_input->'notification_topics');
  select coalesce(array_agg(value),'{}') into ministries from jsonb_array_elements_text(p_input->'ministries');
  if exists(select 1 from unnest(ministries) m where m not in ('media','worship','welcome','children','all')) or ('all'=any(ministries) and cardinality(ministries)>1) then raise exception 'invalid_scope'; end if;
  if not is_owner and cardinality(ministries)>0 and not exists(select 1 from jsonb_array_elements(p_input->'grants') g where g->>'permission'='schedules') then raise exception 'scope_without_grant'; end if;
  if is_owner and ((p_input->>'active')::boolean is not true or jsonb_array_length(p_input->'grants')<>0 or jsonb_array_length(p_input->'roles')<>0 or cardinality(ministries)>0) then raise exception 'owner_immutable'; end if;
  for u in select church_auth.account_users(root) loop
    -- One RPC is one PostgreSQL transaction: any subsequent exception rolls all of this back.
    perform church_auth.single_set_admin_account_profile(u,p_input->>'display_name',p_input->>'job_title');
    if not is_owner then
      perform church_auth.single_set_admin_account_access_v3(u,(p_input->>'active')::boolean,p_input->'grants',p_input->'roles');
      delete from church_auth.account_feature_permissions where user_id=u and church_id<>p_church;
      delete from church_auth.service_ministry_scopes where user_id=u;
    end if;
    perform church_auth.single_set_admin_feature_permissions(u,p_church,p_input->'features');
    perform church_auth.single_set_admin_home_preferences(u,p_church,homes,topics);
    if not is_owner and (p_input->>'active')::boolean then perform church_auth.single_set_service_signup_scopes(u,p_church,ministries); end if;
  end loop;
  after_data:=church_auth.account_snapshot(root);
  v_result:=jsonb_build_object('saved',true,'version',md5(after_data::text),'canonical_user_id',root);
  insert into church_auth.account_change_audit(actor_user_id,canonical_user_id,action,before_state,after_state) values(auth.uid(),root,'save',before_data,after_data);
  insert into church_auth.account_operation_receipts(actor_user_id,request_id,payload_hash,result) values(auth.uid(),p_request_id,v_hash,v_result);
  return v_result;
end $$;
create function public.save_admin_account_bundle(p_user uuid,p_church text,p_input jsonb,p_expected_version text,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select church_auth.save_admin_account_bundle(p_user,p_church,p_input,p_expected_version,p_request_id) $$;

create function church_auth.remove_admin_account(p_user uuid) returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare root uuid; before_data jsonb;
begin
  perform church_auth.assert_account_owner();
  if p_user is null then raise exception 'account_not_found'; end if;
  root:=church_auth.canonical_account(p_user);
  if auth.uid() in (select church_auth.account_users(root)) or exists(select 1 from church_auth.owners where user_id in (select church_auth.account_users(root))) then raise exception 'owner_immutable'; end if;
  before_data:=church_auth.account_snapshot(root);
  -- Repeated revoke is safe; preserve Auth users, verified links and member registrations.
  delete from church_auth.account_feature_permissions where user_id in (select church_auth.account_users(root));
  delete from church_auth.account_home_preferences where user_id in (select church_auth.account_users(root));
  delete from church_auth.service_ministry_scopes where user_id in (select church_auth.account_users(root));
  delete from church_auth.service_signup_final_reviewers where user_id in (select church_auth.account_users(root));
  delete from church_auth.accounts where user_id in (select church_auth.account_users(root));
  if jsonb_array_length(before_data->'accounts')>0 then insert into church_auth.account_change_audit(actor_user_id,canonical_user_id,action,before_state,after_state) values(auth.uid(),root,'revoke',before_data,church_auth.account_snapshot(root)); end if;
  return true;
end $$;
create or replace function public.remove_admin_account(p_user uuid) returns boolean language sql security invoker set search_path='' as $$ select church_auth.remove_admin_account(p_user) $$;

CREATE OR REPLACE FUNCTION church_auth.single_approve_line_admin_access_review(p_user uuid, p_source_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from church_auth.owners where user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_user=p_source_user or not exists(select 1 from auth.identities where user_id=p_user and provider='custom:line-web') then raise exception 'invalid_target'; end if;
  if not exists(select 1 from church_auth.accounts where user_id=p_source_user and is_active) then raise exception 'invalid_source'; end if;
  insert into church_auth.accounts(user_id,is_active,display_name,job_title,updated_at,invitation_state,invited_at,invited_by)
  select p_user,true,display_name,job_title,now(),'active',now(),auth.uid() from church_auth.accounts where user_id=p_source_user
  on conflict(user_id) do update set is_active=true,display_name=excluded.display_name,job_title=excluded.job_title,updated_at=now(),invitation_state='active';
  delete from church_auth.grants where user_id=p_user;
  insert into church_auth.grants select p_user,church_id,permission from church_auth.grants where user_id=p_source_user;
  delete from church_auth.account_roles where user_id=p_user;
  insert into church_auth.account_roles select p_user,church_id,role_key from church_auth.account_roles where user_id=p_source_user;
  delete from church_auth.account_feature_permissions where user_id=p_user;
  insert into church_auth.account_feature_permissions(user_id,church_id,feature_key,can_view,can_create,can_edit,can_delete,can_export,can_approve,can_manage,updated_at)
  select p_user,church_id,feature_key,can_view,can_create,can_edit,can_delete,can_export,can_approve,can_manage,now() from church_auth.account_feature_permissions where user_id=p_source_user;
  delete from church_auth.account_home_preferences where user_id=p_user;
  insert into church_auth.account_home_preferences(user_id,church_id,home_modules,notification_topics,updated_at)
  select p_user,church_id,home_modules,notification_topics,now() from church_auth.account_home_preferences where user_id=p_source_user;
  update public.app_notifications set read_at=coalesce(read_at,now()) where user_id=auth.uid() and event_key='admin_access_review' and source_key='line-admin-access:'||p_user::text;
  return true;
end $function$;

revoke all on function church_auth.single_approve_line_admin_access_review(uuid,uuid) from public,anon,authenticated;
create function church_auth.approve_line_admin_access_review(p_user uuid,p_source_user uuid) returns boolean language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare root uuid; before_data jsonb; linked uuid;
begin
  perform church_auth.assert_account_owner();
  root:=church_auth.canonical_account(p_source_user);
  if p_user is null or root is null or p_user=root then raise exception 'invalid_target'; end if;
  select canonical_user_id into linked from church_auth.account_identity_links where alias_user_id=p_user;
  if linked is not null then if linked<>root then raise exception 'identity_already_linked'; end if; return true; end if;
  if exists(select 1 from church_auth.account_identity_links where canonical_user_id=p_user) or (exists(select 1 from church_auth.owners where user_id=p_user) and not exists(select 1 from church_auth.owners where user_id=root)) then raise exception 'invalid_target'; end if;
  before_data:=jsonb_build_object('source',church_auth.account_snapshot(root),'target',church_auth.account_snapshot(p_user));
  perform church_auth.single_approve_line_admin_access_review(p_user,root);
  insert into church_auth.account_identity_links(alias_user_id,canonical_user_id,approved_by) values(p_user,root,auth.uid()) on conflict(alias_user_id) do nothing;
  delete from church_auth.service_ministry_scopes where user_id=p_user;
  insert into church_auth.service_ministry_scopes(user_id,church_id,ministry_key) select p_user,church_id,ministry_key from church_auth.service_ministry_scopes where user_id=root;
  if exists(select 1 from church_auth.owners where user_id=root) then insert into church_auth.owners(user_id) values(p_user) on conflict do nothing; end if;
  insert into church_auth.account_change_audit(actor_user_id,canonical_user_id,action,before_state,after_state) values(auth.uid(),root,'link',before_data,church_auth.account_snapshot(root));
  return true;
end $$;
create or replace function public.approve_line_admin_access_review(p_user uuid,p_source_user uuid) returns boolean language sql security invoker set search_path='' as $$ select church_auth.approve_line_admin_access_review(p_user,p_source_user) $$;

CREATE OR REPLACE FUNCTION church_auth.get_line_admin_access_review(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  perform church_auth.assert_account_owner();
  if not exists(select 1 from auth.identities where user_id=p_user and provider='custom:line-web') then raise exception 'line_identity_not_found'; end if;
  select jsonb_build_object(
    'user_id',p_user,
    'line_name',coalesce((select nullif(btrim(identity_data->>'name'),'') from auth.identities where user_id=p_user and provider='custom:line-web' limit 1),'LINE 同工'),
    'approved',exists(select 1 from church_auth.account_identity_links l where l.alias_user_id=p_user),
    'account_name',(select display_name from church_auth.accounts where user_id=p_user),
    'candidates',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,'job_title',a.job_title,'email',u.email) order by a.display_name) from church_auth.accounts a join auth.users u on u.id=a.user_id where a.is_active and a.user_id<>p_user and not exists(select 1 from church_auth.account_identity_links l where l.alias_user_id=a.user_id)),'[]'::jsonb)
  ) into result;
  return result;
end $function$;

create or replace function public.get_line_admin_access_review(p_user uuid) returns jsonb language sql security invoker set search_path='' as $$ select church_auth.get_line_admin_access_review(p_user) $$;

CREATE OR REPLACE FUNCTION church_auth.single_get_review_workflow_settings(p_church text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active) then raise exception 'forbidden'; end if;
  if not (exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or exists(select 1 from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='notification_settings' and p.can_view)) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'can_manage',exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or exists(select 1 from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='notification_settings' and p.can_manage),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',x.user_id,'name',x.display_name,'email',x.email,'has_app',true,'has_line',x.has_line) order by x.display_name,x.email nulls last) from (
      select distinct a.user_id,a.display_name,u.email,exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web' and i.provider_id~'^U[0-9a-f]{32}$') has_line
      from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id and g.church_id=p_church left join auth.users u on u.id=a.user_id where a.is_active
    ) x),'[]'::jsonb),
    'workflows',coalesce((select jsonb_agg(jsonb_build_object('key',w.workflow_key,'label',w.workflow_label,'initial_reviewer_id',w.initial_reviewer_id,'final_reviewer_id',w.final_reviewer_id,'notify_app',w.notify_app,'notify_line',w.notify_line,'updated_at',w.updated_at) order by w.workflow_key) from public.review_workflow_settings w where w.church_id=p_church),'[]'::jsonb)
  );
end $function$;

revoke all on function church_auth.single_get_review_workflow_settings(text) from public,anon,authenticated;
create function church_auth.get_review_workflow_settings(p_church text) returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb; people jsonb; workflows jsonb;
begin
  data:=church_auth.single_get_review_workflow_settings(p_church);
  select coalesce(jsonb_agg(record order by record->>'name'),'[]'::jsonb) into people from (
    select distinct on (church_auth.canonical_account((p->>'id')::uuid))
      p||jsonb_build_object('canonical_id',church_auth.canonical_account((p->>'id')::uuid),'email',coalesce((select nullif(u.email,'') from auth.users u where u.id in (select church_auth.account_users((p->>'id')::uuid)) and nullif(u.email,'') is not null order by u.id limit 1),''),'linked_ids',(select jsonb_agg(u order by u) from church_auth.account_users((p->>'id')::uuid) u)) record
    from jsonb_array_elements(data->'people') p
    order by church_auth.canonical_account((p->>'id')::uuid),(p->>'has_line')::boolean desc,p->>'id'
  ) selected;
  select coalesce(jsonb_agg(w||jsonb_build_object(
    'initial_reviewer_id',coalesce((select p->>'id' from jsonb_array_elements(people) p where p->>'canonical_id'=church_auth.canonical_account((w->>'initial_reviewer_id')::uuid)::text),w->>'initial_reviewer_id'),
    'final_reviewer_id',coalesce((select p->>'id' from jsonb_array_elements(people) p where p->>'canonical_id'=church_auth.canonical_account((w->>'final_reviewer_id')::uuid)::text),w->>'final_reviewer_id'))),'[]'::jsonb) into workflows from jsonb_array_elements(data->'workflows') w;
  return data||jsonb_build_object('people',people,'workflows',workflows);
end $$;
create or replace function public.get_review_workflow_settings(p_church text) returns jsonb language sql security invoker set search_path='' as $$ select church_auth.get_review_workflow_settings(p_church) $$;

CREATE OR REPLACE FUNCTION church_auth.save_review_workflow_setting(p_church text, p_workflow text, p_initial uuid, p_final uuid, p_app boolean, p_line boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_missing text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(57201,1);
  if auth.uid() is null or not exists(select 1 from church_auth.accounts where user_id=auth.uid() and is_active and invitation_state='active') or not (exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or exists(select 1 from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='notification_settings' and p.can_manage)) then raise exception 'forbidden'; end if;
  if p_initial is null or p_final is null or church_auth.canonical_account(p_initial)=church_auth.canonical_account(p_final) or not (p_app or p_line) then raise exception 'invalid_setting'; end if;
  if not exists(select 1 from public.review_workflow_settings w where w.church_id=p_church and w.workflow_key=p_workflow) then raise exception 'invalid_workflow'; end if;
  if exists(select 1 from unnest(array[p_initial,p_final]) x where not exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id and g.church_id=p_church where a.user_id=x and a.is_active)) then raise exception 'invalid_reviewer'; end if;
  if p_line then
    select array_agg(a.display_name order by a.display_name) into v_missing from church_auth.accounts a where a.user_id in (p_initial,p_final) and not exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web' and i.provider_id~'^U[0-9a-f]{32}$');
    if cardinality(coalesce(v_missing,'{}'))>0 then return jsonb_build_object('saved',false,'error','line_id_missing','missing_names',to_jsonb(v_missing)); end if;
  end if;
  update public.review_workflow_settings set initial_reviewer_id=p_initial,final_reviewer_id=p_final,notify_app=p_app,notify_line=p_line,updated_by=auth.uid(),updated_at=now() where church_id=p_church and workflow_key=p_workflow;
  return jsonb_build_object('saved',true);
end $function$;

create or replace function public.save_review_workflow_setting(p_church text,p_workflow text,p_initial uuid,p_final uuid,p_app boolean,p_line boolean) returns jsonb language sql security invoker set search_path='' as $$ select church_auth.save_review_workflow_setting(p_church,p_workflow,p_initial,p_final,p_app,p_line) $$;
revoke all on function public.list_admin_accounts_v4(),church_auth.list_admin_accounts_v4() from public,anon;
grant execute on function public.list_admin_accounts_v4(),church_auth.list_admin_accounts_v4() to authenticated;
revoke all on function public.save_admin_account_bundle(uuid,text,jsonb,text,uuid),church_auth.save_admin_account_bundle(uuid,text,jsonb,text,uuid) from public,anon;
grant execute on function public.save_admin_account_bundle(uuid,text,jsonb,text,uuid),church_auth.save_admin_account_bundle(uuid,text,jsonb,text,uuid) to authenticated;
revoke all on function public.remove_admin_account(uuid),church_auth.remove_admin_account(uuid) from public,anon;
grant execute on function public.remove_admin_account(uuid),church_auth.remove_admin_account(uuid) to authenticated;
revoke all on function public.approve_line_admin_access_review(uuid,uuid),church_auth.approve_line_admin_access_review(uuid,uuid) from public,anon;
grant execute on function public.approve_line_admin_access_review(uuid,uuid),church_auth.approve_line_admin_access_review(uuid,uuid) to authenticated;
revoke all on function public.get_line_admin_access_review(uuid),church_auth.get_line_admin_access_review(uuid) from public,anon;
grant execute on function public.get_line_admin_access_review(uuid),church_auth.get_line_admin_access_review(uuid) to authenticated;
revoke all on function public.get_review_workflow_settings(text),church_auth.get_review_workflow_settings(text) from public,anon;
grant execute on function public.get_review_workflow_settings(text),church_auth.get_review_workflow_settings(text) to authenticated;
revoke all on function public.save_review_workflow_setting(text,text,uuid,uuid,boolean,boolean),church_auth.save_review_workflow_setting(text,text,uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.save_review_workflow_setting(text,text,uuid,uuid,boolean,boolean),church_auth.save_review_workflow_setting(text,text,uuid,uuid,boolean,boolean) to authenticated;
notify pgrst, 'reload schema';
