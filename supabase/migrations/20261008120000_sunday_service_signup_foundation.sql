-- Sunday service signup is deliberately separate from service_schedules.
-- Only confirmed assignments are copied to the existing published schedule later.
create table if not exists public.service_signup_seasons (
  id bigint generated always as identity primary key,
  church_id text not null check (church_id in ('M+','SHiNE')),
  title text not null check (char_length(title) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft','open','closed','archived')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on <= ends_on),
  unique (church_id, starts_on, ends_on)
);

create table if not exists public.service_signup_slots (
  id bigint generated always as identity primary key,
  season_id bigint not null references public.service_signup_seasons(id) on delete cascade,
  church_id text not null check (church_id in ('M+','SHiNE')),
  service_date date not null,
  ministry_key text not null check (ministry_key in ('media','worship','welcome','children')),
  role_key text not null check (role_key in (
    'sound','projection_director','lighting',
    'worship_leader','assistant_worship_leader','keyboard_1','keyboard_2','drums','guitar','bass','singer_1','singer_2','singer_3',
    'welcome_1','welcome_2','children_teacher','children_assistant'
  )),
  capacity smallint not null default 1 check (capacity between 1 and 20),
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, service_date, role_key),
  check (extract(isodow from service_date) = 7)
);

create table if not exists public.service_signup_registrations (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.service_signup_slots(id) on delete cascade,
  season_id bigint not null references public.service_signup_seasons(id) on delete cascade,
  church_id text not null check (church_id in ('M+','SHiNE')),
  service_date date not null,
  member_id bigint not null references public.members(id),
  line_subject text not null check (line_subject ~ '^U[0-9a-f]{32}$'),
  status text not null check (status in ('registered','waitlisted','confirmed','cancelled','declined')),
  queue_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (slot_id, member_id),
  check ((status = 'waitlisted') = (queue_number is not null))
);

create unique index if not exists service_signup_one_role_per_sunday
  on public.service_signup_registrations(church_id, member_id, service_date)
  where status in ('registered','waitlisted','confirmed');
create index if not exists service_signup_slots_date_idx
  on public.service_signup_slots(church_id, service_date, ministry_key, role_key);
create index if not exists service_signup_waitlist_idx
  on public.service_signup_registrations(slot_id, queue_number)
  where status = 'waitlisted';

alter table public.service_signup_seasons enable row level security;
alter table public.service_signup_slots enable row level security;
alter table public.service_signup_registrations enable row level security;
revoke all on public.service_signup_seasons, public.service_signup_slots, public.service_signup_registrations from public, anon, authenticated;
grant all on public.service_signup_seasons, public.service_signup_slots, public.service_signup_registrations to service_role;

create or replace function public.service_signup_member_view(
  p_church text, p_channel text, p_subject text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member bigint;
  v_result jsonb;
begin
  if p_church not in ('M+','SHiNE') or p_channel !~ '^[0-9]+$' or p_subject !~ '^U[0-9a-f]{32}$' then
    raise exception 'invalid_identity' using errcode = '22023';
  end if;
  select b.member_id into v_member
  from church_auth.member_bindings b
  join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
  where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active
  limit 1;
  if v_member is null then
    return jsonb_build_object('binding_status','required','seasons','[]'::jsonb,'registrations','[]'::jsonb);
  end if;
  select jsonb_build_object(
    'binding_status','approved',
    'member',jsonb_build_object('id',m.id,'name',m.name,'group_name',m.group_name),
    'seasons',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'title',s.title,'starts_on',s.starts_on,'ends_on',s.ends_on,
      'slots',coalesce((select jsonb_agg(jsonb_build_object(
        'id',sl.id,'service_date',sl.service_date,'ministry_key',sl.ministry_key,'role_key',sl.role_key,
        'capacity',sl.capacity,'registered_count',(select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed')),
        'waitlist_count',(select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status='waitlisted')
      ) order by sl.service_date,sl.ministry_key,sl.role_key) from public.service_signup_slots sl where sl.season_id=s.id and sl.is_open),'[]'::jsonb)
    ) order by s.starts_on) from public.service_signup_seasons s
      where s.church_id=p_church and s.status='open'
        and (s.opens_at is null or s.opens_at<=now()) and (s.closes_at is null or s.closes_at>now())),'[]'::jsonb),
    'registrations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'slot_id',r.slot_id,'service_date',r.service_date,'status',r.status,'queue_number',r.queue_number
    ) order by r.service_date) from public.service_signup_registrations r
      where r.church_id=p_church and r.member_id=v_member and r.status in ('registered','waitlisted','confirmed')),'[]'::jsonb)
  ) into v_result from public.members m where m.id=v_member;
  return v_result;
end $$;

create or replace function public.service_signup_register(
  p_church text, p_channel text, p_subject text, p_slot bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member bigint;
  v_slot public.service_signup_slots%rowtype;
  v_taken integer;
  v_queue integer;
  v_status text;
  v_registration bigint;
begin
  if p_church not in ('M+','SHiNE') or p_channel !~ '^[0-9]+$' or p_subject !~ '^U[0-9a-f]{32}$' then
    raise exception 'invalid_identity' using errcode = '22023';
  end if;
  select b.member_id into v_member from church_auth.member_bindings b
  join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
  where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||p_slot::text,0));
  select sl.* into v_slot from public.service_signup_slots sl
  join public.service_signup_seasons s on s.id=sl.season_id
  where sl.id=p_slot and sl.church_id=p_church and sl.is_open and s.status='open'
    and (s.opens_at is null or s.opens_at<=now()) and (s.closes_at is null or s.closes_at>now())
  for update;
  if not found then raise exception 'slot_unavailable' using errcode='22023'; end if;
  if exists(select 1 from public.service_signup_registrations r where r.church_id=p_church and r.member_id=v_member and r.service_date=v_slot.service_date and r.status in ('registered','waitlisted','confirmed')) then
    raise exception 'one_service_per_sunday' using errcode='23505';
  end if;
  select count(*) into v_taken from public.service_signup_registrations r where r.slot_id=p_slot and r.status in ('registered','confirmed');
  if v_taken < v_slot.capacity then
    v_status := 'registered'; v_queue := null;
  else
    v_status := 'waitlisted';
    select coalesce(max(r.queue_number),0)+1 into v_queue from public.service_signup_registrations r where r.slot_id=p_slot;
  end if;
  insert into public.service_signup_registrations(slot_id,season_id,church_id,service_date,member_id,line_subject,status,queue_number)
  values(p_slot,v_slot.season_id,p_church,v_slot.service_date,v_member,p_subject,v_status,v_queue)
  on conflict(slot_id,member_id) do update set status=excluded.status,queue_number=excluded.queue_number,cancelled_at=null,updated_at=now()
  returning id into v_registration;
  return jsonb_build_object('id',v_registration,'status',v_status,'queue_number',v_queue);
end $$;

create or replace function public.service_signup_cancel(
  p_church text, p_channel text, p_subject text, p_registration bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_member bigint;
  v_row public.service_signup_registrations%rowtype;
  v_promoted public.service_signup_registrations%rowtype;
begin
  select b.member_id into v_member from church_auth.member_bindings b
  where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501'; end if;
  select * into v_row from public.service_signup_registrations
  where id=p_registration and church_id=p_church and member_id=v_member and status in ('registered','waitlisted','confirmed') for update;
  if not found then raise exception 'registration_unavailable' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||v_row.slot_id::text,0));
  update public.service_signup_registrations set status='cancelled',queue_number=null,cancelled_at=now(),updated_at=now() where id=v_row.id;
  if v_row.status in ('registered','confirmed') then
    select * into v_promoted from public.service_signup_registrations
    where slot_id=v_row.slot_id and status='waitlisted' order by queue_number,created_at for update skip locked limit 1;
    if found then
      update public.service_signup_registrations set status='registered',queue_number=null,updated_at=now() where id=v_promoted.id;
    end if;
  end if;
  return jsonb_build_object('cancelled',true,'promoted_line_subject',case when found then v_promoted.line_subject else null end,'promoted_registration_id',case when found then v_promoted.id else null end);
end $$;

revoke all on function public.service_signup_member_view(text,text,text), public.service_signup_register(text,text,text,bigint), public.service_signup_cancel(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.service_signup_member_view(text,text,text), public.service_signup_register(text,text,text,bigint), public.service_signup_cancel(text,text,text,bigint) to service_role;
