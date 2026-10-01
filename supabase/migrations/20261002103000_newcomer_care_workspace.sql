alter table public.pastoral_newcomer_care_cases
  add column if not exists next_follow_up_at timestamptz;
alter table public.pastoral_newcomer_care_history
  add column if not exists actor_name text not null default '';

create index if not exists pastoral_newcomer_care_follow_up_idx
  on public.pastoral_newcomer_care_cases(entity_key,status,next_follow_up_at)
  where status='open';

create or replace function public.ensure_newcomer_care_case(p_member_id bigint,p_request_id uuid default gen_random_uuid())
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  member_row public.members%rowtype;
  owner_ids uuid[];
  primary_owner uuid;
  shared_owner uuid;
  contact_hours integer;
  due_at timestamptz;
  task_id uuid;
  case_id uuid;
begin
  select * into member_row from public.members where id=p_member_id and church_id='M+' and archived_at is null;
  if not found then raise exception 'member_not_found'; end if;
  select id into case_id from public.pastoral_newcomer_care_cases where entity_key='mplus' and member_id=p_member_id;
  if case_id is not null then return case_id; end if;
  select shared_assignee_ids,first_contact_hours into owner_ids,contact_hours
    from public.pastoral_newcomer_care_settings where entity_key='mplus';
  select id into primary_owner from public.pastoral_staff where id=owner_ids[1] and is_active;
  select id into shared_owner from public.pastoral_staff where id=owner_ids[2] and is_active;
  if primary_owner is null then
    select s.id into primary_owner from public.pastoral_staff s
    join public.pastoral_staff_access a on a.staff_id=s.id and a.entity_key='mplus'
    where s.is_active and s.role='pastor' order by s.created_at limit 1;
  end if;
  if primary_owner is null then raise exception 'care_owners_unavailable'; end if;
  if shared_owner is null then shared_owner=primary_owner; end if;
  owner_ids=array[primary_owner,shared_owner];
  due_at=coalesce(member_row.created_at,now())+make_interval(hours=>coalesce(contact_hours,48));
  insert into public.pastoral_tasks(entity_key,title,description,task_type,status,payload,assigned_to,created_by,idempotency_key,due_at)
  values('mplus','新朋友關懷：'||member_row.name,
    '請在期限內完成第一次聯絡，並在教會 OS 新朋友關懷頁記錄摘要、下一步與下次關懷日期。',
    'care','approved',jsonb_build_object('workflow','newcomer_care','shared_assignee_ids',owner_ids),
    shared_owner,primary_owner,'newcomer-member:'||p_member_id::text,due_at)
  on conflict(idempotency_key) do update set updated_at=now()
  returning id into task_id;
  insert into public.pastoral_newcomer_care_cases(entity_key,member_id,registration_request_id,first_visit_at,invited_by,gathering,assigned_staff_ids,first_contact_due_at,shared_task_id)
  values('mplus',p_member_id,p_request_id,coalesce(member_row.created_at,now()),
    coalesce(nullif(btrim(split_part(split_part(member_row.know_us_from,'(',2),')',1)),''),''),
    '首次來訪聚會',owner_ids,due_at,task_id)
  on conflict(entity_key,member_id) do update set updated_at=now()
  returning id into case_id;
  update public.pastoral_tasks set payload=payload||jsonb_build_object('newcomer_care_case_id',case_id) where id=task_id;
  insert into public.pastoral_newcomer_care_history(case_id,member_id,event_type,summary,idempotency_key,actor_name)
  values(case_id,p_member_id,'case_created','新朋友已進入持續關懷流程。','case-created:'||case_id::text,'系統')
  on conflict(idempotency_key) do nothing;
  return case_id;
end $$;
revoke all on function public.ensure_newcomer_care_case(bigint,uuid) from public,anon,authenticated;
grant execute on function public.ensure_newcomer_care_case(bigint,uuid) to service_role;

create or replace function public.get_newcomer_care_summary(p_church text)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare entity text; result jsonb;
begin
  if p_church not in ('M+','SHiNE') then raise exception 'invalid_church'; end if;
  if not exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
    where a.user_id=auth.uid() and a.is_active and g.church_id=p_church and g.permission='members') then raise exception 'forbidden'; end if;
  entity=case when p_church='M+' then 'mplus' else 'shine' end;
  select jsonb_build_object(
    'open',count(*) filter(where status='open'),
    'overdue',count(*) filter(where status='open' and coalesce(next_follow_up_at,first_contact_due_at)<now()),
    'due_soon',count(*) filter(where status='open' and coalesce(next_follow_up_at,first_contact_due_at)>=now() and coalesce(next_follow_up_at,first_contact_due_at)<now()+interval '24 hours')
  ) into result from public.pastoral_newcomer_care_cases where entity_key=entity;
  return result;
end $$;

create or replace function public.list_newcomer_care_cases(p_church text)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare entity text; result jsonb;
begin
  if p_church not in ('M+','SHiNE') then raise exception 'invalid_church'; end if;
  if not exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
    where a.user_id=auth.uid() and a.is_active and g.church_id=p_church and g.permission='members') then raise exception 'forbidden'; end if;
  entity=case when p_church='M+' then 'mplus' else 'shine' end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'member_id',c.member_id,'member_name',m.name,'member_phone',m.phone,
    'stage',c.stage,'status',c.status,'first_visit_at',c.first_visit_at,
    'first_contact_due_at',c.first_contact_due_at,'first_contacted_at',c.first_contacted_at,
    'next_step',c.next_step,'next_follow_up_at',c.next_follow_up_at,
    'effective_due_at',coalesce(c.next_follow_up_at,c.first_contact_due_at),
    'is_overdue',c.status='open' and coalesce(c.next_follow_up_at,c.first_contact_due_at)<now(),
    'due_soon',c.status='open' and coalesce(c.next_follow_up_at,c.first_contact_due_at)>=now() and coalesce(c.next_follow_up_at,c.first_contact_due_at)<now()+interval '24 hours',
    'assignee_names',coalesce((select jsonb_agg(s.display_name order by s.display_name) from public.pastoral_staff s where s.id=any(c.assigned_staff_ids)),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('event_type',h.event_type,'contact_method',h.contact_method,'summary',h.summary,'next_step',h.next_step,'actor_name',h.actor_name,'created_at',h.created_at) order by h.created_at desc) from public.pastoral_newcomer_care_history h where h.case_id=c.id),'[]'::jsonb)
  ) order by (c.status='open') desc,coalesce(c.next_follow_up_at,c.first_contact_due_at),c.created_at desc),'[]'::jsonb)
  into result from public.pastoral_newcomer_care_cases c join public.members m on m.id=c.member_id where c.entity_key=entity;
  return result;
end $$;

create or replace function public.update_newcomer_care_case(
  p_church text,p_case_id uuid,p_stage text,p_contact_method text,p_summary text,
  p_next_step text,p_next_follow_up_at timestamptz,p_close boolean default false
)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare entity text; care public.pastoral_newcomer_care_cases%rowtype; actor text; event text;
begin
  if p_church not in ('M+','SHiNE') or p_stage not in ('new','first_contacted','return_visit','group_connection','stable','decision','baptism','family')
    or (p_contact_method is not null and p_contact_method not in ('line','phone','meeting','other'))
    or length(coalesce(p_summary,''))>3000 or length(coalesce(p_next_step,''))>1000 then raise exception 'invalid_input'; end if;
  if p_contact_method is not null and btrim(coalesce(p_summary,''))='' then raise exception 'summary_required'; end if;
  if not exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
    where a.user_id=auth.uid() and a.is_active and g.church_id=p_church and g.permission='members') then raise exception 'forbidden'; end if;
  entity=case when p_church='M+' then 'mplus' else 'shine' end;
  select * into care from public.pastoral_newcomer_care_cases where id=p_case_id and entity_key=entity for update;
  if not found then raise exception 'case_not_found'; end if;
  select coalesce(nullif(btrim(a.display_name),''),'管理同工') into actor from church_auth.accounts a where a.user_id=auth.uid();
  event=case when p_close then 'closed' when p_contact_method is not null and care.first_contacted_at is null then 'first_contact' when p_contact_method is not null then 'follow_up' else 'stage_changed' end;
  update public.pastoral_newcomer_care_cases set stage=p_stage,
    status=case when p_close then 'completed' else 'open' end,
    first_contacted_at=case when p_contact_method is not null then coalesce(first_contacted_at,now()) else first_contacted_at end,
    completed_at=case when p_close then now() else null end,
    next_step=coalesce(btrim(p_next_step),''),next_follow_up_at=case when p_close then null else p_next_follow_up_at end,updated_at=now()
  where id=p_case_id;
  insert into public.pastoral_newcomer_care_history(case_id,member_id,event_type,contact_method,summary,next_step,actor_name)
  values(p_case_id,care.member_id,event,p_contact_method,coalesce(btrim(p_summary),''),coalesce(btrim(p_next_step),''),coalesce(actor,'管理同工'));
  update public.members set welcome_status=case p_stage when 'new' then '新朋友' when 'first_contacted' then '已聯絡' when 'return_visit' then '持續關懷' when 'group_connection' then '加入小組／小家' else '穩定聚會' end where id=care.member_id;
  if p_contact_method is not null and care.shared_task_id is not null then
    update public.pastoral_tasks set status='completed',completed_at=now(),updated_at=now(),payload=payload||jsonb_build_object('completion_report',coalesce(btrim(p_summary),''),'next_step',coalesce(btrim(p_next_step),''),'contact_method',p_contact_method)
    where id=care.shared_task_id and status='approved';
  end if;
  return true;
end $$;

revoke all on function public.get_newcomer_care_summary(text),public.list_newcomer_care_cases(text),public.update_newcomer_care_case(text,uuid,text,text,text,text,timestamptz,boolean) from public,anon;
grant execute on function public.get_newcomer_care_summary(text),public.list_newcomer_care_cases(text),public.update_newcomer_care_case(text,uuid,text,text,text,text,timestamptz,boolean) to authenticated,service_role;

create or replace function public.sync_pastoral_newcomer_care_completion()
returns trigger language plpgsql set search_path=''
as $$
declare care_case public.pastoral_newcomer_care_cases%rowtype; method text;
begin
  if old.status is distinct from 'completed' and new.status='completed' and new.payload->>'workflow'='newcomer_care' then
    select * into care_case from public.pastoral_newcomer_care_cases where shared_task_id=new.id for update;
    if found and care_case.status='open' and care_case.first_contacted_at is null then
      method=case when new.payload->>'contact_method' in ('line','phone','meeting','other') then new.payload->>'contact_method' else null end;
      update public.pastoral_newcomer_care_cases set stage='first_contacted',first_contacted_at=coalesce(new.completed_at,now()),next_step=coalesce(new.payload->>'next_step',''),updated_at=now() where id=care_case.id;
      insert into public.pastoral_newcomer_care_history(case_id,member_id,event_type,contact_method,summary,next_step,created_by,idempotency_key,actor_name)
      values(care_case.id,care_case.member_id,'first_contact',method,coalesce(new.payload->>'completion_report',''),coalesce(new.payload->>'next_step',''),nullif(new.payload->>'completed_by_staff_id','')::uuid,'first-contact:'||care_case.id::text,'同工工作台');
    end if;
  end if;
  return new;
end $$;

select public.ensure_newcomer_care_case(229,gen_random_uuid())
where exists(select 1 from public.members where id=229 and church_id='M+' and faith_status='新朋友（初次聚會）');
