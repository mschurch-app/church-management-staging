CREATE OR REPLACE FUNCTION public.save_review_workflow_setting(p_church text, p_workflow text, p_initial uuid, p_final uuid, p_app boolean, p_line boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_missing text[];
begin
  if auth.uid() is null or not (exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or exists(select 1 from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='notification_settings' and p.can_manage)) then raise exception 'forbidden'; end if;
  if p_initial is null or p_final is null or p_initial=p_final or not (p_app or p_line) then raise exception 'invalid_setting'; end if;
  if not exists(select 1 from public.review_workflow_settings w where w.church_id=p_church and w.workflow_key=p_workflow) then raise exception 'invalid_workflow'; end if;
  if exists(select 1 from unnest(array[p_initial,p_final]) x where not exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id and g.church_id=p_church where a.user_id=x and a.is_active)) then raise exception 'invalid_reviewer'; end if;
  if p_line then
    select array_agg(a.display_name order by a.display_name) into v_missing from church_auth.accounts a where a.user_id in (p_initial,p_final) and not exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web' and i.provider_id~'^U[0-9a-f]{32}$');
    if cardinality(coalesce(v_missing,'{}'))>0 then return jsonb_build_object('saved',false,'error','line_id_missing','missing_names',to_jsonb(v_missing)); end if;
  end if;
  update public.review_workflow_settings set initial_reviewer_id=p_initial,final_reviewer_id=p_final,notify_app=p_app,notify_line=p_line,updated_by=auth.uid(),updated_at=now() where church_id=p_church and workflow_key=p_workflow;
  return jsonb_build_object('saved',true);
end $function$

CREATE OR REPLACE FUNCTION church_auth.role_permissions(target_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case target_role
    when 'pastor' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory']::text[]
    when 'pastor_spouse' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory']::text[]
    when 'administrator' then array['attendance','groups','members','schedules','spaces','newcomer_care','binding_review','notification_settings','inventory']::text[]
    when 'group_leader' then array['attendance','groups','members']::text[]
    when 'care' then array['members','pastoral_chats','private_prayers','newcomer_care']::text[]
    when 'facilities' then array['spaces','inventory']::text[]
    when 'custom' then array[]::text[]
    else null::text[] end;
$function$

