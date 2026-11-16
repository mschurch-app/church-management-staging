-- Association-only content access; no change to the mother-only Facebook review gate.
alter table church_auth.grants drop constraint if exists grants_permission_check;
alter table church_auth.grants add constraint grants_permission_check check(permission in ('portal','attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp','church_albums','association_content'));
-- Extend only the existing owner-only permission whitelists; retain all checks and ACLs.
do $$ declare signature text; definition text; begin
 foreach signature in array array['church_auth.single_set_admin_account_access_v3(uuid,boolean,jsonb,jsonb)','church_auth.single_set_admin_feature_permissions(uuid,text,jsonb)'] loop
  if to_regprocedure(signature) is not null then
   definition:=pg_get_functiondef(to_regprocedure(signature));
   if position('association_content' in definition)=0 then
    if position('''church_albums''' in definition)=0 then raise exception 'permission_whitelist_changed'; end if;
    execute replace(definition,'''church_albums''','''church_albums'',''association_content''');
   end if;
  end if;
 end loop;
end $$;
create or replace function public.association_story_access(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 with actor as (select church_auth.canonical_account(p_actor) as id)
 select jsonb_build_object('actor_id',(select id from actor),
 'reviewer',exists(select 1 from public.association_story_settings s join church_auth.accounts a on a.user_id=s.reviewer_id where s.id and s.reviewer_id=(select id from actor) and a.is_active),
 'writer',exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
 where a.user_id=(select id from actor) and a.is_active and g.church_id='M+' and g.permission in ('website_group_resources','association_content')
 and not exists(select 1 from church_auth.account_feature_permissions f where f.user_id=(select id from actor) and f.church_id='M+' and f.feature_key=g.permission and (not f.can_view or (not f.can_create and not f.can_edit)))),
 'reader',exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id where a.user_id=(select id from actor) and a.is_active and g.church_id='M+' and g.permission in ('website_group_resources','association_content') and not exists(select 1 from church_auth.account_feature_permissions f where f.user_id=(select id from actor) and f.church_id='M+' and f.feature_key=g.permission and not f.can_view)),
 'reviewer_ready',exists(select 1 from public.association_story_settings s join church_auth.accounts a on a.user_id=s.reviewer_id where s.id and a.is_active)
 );
$$;

-- Evaluate current account actions for the new dedicated grant, including verified aliases.
create function church_auth.association_content_allowed(p_action text) returns boolean language sql stable security definer set search_path='' as $$
 with actor as (select church_auth.canonical_account(auth.uid()) id)
 select auth.uid() is not null and exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
 left join church_auth.account_feature_permissions f on f.user_id=a.user_id and f.church_id='M+' and f.feature_key='association_content'
 where a.user_id=(select id from actor) and a.is_active and g.church_id='M+' and g.permission='association_content' and coalesce(f.can_view,true)
 and case p_action when 'view' then true when 'create' then coalesce(f.can_create,true) when 'edit' then coalesce(f.can_edit,true) else false end);
$$;
revoke all on function church_auth.association_content_allowed(text) from public,anon;
grant execute on function church_auth.association_content_allowed(text) to authenticated,service_role;
-- Dedicated association grant does not grant access to church group materials or pastoral messages.
create policy association_content_read on public.association_news for select to authenticated using ((select church_auth.association_content_allowed('view')));
create policy association_content_insert on public.association_news for insert to authenticated with check ((select church_auth.association_content_allowed('create')) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy association_content_update on public.association_news for update to authenticated using ((select church_auth.association_content_allowed('edit'))) with check ((select church_auth.association_content_allowed('edit')) and updated_by=(select auth.uid()));
create policy association_content_image_upload on storage.objects for insert to authenticated with check (bucket_id='church-website-public-media' and (storage.foldername(name))[1]='association-news' and (select church_auth.association_content_allowed('create')));
