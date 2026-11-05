-- Independent album permission; retain existing active staff's album access.
-- Existing account-owner checks and save bundle audit/version checks stay intact.
do $migration$
declare source text; signature text; definition text;
begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='church_auth.grants'::regclass and conname='grants_permission_check';
 if position('church_albums' in definition)=0 then
  execute 'alter table church_auth.grants drop constraint grants_permission_check';
  execute 'alter table church_auth.grants add constraint grants_permission_check '||replace(definition,'''heat_camp''::text','''heat_camp''::text, ''church_albums''::text');
 end if;
 foreach signature in array array['church_auth.single_set_admin_account_access_v3(uuid,boolean,jsonb,jsonb)','church_auth.single_set_admin_feature_permissions(uuid,text,jsonb)'] loop
  source:=pg_get_functiondef(signature::regprocedure);
  if position('church_albums' in source)=0 then
   if position('''heat_camp''' in source)=0 then raise exception 'permission allowlist changed';end if;
   execute replace(source,'''heat_camp''','''heat_camp'',''church_albums''');
  end if;
 end loop;
end $migration$;

-- No newly created staff get implicit rights. Preserve existing staff permissions
-- when moving the album out of the shared work module; owner can adjust each box.
with eligible as (
 select distinct u.user_id from public.pastoral_staff s
 join public.pastoral_staff_access sa on sa.staff_id=s.id and sa.entity_key='mplus'
 cross join lateral church_auth.account_users(s.app_user_id) u(user_id)
 join church_auth.accounts a on a.user_id=u.user_id and a.is_active
 where s.is_active and s.app_user_id is not null
)
insert into church_auth.grants(user_id,church_id,permission)
select user_id,'M+','church_albums' from eligible on conflict do nothing;
insert into church_auth.account_feature_permissions(user_id,church_id,feature_key,can_view,can_create,can_edit,can_delete,can_export,can_approve,can_manage)
select user_id,'M+','church_albums',true,true,true,false,false,false,false from church_auth.grants where church_id='M+' and permission='church_albums'
on conflict(user_id,church_id,feature_key) do nothing;

-- Private implementation + service-only invoker entry point. Browser callers
-- cannot choose another staff member to read or bypass their permissions.
create or replace function church_auth.album_staff_permissions(p_staff uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'canView',coalesce(bool_or(g.permission is not null and f.can_view),false),
 'canCreateFolder',coalesce(bool_or(g.permission is not null and f.can_view and f.can_create),false),
 'canUpload',coalesce(bool_or(g.permission is not null and f.can_view and f.can_edit),false))
 from public.pastoral_staff s
 join public.pastoral_staff_access sa on sa.staff_id=s.id and sa.entity_key='mplus'
 join church_auth.accounts a on a.user_id=church_auth.canonical_account(s.app_user_id) and a.is_active
 left join church_auth.grants g on g.user_id=a.user_id and g.church_id='M+' and g.permission='church_albums'
 left join church_auth.account_feature_permissions f on f.user_id=a.user_id and f.church_id='M+' and f.feature_key='church_albums'
 where s.id=p_staff and s.is_active;
$$;
revoke all on function church_auth.album_staff_permissions(uuid) from public,anon,authenticated;
grant execute on function church_auth.album_staff_permissions(uuid) to service_role;
create or replace function public.church_album_staff_permissions(p_staff uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select church_auth.album_staff_permissions(p_staff);
$$;
revoke all on function public.church_album_staff_permissions(uuid) from public,anon,authenticated;
grant execute on function public.church_album_staff_permissions(uuid) to service_role;
