-- Reuse the existing request store. Applicant data never grants authorization.
create table if not exists church_auth.mplus_staff_applications (
 user_id uuid primary key references auth.users(id), full_name text not null,
 birth_date date, mobile text not null default '', status text not null default 'pending',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 assigned_role text, assigned_permissions text[], review_note text,
 constraint mplus_staff_applications_full_name_check check(length(full_name) between 1 and 60),
 constraint mplus_staff_applications_status_check check(status in ('pending','approved','rejected'))
);
alter table church_auth.mplus_staff_applications alter column birth_date drop not null;
alter table church_auth.mplus_staff_applications add column if not exists church_id text not null default 'M+' check(church_id in ('M+','SHiNE'));
alter table church_auth.mplus_staff_applications add column if not exists ministry text not null default '' check(length(ministry)<=120);
alter table church_auth.mplus_staff_applications add column if not exists applicant_note text not null default '' check(length(applicant_note)<=500);
alter table church_auth.mplus_staff_applications drop constraint if exists mplus_staff_applications_mobile_check;
alter table church_auth.mplus_staff_applications add constraint mplus_staff_applications_mobile_check check(mobile='' or mobile ~ '^[+]?[0-9]{8,15}$');
alter table church_auth.mplus_staff_applications enable row level security;
revoke all on church_auth.mplus_staff_applications from public,anon,authenticated;
create index if not exists coworker_applications_pending_idx on church_auth.mplus_staff_applications(created_at) where status='pending';
create index if not exists coworker_applications_reviewer_idx on church_auth.mplus_staff_applications(reviewed_by) where reviewed_by is not null;
create table if not exists church_auth.coworker_application_audit (
 id bigint generated always as identity primary key,
 applicant_user_id uuid not null references auth.users(id), actor_user_id uuid not null references auth.users(id),
 action text not null check(action in ('submit','resubmit','approve','link','reject')),
 before_state jsonb, after_state jsonb not null, created_at timestamptz not null default now()
);
alter table church_auth.coworker_application_audit enable row level security;
revoke all on church_auth.coworker_application_audit from public,anon,authenticated;
create index if not exists coworker_application_audit_applicant_idx on church_auth.coworker_application_audit(applicant_user_id,created_at desc);
create index if not exists coworker_application_audit_actor_idx on church_auth.coworker_application_audit(actor_user_id);

create or replace function church_auth.get_my_coworker_application() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); root uuid;
begin
 if u is null or not exists(select 1 from auth.identities where user_id=u and provider='custom:line-web') then raise exception 'line_required'; end if;
 root:=church_auth.canonical_account(u);
 if exists(select 1 from church_auth.accounts where user_id=root and is_active and invitation_state='active') and
   (exists(select 1 from church_auth.grants where user_id=root) or exists(select 1 from church_auth.owners where user_id=root)) then
   return jsonb_build_object('status','already_authorized');
 end if;
 if exists(select 1 from church_auth.mplus_staff_applications where user_id=u and status='approved') then return jsonb_build_object('status','account_unavailable'); end if;
 -- Birth dates from the older form are retained privately, not returned to this flow.
 return (select to_jsonb(a)-'birth_date'-'reviewed_by'-'assigned_permissions' from church_auth.mplus_staff_applications a where a.user_id=u);
end $$;

create or replace function church_auth.submit_coworker_application(p_full_name text,p_church text,p_ministry text,p_mobile text,p_note text,p_expected_version timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid(); old_row church_auth.mplus_staff_applications; next_row church_auth.mplus_staff_applications; phone text:=regexp_replace(coalesce(p_mobile,''),'[[:space:]()-]','','g');
begin
 if u is null or not exists(select 1 from auth.identities where user_id=u and provider='custom:line-web') then raise exception 'line_required'; end if;
 if length(trim(coalesce(p_full_name,''))) not between 1 and 60 or p_church is null or p_church not in ('M+','SHiNE') or
   length(trim(coalesce(p_ministry,''))) not between 1 and 120 or length(coalesce(p_note,''))>500 or (phone<>'' and phone !~ '^[+]?[0-9]{8,15}$') then raise exception 'invalid_profile'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mplus-application:'||u::text,0));
 if church_auth.get_my_coworker_application()->>'status'='already_authorized' then return jsonb_build_object('status','already_authorized'); end if;
 select * into old_row from church_auth.mplus_staff_applications where user_id=u for update;
 if found then
  if old_row.status='approved' then raise exception 'account_unavailable'; end if;
  -- Exact retries are idempotent even when the client did not receive its first receipt.
  if old_row.status='pending' and old_row.full_name=trim(p_full_name) and old_row.church_id=p_church and old_row.ministry=trim(p_ministry) and old_row.mobile=phone and old_row.applicant_note=trim(coalesce(p_note,'')) then return church_auth.get_my_coworker_application(); end if;
  if p_expected_version is distinct from old_row.updated_at then raise exception 'application_changed'; end if;
 elsif p_expected_version is not null then raise exception 'application_changed';
 end if;
 insert into church_auth.mplus_staff_applications(user_id,full_name,mobile,church_id,ministry,applicant_note)
 values(u,trim(p_full_name),phone,p_church,trim(p_ministry),trim(coalesce(p_note,'')))
 on conflict(user_id) do update set full_name=excluded.full_name,mobile=excluded.mobile,church_id=excluded.church_id,ministry=excluded.ministry,applicant_note=excluded.applicant_note,status='pending',updated_at=clock_timestamp(),reviewed_by=null,reviewed_at=null,review_note=null,assigned_role=null,assigned_permissions=null
 returning * into next_row;
 insert into church_auth.coworker_application_audit(applicant_user_id,actor_user_id,action,before_state,after_state)
 values(u,u,case when old_row.user_id is null then 'submit' else 'resubmit' end,to_jsonb(old_row),to_jsonb(next_row));
 -- One in-app review item per application. No LINE message is sent here.
 insert into public.app_notifications(user_id,church_id,event_key,source_key,title,body,target_url)
 select o.user_id,p_church,'mplus_staff_application','mplus-staff-application:'||u::text,'同工申請待審核',trim(p_full_name)||' 已送出 LINE 同工申請。','/admin-accounts.html?church='||case p_church when 'M+' then 'M%2B' else 'SHiNE' end||'&applications=1'
 from church_auth.owners o join church_auth.accounts a on a.user_id=o.user_id and a.is_active and a.invitation_state='active'
 on conflict(user_id,event_key,source_key) where source_key is not null do update set church_id=excluded.church_id,body=excluded.body,target_url=excluded.target_url,read_at=null;
 return church_auth.get_my_coworker_application();
end $$;

create or replace function church_auth.list_coworker_applications() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform church_auth.assert_account_owner();
 return coalesce((select jsonb_agg((to_jsonb(a)-'birth_date')||jsonb_build_object('line_name',(select coalesce(i.identity_data->>'name',i.identity_data->>'display_name','') from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web' limit 1)) order by a.created_at) from church_auth.mplus_staff_applications a where a.status='pending'),'[]'::jsonb);
end $$;

create or replace function church_auth.review_coworker_application(p_user uuid,p_expected_version timestamptz,p_decision text,p_input jsonb default null,p_source_user uuid default null,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare r church_auth.mplus_staff_applications; next_row church_auth.mplus_staff_applications; root uuid; result jsonb; input_version text;
begin
 perform church_auth.assert_account_owner();
 if p_user is null or p_decision is null or p_decision not in ('approve','link','reject') or length(coalesce(p_note,''))>500 then raise exception 'invalid_decision'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mplus-application:'||p_user::text,0));
 select * into r from church_auth.mplus_staff_applications where user_id=p_user for update;
 if not found then raise exception 'application_not_found'; end if;
 if r.status<>'pending' then raise exception 'application_changed'; end if;
 if p_expected_version is distinct from r.updated_at then raise exception 'application_changed'; end if;
 if not exists(select 1 from auth.identities where user_id=p_user and provider='custom:line-web') then raise exception 'line_required'; end if;
 root:=church_auth.canonical_account(p_user);
 if p_decision='approve' then
  if root<>p_user or exists(select 1 from church_auth.grants where user_id=root) or exists(select 1 from church_auth.owners where user_id=root) then raise exception 'existing_account'; end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or p_input->'active' is distinct from 'true'::jsonb or jsonb_array_length(coalesce(p_input->'grants','[]'))=0 then raise exception 'invalid_decision'; end if;
  insert into church_auth.accounts(user_id,is_active,display_name,job_title,invitation_state) values(p_user,false,r.full_name,'同工','active') on conflict(user_id) do nothing;
  input_version:=md5(church_auth.account_snapshot(p_user)::text);
  -- Existing bundle validation, permission limits, audit and rollback apply unchanged.
  result:=church_auth.save_admin_account_bundle(p_user,r.church_id,p_input,input_version,gen_random_uuid());
 elsif p_decision='link' then
  root:=church_auth.canonical_account(p_source_user);
  if p_source_user is null or root=p_user or not exists(select 1 from church_auth.accounts where user_id=root and is_active and invitation_state='active') or
    not (exists(select 1 from church_auth.grants where user_id=root and church_id=r.church_id) or exists(select 1 from church_auth.owners where user_id=root)) then raise exception 'invalid_decision'; end if;
  perform church_auth.approve_line_admin_access_review(p_user,root);
 elsif length(trim(coalesce(p_note,'')))=0 then raise exception 'invalid_decision';
 end if;
 update church_auth.mplus_staff_applications set status=case p_decision when 'reject' then 'rejected' else 'approved' end,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),updated_at=clock_timestamp(),review_note=trim(coalesce(p_note,'')),assigned_role=case when p_decision='approve' then p_input->'roles'->0->>'role_key' else null end,assigned_permissions=case when p_decision='approve' then array(select g->>'permission' from jsonb_array_elements(p_input->'grants') g) else null end where user_id=p_user returning * into next_row;
 insert into church_auth.coworker_application_audit(applicant_user_id,actor_user_id,action,before_state,after_state) values(p_user,auth.uid(),p_decision,to_jsonb(r),to_jsonb(next_row));
 update public.app_notifications set read_at=clock_timestamp() where event_key='mplus_staff_application' and source_key='mplus-staff-application:'||p_user::text;
 return jsonb_build_object('status',next_row.status,'canonical_user_id',case when p_decision='link' then root else p_user end);
end $$;

-- Public entrypoints use invoker rights; private implementations check verified identity/owner.
create or replace function public.get_my_coworker_application() returns jsonb language sql security invoker set search_path='' as $$ select church_auth.get_my_coworker_application() $$;
create or replace function public.submit_coworker_application(p_full_name text,p_church text,p_ministry text,p_mobile text,p_note text,p_expected_version timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$ select church_auth.submit_coworker_application(p_full_name,p_church,p_ministry,p_mobile,p_note,p_expected_version) $$;
create or replace function public.list_coworker_applications() returns jsonb language sql security invoker set search_path='' as $$ select church_auth.list_coworker_applications() $$;
create or replace function public.review_coworker_application(p_user uuid,p_expected_version timestamptz,p_decision text,p_input jsonb default null,p_source_user uuid default null,p_note text default '') returns jsonb language sql security invoker set search_path='' as $$ select church_auth.review_coworker_application(p_user,p_expected_version,p_decision,p_input,p_source_user,p_note) $$;
revoke all on function public.get_my_coworker_application(),public.submit_coworker_application(text,text,text,text,text,timestamptz),public.list_coworker_applications(),public.review_coworker_application(uuid,timestamptz,text,jsonb,uuid,text),church_auth.get_my_coworker_application(),church_auth.submit_coworker_application(text,text,text,text,text,timestamptz),church_auth.list_coworker_applications(),church_auth.review_coworker_application(uuid,timestamptz,text,jsonb,uuid,text) from public,anon;
grant execute on function public.get_my_coworker_application(),public.submit_coworker_application(text,text,text,text,text,timestamptz),public.list_coworker_applications(),public.review_coworker_application(uuid,timestamptz,text,jsonb,uuid,text),church_auth.get_my_coworker_application(),church_auth.submit_coworker_application(text,text,text,text,text,timestamptz),church_auth.list_coworker_applications(),church_auth.review_coworker_application(uuid,timestamptz,text,jsonb,uuid,text) to authenticated;

-- Retain the older M+ form contract, route all decisions through the same checks.
create or replace function church_auth.get_my_mplus_staff_application_legacy() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.identities where user_id=auth.uid() and provider='custom:line-web') then raise exception 'line_required'; end if;
 return (select to_jsonb(a) from church_auth.mplus_staff_applications a where a.user_id=auth.uid());
end $$;
create or replace function public.get_my_mplus_staff_application() returns jsonb language sql security invoker set search_path='' as $$ select church_auth.get_my_mplus_staff_application_legacy() $$;
create or replace function public.list_mplus_staff_applications() returns jsonb language sql security invoker set search_path='' as $$ select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(church_auth.list_coworker_applications()) x where x->>'church_id'='M+' $$;
create or replace function church_auth.submit_mplus_staff_application_legacy(p_full_name text,p_birth_date date,p_mobile text) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row jsonb; result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from auth.identities where user_id=auth.uid() and provider='custom:line-web') then raise exception 'line_required'; end if;
 if p_birth_date is null or p_birth_date<date '1900-01-01' or p_birth_date>(now() at time zone 'Asia/Taipei')::date or length(trim(coalesce(p_mobile,'')))=0 then raise exception 'invalid_profile'; end if;
 current_row:=church_auth.get_my_coworker_application();
 result:=church_auth.submit_coworker_application(p_full_name,'M+',coalesce(nullif(current_row->>'ministry',''),'待管理員確認'),p_mobile,coalesce(current_row->>'applicant_note',''),(current_row->>'updated_at')::timestamptz);
 if result->>'status'='pending' then update church_auth.mplus_staff_applications set birth_date=p_birth_date where user_id=auth.uid(); end if;
 return result;
end $$;
create or replace function public.submit_mplus_staff_application(p_full_name text,p_birth_date date,p_mobile text) returns jsonb language sql security invoker set search_path='' as $$ select church_auth.submit_mplus_staff_application_legacy(p_full_name,p_birth_date,p_mobile) $$;
create or replace function public.review_mplus_staff_application(p_user uuid,p_approve boolean,p_role text,p_permissions text[],p_note text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_row jsonb; bundle jsonb;
begin
 select x into current_row from jsonb_array_elements(church_auth.list_coworker_applications()) x where x->>'user_id'=p_user::text and x->>'church_id'='M+';
 if current_row is null then raise exception 'application_not_found'; end if;
 if p_approve is null then raise exception 'invalid_decision'; end if;
 if p_approve then
  bundle:=jsonb_build_object('display_name',current_row->>'full_name','job_title','同工','active',true,'roles',jsonb_build_array(jsonb_build_object('church_id','M+','role_key',p_role)),
   'grants',coalesce((select jsonb_agg(jsonb_build_object('church_id','M+','permission',p)) from unnest(p_permissions) p),'[]'::jsonb),
   'features',coalesce((select jsonb_agg(jsonb_build_object('feature_key',p,'view',true,'create',false,'edit',false,'delete',false,'export',false,'approve',false,'manage',false)) from unnest(p_permissions) p),'[]'::jsonb),
   'home_modules','[]'::jsonb,'notification_topics','[]'::jsonb,'ministries','[]'::jsonb);
 end if;
 return church_auth.review_coworker_application(p_user,(current_row->>'updated_at')::timestamptz,case when p_approve then 'approve' else 'reject' end,bundle,null,p_note);
end $$;
revoke all on function public.get_my_mplus_staff_application(),public.submit_mplus_staff_application(text,date,text),public.list_mplus_staff_applications(),public.review_mplus_staff_application(uuid,boolean,text,text[],text) from public,anon;
grant execute on function public.get_my_mplus_staff_application(),public.submit_mplus_staff_application(text,date,text),public.list_mplus_staff_applications(),public.review_mplus_staff_application(uuid,boolean,text,text[],text) to authenticated;
notify pgrst,'reload schema';

revoke all on function church_auth.get_my_mplus_staff_application_legacy(),church_auth.submit_mplus_staff_application_legacy(text,date,text) from public,anon;
grant execute on function church_auth.get_my_mplus_staff_application_legacy(),church_auth.submit_mplus_staff_application_legacy(text,date,text) to authenticated;
