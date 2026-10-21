-- Deployed through Supabase migrations; cumulative source for review and new-environment setup. Do not rerun on an initialized database.
create table church_auth.work_profiles(user_id uuid not null references auth.users(id),church_id text not null check(church_id in ('M+','SHiNE')),church_role text not null check(church_role in ('主任牧師','牧師','師母','傳道','輔導','事工領袖','小組長')),assignments jsonb not null default '[]'::jsonb,oversight_domains text[] not null default '{}',version integer not null default 1,source text not null default 'administrator',updated_by uuid,updated_at timestamptz not null default now(),primary key(user_id,church_id));alter table church_auth.work_profiles enable row level security;revoke all on church_auth.work_profiles from public,anon,authenticated;
create table church_auth.work_profile_audit(id uuid primary key default gen_random_uuid(),actor_user_id uuid,subject_user_id uuid not null,church_id text not null,before_state jsonb,after_state jsonb,created_at timestamptz not null default now());alter table church_auth.work_profile_audit enable row level security;revoke all on church_auth.work_profile_audit from public,anon,authenticated;
create or replace function church_auth.save_work_profile(p_user uuid,p_church text,p_profile jsonb) returns void language plpgsql security invoker set search_path='' as $f$
declare root uuid; prior church_auth.work_profiles; item jsonb; catalog jsonb:='{"church":{"administration":"行政","general_affairs":"總務","worship":"敬拜","welcome":"接待關懷","youth_junior":"學生牧區 · 青少","youth":"學生牧區 · 青年","college":"學生牧區 · 大專","children":"兒童主日學","av_sound":"影音 · 音控","av_lighting":"影音 · 燈控","av_subtitles":"影音 · 字幕"},"school":{"director":"主任","teacher":"老師","assistant":"工讀生","volunteer":"志工"},"team":{"manager":"經理"},"camp":{"manager":"營隊管理者","coworker":"營隊同工"}}'::jsonb; scopes text[]; nextrow jsonb;
begin
 perform church_auth.assert_account_owner();root:=church_auth.canonical_account(p_user);
 if p_church not in ('M+','SHiNE') or p_profile is null or jsonb_typeof(p_profile)<>'object' or coalesce(p_profile->>'church_role','') not in ('主任牧師','牧師','師母','傳道','輔導','事工領袖','小組長') or jsonb_typeof(p_profile->'assignments') is distinct from 'array' or jsonb_typeof(p_profile->'oversight_domains') is distinct from 'array' then raise exception 'invalid_work_profile';end if;
 if jsonb_array_length(p_profile->'assignments')>40 or jsonb_array_length(p_profile->'oversight_domains')>4 then raise exception 'invalid_work_profile';end if;
 select * into prior from church_auth.work_profiles where user_id=root and church_id=p_church for update;
 if coalesce((p_profile->>'expected_version')::integer,-1)<>coalesce(prior.version,0) then raise exception 'work_profile_changed';end if;
 for item in select value from jsonb_array_elements(p_profile->'assignments') loop
  if not (catalog ? (item->>'domain')) or not ((catalog->(item->>'domain')) ? (item->>'key')) or coalesce(item->>'type','') not in ('primary','shared') then raise exception 'invalid_work_assignment';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_profile->'assignments') x group by x->>'domain',x->>'key' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_profile->'assignments') x where x->>'type'='primary' group by x->>'domain' having count(*)>1) then raise exception 'duplicate_work_assignment';end if;
 select coalesce(array_agg(distinct value),'{}') into scopes from jsonb_array_elements_text(p_profile->'oversight_domains');
 if exists(select 1 from unnest(scopes) d where d not in ('church','school','team','camp')) then raise exception 'invalid_oversight';end if;
 insert into church_auth.work_profiles(user_id,church_id,church_role,assignments,oversight_domains,version,source,updated_by) values(root,p_church,p_profile->>'church_role',p_profile->'assignments',scopes,coalesce(prior.version,0)+1,'administrator',auth.uid()) on conflict(user_id,church_id) do update set church_role=excluded.church_role,assignments=excluded.assignments,oversight_domains=excluded.oversight_domains,version=excluded.version,source=excluded.source,updated_by=excluded.updated_by,updated_at=now();
 select to_jsonb(p) into nextrow from church_auth.work_profiles p where p.user_id=root and p.church_id=p_church;
 insert into church_auth.work_profile_audit(actor_user_id,subject_user_id,church_id,before_state,after_state) values(auth.uid(),root,p_church,case when prior.user_id is not null then to_jsonb(prior) else null end,nextrow);
end $f$;revoke all on function church_auth.save_work_profile(uuid,text,jsonb) from public,anon,authenticated;
create or replace function public.get_work_profile(p_user uuid default null,p_church text default 'M+') returns jsonb language plpgsql security definer set search_path='' as $f$
declare actor uuid; target uuid; own boolean; row church_auth.work_profiles;
begin
 if auth.uid() is null then raise exception 'forbidden';end if;actor:=church_auth.canonical_account(auth.uid());target:=church_auth.canonical_account(coalesce(p_user,auth.uid()));
 select exists(select 1 from church_auth.owners where user_id in (select church_auth.account_users(actor))) into own;
 if not own and actor<>target then raise exception 'forbidden';end if;
 if p_church not in ('M+','SHiNE') or not exists(select 1 from church_auth.accounts where user_id=actor and is_active) then raise exception 'forbidden';end if;
 if not own and not exists(select 1 from church_auth.grants where user_id in (select church_auth.account_users(actor)) and church_id=p_church) then raise exception 'forbidden';end if;
 select * into row from church_auth.work_profiles where user_id=target and church_id=p_church;
 return jsonb_build_object('profile',case when row.user_id is null then null else to_jsonb(row)-'updated_by' end,'can_edit',own);
end $f$;revoke all on function public.get_work_profile(uuid,text) from public,anon;grant execute on function public.get_work_profile(uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION church_auth.save_admin_account_bundle(p_user uuid, p_church text, p_input jsonb, p_expected_version text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
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
  if p_input ? 'work_profile' and p_input->'work_profile'<>'null'::jsonb then perform church_auth.save_work_profile(root,p_church,p_input->'work_profile');end if;
  after_data:=church_auth.account_snapshot(root);
  v_result:=jsonb_build_object('saved',true,'version',md5(after_data::text),'canonical_user_id',root);
  insert into church_auth.account_change_audit(actor_user_id,canonical_user_id,action,before_state,after_state) values(auth.uid(),root,'save',before_data,after_data);
  insert into church_auth.account_operation_receipts(actor_user_id,request_id,payload_hash,result) values(auth.uid(),p_request_id,v_hash,v_result);
  return v_result;
end $function$
;
with candidates as(select distinct church_auth.canonical_account(a.user_id) user_id from church_auth.accounts a where a.is_active and (exists(select 1 from church_auth.account_roles r where r.user_id=a.user_id and r.church_id='M+') or exists(select 1 from church_auth.owners o where o.user_id=a.user_id)))
insert into church_auth.work_profiles(user_id,church_id,church_role,assignments,source)
select c.user_id,'M+',case when a.job_title='主任牧師' then '主任牧師' when a.job_title like '%師母%' then '師母' when a.job_title like '%牧師%' then '牧師' when a.job_title like '%傳道%' then '傳道' when a.job_title like '%輔導%' then '輔導' when a.job_title like '%小組長%' then '小組長' else '事工領袖' end,
case when a.job_title like '%行政%' then '[{"domain":"church","key":"administration","type":"primary"}]'::jsonb when a.job_title like '%總務%' then '[{"domain":"church","key":"general_affairs","type":"primary"}]'::jsonb when a.job_title like '%課輔主管%' then '[{"domain":"school","key":"director","type":"primary"}]'::jsonb when exists(select 1 from church_auth.service_ministry_scopes m where church_auth.canonical_account(m.user_id)=c.user_id and m.church_id='M+' and m.ministry_key='worship') then '[{"domain":"church","key":"worship","type":"primary"}]'::jsonb else '[]'::jsonb end,
'legacy_import_review'
from candidates c join church_auth.accounts a on a.user_id=c.user_id on conflict do nothing;

alter table church_auth.work_profiles add column reminder_route text not null default 'personal' check(reminder_route in ('group','personal'));update church_auth.work_profiles p set reminder_route=case when a.job_title like '%領袖%' then 'personal' else 'group' end from church_auth.accounts a where a.user_id=p.user_id and p.source='legacy_import_review';
create or replace function church_auth.save_work_profile(p_user uuid,p_church text,p_profile jsonb) returns void language plpgsql security invoker set search_path='' as $f$
declare root uuid; prior church_auth.work_profiles; item jsonb; catalog jsonb:='{"church":{"administration":"行政","general_affairs":"總務","worship":"敬拜","welcome":"接待關懷","youth_junior":"學生牧區 · 青少","youth":"學生牧區 · 青年","college":"學生牧區 · 大專","children":"兒童主日學","av_sound":"影音 · 音控","av_lighting":"影音 · 燈控","av_subtitles":"影音 · 字幕"},"school":{"director":"主任","teacher":"老師","assistant":"工讀生","volunteer":"志工"},"team":{"manager":"經理"},"camp":{"manager":"營隊管理者","coworker":"營隊同工"}}'::jsonb; scopes text[]; nextrow jsonb;
begin
 perform church_auth.assert_account_owner();root:=church_auth.canonical_account(p_user);
 if p_church not in ('M+','SHiNE') or p_profile is null or jsonb_typeof(p_profile)<>'object' or coalesce(p_profile->>'church_role','') not in ('主任牧師','牧師','師母','傳道','輔導','事工領袖','小組長') or jsonb_typeof(p_profile->'assignments') is distinct from 'array' or jsonb_typeof(p_profile->'oversight_domains') is distinct from 'array' then raise exception 'invalid_work_profile';end if;
 if coalesce(p_profile->>'reminder_route','') not in ('group','personal') then raise exception 'invalid_reminder_route';end if;
 if jsonb_array_length(p_profile->'assignments')>40 or jsonb_array_length(p_profile->'oversight_domains')>4 then raise exception 'invalid_work_profile';end if;
 perform pg_advisory_xact_lock(hashtextextended('work-profile:'||root::text||':'||p_church,0));
 select * into prior from church_auth.work_profiles where user_id=root and church_id=p_church for update;
 if coalesce((p_profile->>'expected_version')::integer,-1)<>coalesce(prior.version,0) then raise exception 'work_profile_changed';end if;
 for item in select value from jsonb_array_elements(p_profile->'assignments') loop
  if not coalesce(catalog ? (item->>'domain'),false) or not coalesce((catalog->(item->>'domain')) ? (item->>'key'),false) or coalesce(item->>'type','') not in ('primary','shared') then raise exception 'invalid_work_assignment';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_profile->'assignments') x group by x->>'domain',x->>'key' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_profile->'assignments') x where x->>'type'='primary' group by x->>'domain' having count(*)>1) then raise exception 'duplicate_work_assignment';end if;
 select coalesce(array_agg(distinct value),'{}') into scopes from jsonb_array_elements_text(p_profile->'oversight_domains');
 if exists(select 1 from unnest(scopes) d where d not in ('church','school','team','camp')) then raise exception 'invalid_oversight';end if;
 insert into church_auth.work_profiles(user_id,church_id,church_role,assignments,oversight_domains,version,source,updated_by,reminder_route) values(root,p_church,p_profile->>'church_role',p_profile->'assignments',scopes,coalesce(prior.version,0)+1,'administrator',auth.uid(),p_profile->>'reminder_route') on conflict(user_id,church_id) do update set church_role=excluded.church_role,assignments=excluded.assignments,oversight_domains=excluded.oversight_domains,version=excluded.version,source=excluded.source,reminder_route=excluded.reminder_route,updated_by=excluded.updated_by,updated_at=now();
 select to_jsonb(p) into nextrow from church_auth.work_profiles p where p.user_id=root and p.church_id=p_church;
 insert into church_auth.work_profile_audit(actor_user_id,subject_user_id,church_id,before_state,after_state) values(auth.uid(),root,p_church,case when prior.user_id is not null then to_jsonb(prior) else null end,nextrow);
end $f$;revoke all on function church_auth.save_work_profile(uuid,text,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.daily_work_leader_recipients()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with candidates as(select p.user_id from church_auth.work_profiles p join church_auth.accounts a on a.user_id=p.user_id where p.church_id='M+' and p.reminder_route='personal' and a.is_active),
people as(select c.user_id,a.display_name,a.job_title,u.email,(select jsonb_agg(p.id) from public.pastoral_staff p where p.is_active and church_auth.canonical_account(p.app_user_id)=c.user_id) as staff_ids,(select p.line_subject from public.pastoral_staff p where p.is_active and p.line_subject ~ '^U[0-9a-f]{32}$' and church_auth.canonical_account(p.app_user_id)=c.user_id order by p.updated_at desc limit 1) as line_subject from candidates c join church_auth.accounts a on a.user_id=c.user_id join auth.users u on u.id=c.user_id)
select coalesce(jsonb_agg(to_jsonb(people)),'[]'::jsonb) from people;
$function$
;
revoke all on function public.daily_work_leader_recipients() from public,anon,authenticated;grant execute on function public.daily_work_leader_recipients() to service_role;