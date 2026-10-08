create table if not exists public.review_workflow_settings (
  church_id text not null check (church_id in ('M+','SHiNE')),
  workflow_key text not null check (workflow_key in ('sermon_social','daily_devotional','service_change_media','service_change_worship','service_change_welcome','service_change_children')),
  workflow_label text not null,
  initial_reviewer_id uuid references auth.users(id) on delete restrict,
  final_reviewer_id uuid references auth.users(id) on delete restrict,
  notify_app boolean not null default true,
  notify_line boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(church_id,workflow_key),
  check (initial_reviewer_id is null or final_reviewer_id is null or initial_reviewer_id<>final_reviewer_id)
);
alter table public.review_workflow_settings enable row level security;
revoke all on public.review_workflow_settings from public,anon,authenticated;
grant all on public.review_workflow_settings to service_role;
create index if not exists review_workflow_initial_idx on public.review_workflow_settings(initial_reviewer_id);
create index if not exists review_workflow_final_idx on public.review_workflow_settings(final_reviewer_id);

insert into public.review_workflow_settings(church_id,workflow_key,workflow_label)
values ('M+','sermon_social','講道 IG 內容'),('M+','daily_devotional','每日靈修'),('M+','service_change_media','服事調整｜影音'),('M+','service_change_worship','服事調整｜敬拜團'),('M+','service_change_welcome','服事調整｜接待'),('M+','service_change_children','服事調整｜兒童主日學')
on conflict do nothing;

update public.review_workflow_settings w set
  final_reviewer_id=(select f.user_id from church_auth.service_signup_final_reviewers f join auth.identities i on i.user_id=f.user_id and i.provider='custom:line-web' where f.church_id='M+' limit 1)
where w.church_id='M+' and w.workflow_key like 'service_change_%' and w.final_reviewer_id is null;

create or replace function public.get_review_workflow_settings(p_church text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
end $$;

create or replace function public.save_review_workflow_setting(p_church text,p_workflow text,p_initial uuid,p_final uuid,p_app boolean,p_line boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
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
end $$;

revoke all on function public.get_review_workflow_settings(text),public.save_review_workflow_setting(text,text,uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.get_review_workflow_settings(text),public.save_review_workflow_setting(text,text,uuid,uuid,boolean,boolean) to authenticated,service_role;
