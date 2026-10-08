create or replace function public.get_line_admin_access_review(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
end $$;

create or replace function public.approve_line_admin_access_review(p_user uuid,p_source_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
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
end $$;

revoke all on function public.get_line_admin_access_review(uuid) from public,anon;
grant execute on function public.get_line_admin_access_review(uuid) to authenticated,service_role;
revoke all on function public.approve_line_admin_access_review(uuid,uuid) from public,anon;
grant execute on function public.approve_line_admin_access_review(uuid,uuid) to authenticated,service_role;
