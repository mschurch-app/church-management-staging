CREATE OR REPLACE FUNCTION public.approve_line_admin_access_review(p_user uuid, p_source_user uuid)
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
end $function$

CREATE OR REPLACE FUNCTION public.get_line_admin_access_review(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if not exists(select 1 from church_auth.owners where user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if not exists(select 1 from auth.identities where user_id=p_user and provider='custom:line-web') then raise exception 'line_identity_not_found'; end if;
  select jsonb_build_object(
    'user_id',p_user,
    'line_name',coalesce((select nullif(btrim(identity_data->>'name'),'') from auth.identities where user_id=p_user and provider='custom:line-web' limit 1),'LINE 同工'),
    'approved',exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id where a.user_id=p_user and a.is_active),
    'account_name',(select display_name from church_auth.accounts where user_id=p_user),
    'candidates',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,'job_title',a.job_title,'email',u.email) order by a.display_name) from church_auth.accounts a join auth.users u on u.id=a.user_id where a.is_active and a.user_id<>p_user),'[]'::jsonb)
  ) into result;
  return result;
end $function$

CREATE OR REPLACE FUNCTION public.get_review_workflow_settings(p_church text)
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
end $function$

CREATE OR REPLACE FUNCTION public.list_admin_accounts_v3()
 RETURNS TABLE(user_id uuid, email text, is_active boolean, display_name text, job_title text, grants jsonb, roles jsonb, is_owner boolean, invitation_state text, invited_at timestamp with time zone, home_preferences jsonb, feature_permissions jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  return query select a.user_id,u.email::text,a.is_active,a.display_name,a.job_title,
    coalesce((select jsonb_agg(jsonb_build_object('church_id',g.church_id,'permission',g.permission) order by g.church_id,g.permission) from church_auth.grants g where g.user_id=a.user_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('church_id',r.church_id,'role_key',r.role_key) order by r.church_id) from church_auth.account_roles r where r.user_id=a.user_id),'[]'::jsonb),
    exists(select 1 from church_auth.owners o where o.user_id=a.user_id),a.invitation_state,a.invited_at,
    coalesce((select jsonb_agg(jsonb_build_object('church_id',p.church_id,'home_modules',p.home_modules,'notification_topics',p.notification_topics) order by p.church_id) from church_auth.account_home_preferences p where p.user_id=a.user_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('church_id',p.church_id,'feature_key',p.feature_key,'view',p.can_view,'create',p.can_create,'edit',p.can_edit,'delete',p.can_delete,'export',p.can_export,'approve',p.can_approve,'manage',p.can_manage) order by p.church_id,p.feature_key) from church_auth.account_feature_permissions p where p.user_id=a.user_id),'[]'::jsonb)
  from church_auth.accounts a join auth.users u on u.id=a.user_id order by a.display_name,u.email;
end $function$

CREATE OR REPLACE FUNCTION public.remove_admin_account(p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_user is null or p_user=auth.uid() or exists(select 1 from church_auth.owners o where o.user_id=p_user) then raise exception 'owner_immutable'; end if;
  delete from church_auth.accounts where user_id=p_user;
  if not found then raise exception 'account_not_found'; end if;
  return true;
end $function$

CREATE OR REPLACE FUNCTION public.set_admin_account_access_v3(p_user uuid, p_active boolean, p_grants jsonb, p_roles jsonb)
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
end $function$

CREATE OR REPLACE FUNCTION public.set_admin_account_profile(p_user uuid, p_display_name text, p_job_title text)
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
                                                                                end $function$

CREATE OR REPLACE FUNCTION public.set_admin_feature_permissions(p_user uuid, p_church text, p_permissions jsonb)
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
end $function$

CREATE OR REPLACE FUNCTION public.set_admin_home_preferences(p_user uuid, p_church text, p_home_modules text[], p_notification_topics text[] DEFAULT '{}'::text[])
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
end $function$

CREATE OR REPLACE FUNCTION public.set_service_signup_scopes(p_user uuid, p_church text, p_ministries text[])
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
end $function$

