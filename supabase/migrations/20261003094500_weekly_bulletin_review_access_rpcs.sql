create or replace function public.get_weekly_bulletin_review_profile(p_user uuid,p_church text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'editor',a.is_active
      and exists(select 1 from church_auth.grants g where g.user_id=a.user_id and g.church_id=p_church and g.permission='website_weekly')
      and coalesce(fp.can_view,true) and coalesce(fp.can_edit,true),
    'reviewer',a.is_active
      and exists(select 1 from church_auth.grants g where g.user_id=a.user_id and g.church_id=p_church and g.permission='website_weekly')
      and coalesce(fp.can_view,true) and coalesce(fp.can_edit,true) and coalesce(fp.can_approve,true)
      and (a.job_title ~ '(牧師|師母)' or s.role='pastor'
        or exists(select 1 from church_auth.account_roles r where r.user_id=a.user_id and r.church_id=p_church and r.role_key='pastor_spouse')),
    'staff_id',s.id,'name',a.display_name,'job_title',a.job_title
  )
  from church_auth.accounts a
  left join church_auth.account_feature_permissions fp
    on fp.user_id=a.user_id and fp.church_id=p_church and fp.feature_key='website_weekly'
  left join public.pastoral_staff s on s.app_user_id=a.user_id and s.is_active
  where a.user_id=p_user
  limit 1;
$function$;

create or replace function public.get_weekly_bulletin_reviewers(p_church text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'app_user_id',s.app_user_id,'display_name',s.display_name) order by s.display_name),'[]'::jsonb)
  from public.pastoral_staff s
  join church_auth.accounts a on a.user_id=s.app_user_id and a.is_active
  left join church_auth.account_feature_permissions fp
    on fp.user_id=a.user_id and fp.church_id=p_church and fp.feature_key='website_weekly'
  where s.is_active
    and exists(select 1 from public.pastoral_staff_access sa where sa.staff_id=s.id and sa.entity_key=case p_church when 'M+' then 'mplus' when 'SHiNE' then 'shine' else '' end)
    and exists(select 1 from church_auth.grants g where g.user_id=a.user_id and g.church_id=p_church and g.permission='website_weekly')
    and coalesce(fp.can_approve,true)
    and (a.job_title ~ '(牧師|師母)' or s.role='pastor'
      or exists(select 1 from church_auth.account_roles r where r.user_id=a.user_id and r.church_id=p_church and r.role_key='pastor_spouse'));
$function$;

revoke all on function public.get_weekly_bulletin_review_profile(uuid,text) from public,anon,authenticated;
revoke all on function public.get_weekly_bulletin_reviewers(text) from public,anon,authenticated;
grant execute on function public.get_weekly_bulletin_review_profile(uuid,text) to service_role;
grant execute on function public.get_weekly_bulletin_reviewers(text) to service_role;
