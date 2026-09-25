-- Shared newcomer care workflow; the existing public.members row stays canonical.
create table if not exists public.pastoral_newcomer_care_settings (
  entity_key text primary key check (entity_key in ('mplus','shine')),
  shared_assignee_ids uuid[] not null default '{}',
  first_contact_hours smallint not null default 48 check (first_contact_hours between 1 and 168),
  reminder_24h_enabled boolean not null default true,
  overdue_48h_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.pastoral_newcomer_care_cases (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus','shine')),
  member_id bigint not null references public.members(id) on delete cascade,
  registration_request_id uuid not null unique,
  first_visit_at timestamptz not null default now(),
  invited_by text not null default '',
  gathering text not null default '',
  stage text not null default 'new' check (stage in ('new','first_contacted','return_visit','group_connection','stable','decision','baptism','family')),
  status text not null default 'open' check (status in ('open','completed','transferred','closed')),
  assigned_staff_ids uuid[] not null default '{}',
  shared_task_id uuid references public.pastoral_tasks(id) on delete set null,
  first_contact_due_at timestamptz not null,
  first_contacted_at timestamptz,
  completed_at timestamptz,
  next_step text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_key,member_id)
);
create index if not exists pastoral_newcomer_care_due_idx
  on public.pastoral_newcomer_care_cases (entity_key,status,first_contact_due_at)
  where status='open';

create table if not exists public.pastoral_newcomer_care_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.pastoral_newcomer_care_cases(id) on delete cascade,
  member_id bigint not null references public.members(id) on delete cascade,
  event_type text not null check (event_type in ('case_created','first_contact','follow_up','stage_changed','transferred','closed','reminder_sent')),
  contact_method text check (contact_method is null or contact_method in ('line','phone','meeting','other')),
  summary text not null default '',
  next_step text not null default '',
  created_by uuid references public.pastoral_staff(id) on delete set null,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists pastoral_newcomer_care_history_case_idx
  on public.pastoral_newcomer_care_history (case_id,created_at desc);

alter table public.pastoral_newcomer_care_settings enable row level security;
alter table public.pastoral_newcomer_care_cases enable row level security;
alter table public.pastoral_newcomer_care_history enable row level security;
revoke all on public.pastoral_newcomer_care_settings,public.pastoral_newcomer_care_cases,
  public.pastoral_newcomer_care_history from public,anon,authenticated;
grant all on public.pastoral_newcomer_care_settings,public.pastoral_newcomer_care_cases,
  public.pastoral_newcomer_care_history to service_role;

alter table public.pastoral_notification_deliveries
  drop constraint if exists pastoral_notification_deliveries_notification_type_check;
alter table public.pastoral_notification_deliveries
  add constraint pastoral_notification_deliveries_notification_type_check check (
    notification_type in ('calendar_participant','task_assigned','task_accepted',
      'newcomer_care_created','newcomer_care_completed','newcomer_care_reminder_24h','newcomer_care_overdue_48h')
  );

-- Seed the shared case owners for M+ only when both approved coworkers are active.
insert into public.pastoral_newcomer_care_settings(entity_key,shared_assignee_ids)
select 'mplus',array_agg(id order by case display_name when '吳俊璋牧師' then 0 else 1 end)
from public.pastoral_staff
where is_active and display_name in ('吳俊璋牧師','謝碧鳳師母')
having count(*)=2
on conflict (entity_key) do nothing;

do $$
begin
  if not exists(select 1 from public.pastoral_newcomer_care_settings where entity_key='mplus'
    and cardinality(shared_assignee_ids)=2) then
    raise exception 'M+ newcomer care owners are not configured';
  end if;
end $$;

alter table church_auth.newcomer_receipts
  add column if not exists member_id bigint references public.members(id) on delete set null;

create or replace function public.register_staging_newcomer(p_id uuid,p_church text,p_payload jsonb)
returns text
language plpgsql
set search_path = ''
as $function$
declare
  fingerprint text;
  prior church_auth.newcomer_receipts%rowtype;
  new_member_id bigint;
  new_case_id uuid;
  new_task_id uuid;
  owner_ids uuid[];
  primary_owner uuid;
  shared_owner uuid;
  due_at timestamptz;
  contact_hours integer;
  member_row public.members%rowtype;
begin
  if p_id is null or p_church is null or p_church not in ('M+','SHiNE') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','phone','district','memo','birthday','gender','age_group','know_us_from','desired_feelings','interest_tags','photo_url')) then raise exception 'invalid_fields'; end if;
  if coalesce(length(btrim(p_payload->>'name')),0) not between 1 and 80 then raise exception 'invalid_name'; end if;
  if p_payload ? 'photo_url' and split_part(p_payload->>'photo_url','/',1) is distinct from p_church then raise exception 'invalid_photo'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('newcomer-global',0));
  fingerprint=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_payload::text,'UTF8')),'hex');
  select * into prior from church_auth.newcomer_receipts where request_id=p_id;
  if found then
    if prior.church_id=p_church and prior.payload_hash=fingerprint then return 'accepted'; end if;
    return 'conflict';
  end if;
  if (select count(*) from church_auth.newcomer_receipts where created_at>now()-interval '1 minute')>=20
    or (select count(*) from church_auth.newcomer_receipts where church_id=p_church and created_at>now()-interval '1 hour')>=100 then return 'limited'; end if;

  insert into public.members(church_id,name,phone,district,memo,birthday,gender,age_group,know_us_from,desired_feelings,interest_tags,faith_status,welcome_status,group_name,photo_url)
  values(p_church,p_payload->>'name',p_payload->>'phone',p_payload->>'district',p_payload->>'memo',p_payload->>'birthday',p_payload->>'gender',p_payload->>'age_group',p_payload->>'know_us_from',
    array(select jsonb_array_elements_text(p_payload->'desired_feelings')),array(select jsonb_array_elements_text(p_payload->'interest_tags')),'新朋友（初次聚會）','新朋友','未編組',p_payload->>'photo_url')
  returning id into new_member_id;
  insert into church_auth.newcomer_receipts(request_id,church_id,payload_hash,member_id)
  values(p_id,p_church,fingerprint,new_member_id);

  if p_church='M+' then
    select shared_assignee_ids,first_contact_hours into owner_ids,contact_hours from public.pastoral_newcomer_care_settings where entity_key='mplus';
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
    select * into member_row from public.members where id=new_member_id;
    due_at=now()+make_interval(hours=>coalesce(contact_hours,48));

    insert into public.pastoral_tasks(entity_key,title,description,task_type,status,payload,assigned_to,created_by,idempotency_key,due_at)
    values('mplus','新朋友關懷：'||member_row.name,
      '新朋友剛完成登記，請牧師或師母其中一位在期限內完成第一次聯絡。請回報聯絡方式、關懷摘要和下一步；此為共同任務，完成一次即可。',
      'care','approved',jsonb_build_object('workflow','newcomer_care','shared_assignee_ids',owner_ids),
      shared_owner,primary_owner,p_id,due_at)
    returning id into new_task_id;

    insert into public.pastoral_newcomer_care_cases(entity_key,member_id,registration_request_id,first_visit_at,invited_by,gathering,assigned_staff_ids,first_contact_due_at,shared_task_id)
    values('mplus',new_member_id,p_id,member_row.created_at,
      coalesce(nullif(btrim(split_part(split_part(member_row.know_us_from,'(',2),')',1)),''),''),
      '首次來訪聚會',owner_ids,due_at,new_task_id)
    returning id into new_case_id;

    update public.pastoral_tasks set payload=payload||jsonb_build_object('newcomer_care_case_id',new_case_id) where id=new_task_id;
    insert into public.pastoral_newcomer_care_history(case_id,member_id,event_type,summary,idempotency_key)
    values(new_case_id,new_member_id,'case_created','新朋友資料已建立，第一次關懷期限為 '||due_at::text||'.',
      'case-created:'||new_case_id::text);
  end if;
  return 'accepted';
end
$function$;

revoke all on function public.register_staging_newcomer(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_staging_newcomer(uuid,text,jsonb) to service_role;

create or replace function public.sync_pastoral_newcomer_care_completion()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  care_case public.pastoral_newcomer_care_cases%rowtype;
  method text;
begin
  if old.status is distinct from 'completed' and new.status='completed'
    and new.payload->>'workflow'='newcomer_care' then
    select * into care_case from public.pastoral_newcomer_care_cases
      where shared_task_id=new.id for update;
    if found and care_case.status='open' then
      method=case when new.payload->>'contact_method' in ('line','phone','meeting','other')
        then new.payload->>'contact_method' else null end;
      update public.pastoral_newcomer_care_cases set stage='first_contacted',
        first_contacted_at=coalesce(new.completed_at,now()),next_step=coalesce(new.payload->>'next_step',''),updated_at=now()
        where id=care_case.id;
      insert into public.pastoral_newcomer_care_history(case_id,member_id,event_type,contact_method,summary,next_step,created_by,idempotency_key)
      values(care_case.id,care_case.member_id,'first_contact',method,
        coalesce(new.payload->>'completion_report',''),coalesce(new.payload->>'next_step',''),
        nullif(new.payload->>'completed_by_staff_id','')::uuid,'first-contact:'||care_case.id::text);
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists pastoral_newcomer_care_task_completed on public.pastoral_tasks;
create trigger pastoral_newcomer_care_task_completed
  after update of status,payload on public.pastoral_tasks
  for each row execute function public.sync_pastoral_newcomer_care_completion();

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='pastoral-care-project-url') then
    perform vault.create_secret('https://aqanuwilmvdtlzuqlrau.supabase.co','pastoral-care-project-url','M+ newcomer care reminder endpoint');
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='pastoral-care-cron-secret') then
    perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'pastoral-care-cron-secret','M+ newcomer care reminder authorization');
  end if;
end $$;

create or replace function public.pastoral_validate_care_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret,'') <> '' and p_secret=(
    select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret'
  );
$$;
revoke all on function public.pastoral_validate_care_cron_secret(text) from public,anon,authenticated;
grant execute on function public.pastoral_validate_care_cron_secret(text) to service_role;

do $$
declare job_id bigint;
begin
  select jobid into job_id from cron.job where jobname='pastoral-newcomer-care-reminders-hourly';
  if job_id is not null then perform cron.unschedule(job_id); end if;
  perform cron.schedule('pastoral-newcomer-care-reminders-hourly','0 * * * *',$cron$
    select net.http_post(
      url:=(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-project-url')||'/functions/v1/pastoral-care-reminders',
      headers:=jsonb_build_object('content-type','application/json','x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret')),
      body:='{}'::jsonb
    );
  $cron$);
end $$;
