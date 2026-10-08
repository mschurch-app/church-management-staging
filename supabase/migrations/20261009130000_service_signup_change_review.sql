-- Members may revise before a season starts. In-season changes require ministry
-- leader coordination followed by Yuting's final approval.
create table if not exists public.service_signup_change_requests (
  id bigint generated always as identity primary key,
  church_id text not null check (church_id in ('M+','SHiNE')),
  season_id bigint not null references public.service_signup_seasons(id),
  registration_id bigint not null references public.service_signup_registrations(id),
  member_id bigint not null references public.members(id),
  ministry_key text not null check (ministry_key in ('media','worship','welcome','children')),
  request_type text not null check (request_type in ('cancel','adjust')),
  member_note text not null check (char_length(member_note) between 2 and 600),
  status text not null default 'leader_review' check (status in ('leader_review','admin_review','approved','rejected')),
  leader_reviewer uuid references auth.users(id),
  leader_note text,
  leader_reviewed_at timestamptz,
  admin_reviewer uuid references auth.users(id),
  admin_note text,
  admin_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists service_signup_change_one_open
  on public.service_signup_change_requests(registration_id)
  where status in ('leader_review','admin_review');
create index if not exists service_signup_change_review_queue
  on public.service_signup_change_requests(church_id,status,ministry_key,created_at);
alter table public.service_signup_change_requests enable row level security;
revoke all on public.service_signup_change_requests from public,anon,authenticated;
grant all on public.service_signup_change_requests to service_role;

create table if not exists church_auth.service_signup_final_reviewers (
  church_id text not null check (church_id in ('M+','SHiNE')),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(church_id,user_id)
);
alter table church_auth.service_signup_final_reviewers enable row level security;
revoke all on church_auth.service_signup_final_reviewers from public,anon,authenticated;
grant all on church_auth.service_signup_final_reviewers to service_role;

insert into church_auth.service_signup_final_reviewers(church_id,user_id)
select 'M+',a.user_id from church_auth.accounts a
join church_auth.grants g on g.user_id=a.user_id and g.church_id='M+'
where a.is_active and a.display_name='邵鈺庭'
on conflict do nothing;

create or replace function public.service_signup_submit_change_request(
  p_church text,p_channel text,p_subject text,p_registration bigint,p_request_type text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;v_row record;v_request bigint;v_leader uuid;
begin
  if p_request_type not in ('cancel','adjust') or char_length(btrim(coalesce(p_note,''))) not between 2 and 600 then raise exception 'invalid_request'; end if;
  select b.member_id into v_member from church_auth.member_bindings b where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required'; end if;
  select r.*,s.starts_on,sl.ministry_key,m.name member_name into v_row
  from public.service_signup_registrations r join public.service_signup_seasons s on s.id=r.season_id
  join public.service_signup_slots sl on sl.id=r.slot_id join public.members m on m.id=r.member_id
  where r.id=p_registration and r.church_id=p_church and r.member_id=v_member and r.status in ('registered','waitlisted','offered','confirmed') for update of r;
  if not found then raise exception 'registration_unavailable'; end if;
  if current_date<v_row.starts_on then raise exception 'direct_change_allowed'; end if;
  insert into public.service_signup_change_requests(church_id,season_id,registration_id,member_id,ministry_key,request_type,member_note)
  values(p_church,v_row.season_id,v_row.id,v_member,v_row.ministry_key,p_request_type,btrim(p_note)) returning id into v_request;
  for v_leader in select distinct s.user_id from church_auth.service_ministry_scopes s join church_auth.accounts a on a.user_id=s.user_id and a.is_active where s.church_id=p_church and s.ministry_key in ('all',v_row.ministry_key)
  loop
    insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key,push_sent_at)
    values(v_leader,p_church,'service_signup_change_leader','服事調整申請待初審',v_row.member_name||'提出'||case when p_request_type='cancel' then '取消' else '調整' end||'服事申請。','/service-signup-admin.html?church=M%2B','service-change-leader:'||v_request,null)
    on conflict do nothing;
  end loop;
  return jsonb_build_object('request_id',v_request,'status','leader_review');
end $$;

create or replace function public.service_signup_cancel_or_request(
  p_church text,p_channel text,p_subject text,p_registration bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;v_row record;v_next jsonb;
begin
  select b.member_id into v_member from church_auth.member_bindings b where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required'; end if;
  select r.*,s.starts_on into v_row from public.service_signup_registrations r join public.service_signup_seasons s on s.id=r.season_id
  where r.id=p_registration and r.church_id=p_church and r.member_id=v_member and r.status in ('registered','waitlisted','offered','confirmed') for update of r;
  if not found then raise exception 'registration_unavailable'; end if;
  if current_date>=v_row.starts_on then
    return public.service_signup_submit_change_request(p_church,p_channel,p_subject,p_registration,'cancel','申請取消此筆服事');
  end if;
  update public.service_signup_registrations set status='cancelled',queue_number=null,offered_queue_number=null,offer_expires_at=null,cancelled_at=now(),updated_at=now() where id=v_row.id;
  if v_row.status in ('registered','confirmed','offered') then v_next:=public.service_signup_offer_next(v_row.slot_id); end if;
  return jsonb_build_object('cancelled',true,'direct',true,'next_offer',v_next);
end $$;

create or replace function public.service_signup_review_change_request(
  p_church text,p_request bigint,p_decision text,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row record;v_is_final boolean;v_is_leader boolean;v_reviewer uuid;v_next jsonb;
begin
  v_reviewer:=auth.uid();if v_reviewer is null or p_decision not in ('approve','reject') then raise exception 'forbidden'; end if;
  select q.*,m.name member_name,r.line_subject,r.slot_id,r.status registration_status into v_row
  from public.service_signup_change_requests q join public.members m on m.id=q.member_id join public.service_signup_registrations r on r.id=q.registration_id
  where q.id=p_request and q.church_id=p_church for update of q;
  if not found then raise exception 'request_unavailable'; end if;
  v_is_final:=exists(select 1 from church_auth.service_signup_final_reviewers f where f.church_id=p_church and f.user_id=v_reviewer);
  v_is_leader:=exists(select 1 from church_auth.owners o where o.user_id=v_reviewer) or exists(select 1 from church_auth.service_ministry_scopes s where s.user_id=v_reviewer and s.church_id=p_church and s.ministry_key in ('all',v_row.ministry_key));
  if v_row.status='leader_review' then
    if not v_is_leader then raise exception 'forbidden'; end if;
    update public.service_signup_change_requests set status=case when p_decision='approve' then 'admin_review' else 'rejected' end,leader_reviewer=v_reviewer,leader_note=nullif(btrim(coalesce(p_note,'')),''),leader_reviewed_at=now(),updated_at=now() where id=p_request;
    if p_decision='approve' then
      insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key,push_sent_at)
      select f.user_id,p_church,'service_signup_change_admin','服事調整申請待複審',v_row.member_name||'的申請已通過領袖初審。','/service-signup-admin.html?church=M%2B','service-change-admin:'||p_request,null
      from church_auth.service_signup_final_reviewers f where f.church_id=p_church on conflict do nothing;
    end if;
    return jsonb_build_object('status',case when p_decision='approve' then 'admin_review' else 'rejected' end,'line_subject',v_row.line_subject,'member_name',v_row.member_name);
  end if;
  if v_row.status<>'admin_review' or not v_is_final then raise exception 'forbidden'; end if;
  if p_decision='approve' and v_row.request_type='cancel' and v_row.registration_status in ('registered','waitlisted','offered','confirmed') then
    update public.service_signup_registrations set status='cancelled',queue_number=null,offered_queue_number=null,offer_expires_at=null,cancelled_at=now(),updated_at=now() where id=v_row.registration_id;
    if v_row.registration_status in ('registered','confirmed','offered') then v_next:=public.service_signup_offer_next(v_row.slot_id); end if;
  end if;
  update public.service_signup_change_requests set status=case when p_decision='approve' then 'approved' else 'rejected' end,admin_reviewer=v_reviewer,admin_note=nullif(btrim(coalesce(p_note,'')),''),admin_reviewed_at=now(),updated_at=now() where id=p_request;
  return jsonb_build_object('status',case when p_decision='approve' then 'approved' else 'rejected' end,'line_subject',v_row.line_subject,'member_name',v_row.member_name,'request_type',v_row.request_type,'next_offer',v_next);
end $$;

create or replace function public.service_signup_my_change_requests(
  p_church text,p_channel text,p_subject text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;
begin
  select b.member_id into v_member from church_auth.member_bindings b where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'registration_id',q.registration_id,'request_type',q.request_type,'member_note',q.member_note,'status',q.status,'leader_note',q.leader_note,'admin_note',q.admin_note,'created_at',q.created_at) order by q.created_at desc) from public.service_signup_change_requests q where q.church_id=p_church and q.member_id=v_member),'[]'::jsonb);
end $$;

create or replace function public.get_service_signup_change_requests(p_church text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_scopes text[];v_manage boolean;v_final boolean;
begin
  if auth.uid() is null or not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active) then raise exception 'forbidden'; end if;
  v_manage:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid());
  v_final:=exists(select 1 from church_auth.service_signup_final_reviewers f where f.church_id=p_church and f.user_id=auth.uid());
  select coalesce(array_agg(s.ministry_key),'{}') into v_scopes from church_auth.service_ministry_scopes s where s.user_id=auth.uid() and s.church_id=p_church;
  if not v_manage and not v_final and cardinality(v_scopes)=0 then raise exception 'forbidden'; end if;
  return jsonb_build_object('is_final_reviewer',v_final,'requests',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'registration_id',q.registration_id,'season_id',q.season_id,'member_name',m.name,'service_date',r.service_date,
    'ministry_key',q.ministry_key,'role_key',sl.role_key,'request_type',q.request_type,'member_note',q.member_note,'status',q.status,
    'leader_note',q.leader_note,'created_at',q.created_at
  ) order by q.created_at) from public.service_signup_change_requests q join public.members m on m.id=q.member_id
  join public.service_signup_registrations r on r.id=q.registration_id join public.service_signup_slots sl on sl.id=r.slot_id
  where q.church_id=p_church and q.status in ('leader_review','admin_review') and (
    (q.status='admin_review' and (v_final or v_manage)) or
    (q.status='leader_review' and (v_manage or 'all'=any(v_scopes) or q.ministry_key=any(v_scopes)))
  )),'[]'::jsonb));
end $$;

revoke all on function public.service_signup_submit_change_request(text,text,text,bigint,text,text),public.service_signup_cancel_or_request(text,text,text,bigint),public.service_signup_my_change_requests(text,text,text) from public,anon,authenticated;
grant execute on function public.service_signup_submit_change_request(text,text,text,bigint,text,text),public.service_signup_cancel_or_request(text,text,text,bigint),public.service_signup_my_change_requests(text,text,text) to service_role;
revoke all on function public.service_signup_review_change_request(text,bigint,text,text),public.get_service_signup_change_requests(text) from public,anon;
grant execute on function public.service_signup_review_change_request(text,bigint,text,text),public.get_service_signup_change_requests(text) to authenticated,service_role;
