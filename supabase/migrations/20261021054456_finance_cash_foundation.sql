begin;

create table public.finance_staff_roles (
  user_id uuid not null references auth.users(id) on delete restrict,
  role_key text not null check (role_key in ('entry','cash_verify','approve')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (user_id,role_key)
);
create unique index finance_one_cash_verifier on public.finance_staff_roles(role_key) where role_key='cash_verify';
create unique index finance_one_cash_approver on public.finance_staff_roles(role_key) where role_key='approve';

create table public.finance_member_codes (
  member_id bigint primary key references public.members(id) on delete restrict,
  offering_code text not null unique check (offering_code ~ '^[0-9]{4}$' and offering_code <> '0000'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.finance_cash_batches (
  id uuid primary key default gen_random_uuid(),
  church_id text not null default 'M+' check (church_id='M+'),
  offering_date date not null,
  status text not null default 'draft' check (status in ('draft','spouse_review','pastor_review','booked','returned')),
  version integer not null default 1 check (version>0),
  counter_1 uuid not null references auth.users(id) on delete restrict,
  counter_2 uuid not null references auth.users(id) on delete restrict,
  counted_cash bigint not null check (counted_cash>0),
  entered_total bigint not null check (entered_total>0),
  spouse_verified_cash bigint check (spouse_verified_cash>=0),
  spouse_verified_by uuid references auth.users(id) on delete restrict,
  pastor_approved_by uuid references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_distinct_counters check(counter_1<>counter_2)
);
create index finance_cash_batches_date_idx on public.finance_cash_batches(offering_date desc,status);

create table public.finance_cash_bags (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.finance_cash_batches(id) on delete cascade,
  bag_no integer not null check (bag_no>0),
  bag_name text not null check (length(btrim(bag_name)) between 1 and 80),
  member_id bigint references public.members(id) on delete restrict,
  offering_code text check (offering_code is null or offering_code ~ '^[0-9]{4}$'),
  bag_phone text check (bag_phone is null or length(bag_phone)<=60),
  bag_address text check (bag_address is null or length(bag_address)<=300),
  anonymous boolean not null default false,
  public_choice text not null default 'public' check (public_choice in ('public','anonymous','unlisted')),
  hide_from_bulletin boolean not null default false,
  receipt_preference text not null default 'annual' check (receipt_preference in ('single','annual','none')),
  declared_total bigint not null check (declared_total>0),
  unique(batch_id,bag_no)
);
create index finance_cash_bags_member_idx on public.finance_cash_bags(member_id) where member_id is not null;

create table public.finance_cash_lines (
  id uuid primary key default gen_random_uuid(),
  bag_id uuid not null references public.finance_cash_bags(id) on delete cascade,
  category text not null check (category in ('十一奉獻','感恩奉獻','宣教奉獻','建堂奉獻','慈惠奉獻','指定奉獻','一般／不具名奉獻')),
  designation text check (designation is null or length(btrim(designation)) between 1 and 120),
  amount bigint not null check (amount>0),
  constraint finance_designation_required check (category<>'指定奉獻' or designation is not null)
);
create index finance_cash_lines_bag_idx on public.finance_cash_lines(bag_id);

create table public.finance_cash_events (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.finance_cash_batches(id) on delete restrict,
  version integer not null,
  action text not null check (action in ('created','saved','submitted','cash_verified','approved','returned')),
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text,
  snapshot jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id,version)
);

alter table public.finance_staff_roles enable row level security;
alter table public.finance_member_codes enable row level security;
alter table public.finance_cash_batches enable row level security;
alter table public.finance_cash_bags enable row level security;
alter table public.finance_cash_lines enable row level security;
alter table public.finance_cash_events enable row level security;
revoke all on public.finance_staff_roles,public.finance_member_codes,public.finance_cash_batches,public.finance_cash_bags,public.finance_cash_lines,public.finance_cash_events from public,anon,authenticated;
revoke all on sequence public.finance_cash_events_id_seq from public,anon,authenticated;
grant select,insert,update,delete on public.finance_staff_roles,public.finance_member_codes,public.finance_cash_batches,public.finance_cash_bags,public.finance_cash_lines,public.finance_cash_events to service_role;
grant usage,select on sequence public.finance_cash_events_id_seq to service_role;

create or replace function public.finance_user_can(p_user uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from church_auth.accounts a
    join church_auth.grants g on g.user_id=a.user_id and g.church_id='M+'
    join public.finance_staff_roles r on r.user_id=a.user_id
    where a.user_id=p_user and a.is_active and r.role_key=p_role
  );
$$;
revoke all on function public.finance_user_can(uuid,text) from public,anon,authenticated;
grant execute on function public.finance_user_can(uuid,text) to service_role;

create or replace function public.finance_assign_role(p_actor uuid,p_target uuid,p_role text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists (select 1 from church_auth.owners o where o.user_id=p_actor) then raise exception 'forbidden'; end if;
  if p_role not in ('entry','cash_verify','approve') or p_enabled is null then raise exception 'invalid_role'; end if;
  if not exists (
    select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
    where a.user_id=p_target and a.is_active and g.church_id='M+'
  ) then raise exception 'target_not_mplus_admin'; end if;
  if p_enabled then
    insert into public.finance_staff_roles(user_id,role_key,assigned_by)
    values(p_target,p_role,p_actor)
    on conflict(user_id,role_key) do nothing;
  else
    delete from public.finance_staff_roles where user_id=p_target and role_key=p_role;
  end if;
  return true;
end $$;
revoke all on function public.finance_assign_role(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.finance_assign_role(uuid,uuid,text,boolean) to service_role;

create or replace function public.finance_assign_member_code(p_actor uuid,p_member bigint,p_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.finance_user_can(p_actor,'entry') then raise exception 'forbidden'; end if;
  if p_code !~ '^[0-9]{4}$' or p_code='0000' then raise exception 'invalid_code'; end if;
  if not exists(select 1 from public.members m where m.id=p_member and m.church_id='M+' and m.archived_at is null) then raise exception 'member_not_found'; end if;
  insert into public.finance_member_codes(member_id,offering_code,created_by) values(p_member,p_code,p_actor);
  return true;
end $$;
revoke all on function public.finance_assign_member_code(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.finance_assign_member_code(uuid,bigint,text) to service_role;

create or replace function public.finance_save_cash_batch(
  p_actor uuid,p_batch_id uuid,p_expected_version integer,p_data jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_batch public.finance_cash_batches%rowtype;
  v_id uuid;
  v_date date;
  v_counter_1 uuid;
  v_counter_2 uuid;
  v_counted bigint;
  v_total bigint := 0;
  v_bag_total bigint;
  v_declared bigint;
  v_bag jsonb;
  v_line jsonb;
  v_bag_id uuid;
  v_bag_no integer := 0;
  v_member_id bigint;
  v_code text;
  v_expected_code text;
  v_name text;
  v_category text;
  v_designation text;
  v_amount bigint;
  v_new_version integer;
  v_action text;
begin
  if not public.finance_user_can(p_actor,'entry') then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_data)<>'object' or jsonb_typeof(p_data->'bags')<>'array'
     or jsonb_array_length(p_data->'bags') not between 1 and 500
     or jsonb_typeof(p_data->'counterUserIds')<>'array'
     or jsonb_array_length(p_data->'counterUserIds')<>2 then raise exception 'invalid_batch'; end if;
  v_date := (p_data->>'offeringDate')::date;
  v_counter_1 := (p_data->'counterUserIds'->>0)::uuid;
  v_counter_2 := (p_data->'counterUserIds'->>1)::uuid;
  v_counted := (p_data->>'countedCash')::bigint;
  if v_counter_1=v_counter_2 or v_counted<=0
     or not public.finance_user_can(v_counter_1,'entry')
     or not public.finance_user_can(v_counter_2,'entry') then raise exception 'invalid_counters'; end if;
  if p_batch_id is null then
    if p_expected_version is not null then raise exception 'version_conflict'; end if;
    insert into public.finance_cash_batches(offering_date,counter_1,counter_2,counted_cash,entered_total,created_by,updated_by)
    values(v_date,v_counter_1,v_counter_2,v_counted,1,p_actor,p_actor)
    returning id into v_id;
    v_new_version := 1;
    v_action := 'created';
  else
    select * into v_batch from public.finance_cash_batches where id=p_batch_id and church_id='M+' for update;
    if not found then raise exception 'batch_not_found'; end if;
    if v_batch.status not in ('draft','returned') then raise exception 'batch_locked'; end if;
    if p_expected_version is distinct from v_batch.version then raise exception 'version_conflict'; end if;
    v_id := p_batch_id;
    v_new_version := v_batch.version+1;
    v_action := 'saved';
    delete from public.finance_cash_bags where batch_id=v_id;
  end if;
  for v_bag in select value from jsonb_array_elements(p_data->'bags') loop
    v_bag_no := v_bag_no+1;
    if jsonb_typeof(v_bag)<>'object' or jsonb_typeof(v_bag->'lines')<>'array'
       or jsonb_array_length(v_bag->'lines') not between 1 and 20 then raise exception 'invalid_bag'; end if;
    v_name := btrim(coalesce(v_bag->>'bagName',''));
    if length(v_name) not between 1 and 80 then raise exception 'invalid_bag_name'; end if;
    v_member_id := nullif(v_bag->>'memberId','')::bigint;
    v_code := nullif(v_bag->>'offeringCode','');
    if v_member_id is not null then
      select p.offering_code into v_expected_code
      from public.finance_member_codes p join public.members m on m.id=p.member_id
      where p.member_id=v_member_id and m.church_id='M+' and m.archived_at is null;
      if v_expected_code is null or v_code is distinct from v_expected_code then raise exception 'member_code_mismatch'; end if;
    elsif v_code is not null then
      raise exception 'unlinked_offering_code';
    end if;
    v_bag_total := 0;
    v_declared := (v_bag->>'declaredTotal')::bigint;
    if v_declared<=0 then raise exception 'invalid_bag_total'; end if;
    insert into public.finance_cash_bags(
      batch_id,bag_no,bag_name,member_id,offering_code,bag_phone,bag_address,
      anonymous,public_choice,hide_from_bulletin,receipt_preference,declared_total
    ) values (
      v_id,v_bag_no,v_name,v_member_id,v_code,
      nullif(btrim(coalesce(v_bag->>'bagPhone','')),''),nullif(btrim(coalesce(v_bag->>'bagAddress','')),''),
      coalesce((v_bag->>'anonymous')::boolean,false),
      coalesce(nullif(v_bag->>'publicChoice',''),'public'),
      coalesce((v_bag->>'hideFromBulletin')::boolean,false),
      coalesce(nullif(v_bag->>'receiptPreference',''),'annual'),v_declared
    ) returning id into v_bag_id;
    for v_line in select value from jsonb_array_elements(v_bag->'lines') loop
      v_category := v_line->>'category';
      v_designation := nullif(btrim(coalesce(v_line->>'designation','')),'');
      v_amount := (v_line->>'amount')::bigint;
      if v_category not in ('十一奉獻','感恩奉獻','宣教奉獻','建堂奉獻','慈惠奉獻','指定奉獻','一般／不具名奉獻')
         or v_amount<=0 or (v_category='指定奉獻' and v_designation is null)
         or (v_category='一般／不具名奉獻' and coalesce((v_bag->>'anonymous')::boolean,false)=false)
         then raise exception 'invalid_line'; end if;
      insert into public.finance_cash_lines(bag_id,category,designation,amount)
      values(v_bag_id,v_category,v_designation,v_amount);
      v_bag_total := v_bag_total+v_amount;
    end loop;
    if v_bag_total<>v_declared then raise exception 'bag_total_mismatch'; end if;
    v_total := v_total+v_bag_total;
  end loop;
  update public.finance_cash_batches set
    offering_date=v_date,counter_1=v_counter_1,counter_2=v_counter_2,
    counted_cash=v_counted,entered_total=v_total,version=v_new_version,
    spouse_verified_cash=null,spouse_verified_by=null,pastor_approved_by=null,
    updated_by=p_actor,updated_at=now()
  where id=v_id;
  insert into public.finance_cash_events(batch_id,version,action,from_status,to_status,actor_user_id,snapshot)
  values(v_id,v_new_version,v_action,case when v_action='created' then null else v_batch.status end,
         case when v_action='created' then 'draft' else v_batch.status end,p_actor,p_data);
  return jsonb_build_object('id',v_id,'version',v_new_version,'status',case when v_action='created' then 'draft' else v_batch.status end,'enteredTotal',v_total);
end $$;
revoke all on function public.finance_save_cash_batch(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.finance_save_cash_batch(uuid,uuid,integer,jsonb) to service_role;

create or replace function public.finance_transition_cash_batch(
  p_actor uuid,p_batch_id uuid,p_expected_version integer,p_action text,p_verified_cash bigint default null,p_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_batch public.finance_cash_batches%rowtype;
  v_total bigint;
  v_to text;
  v_capability text;
  v_event text;
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  select * into v_batch from public.finance_cash_batches where id=p_batch_id and church_id='M+' for update;
  if not found then raise exception 'batch_not_found'; end if;
  if p_expected_version is distinct from v_batch.version then raise exception 'version_conflict'; end if;
  if p_action='submit' and v_batch.status in ('draft','returned') then
    v_to:='spouse_review'; v_capability:='entry'; v_event:='submitted';
  elsif p_action='verify_cash' and v_batch.status='spouse_review' then
    v_to:='pastor_review'; v_capability:='cash_verify'; v_event:='cash_verified';
  elsif p_action='approve' and v_batch.status='pastor_review' then
    v_to:='booked'; v_capability:='approve'; v_event:='approved';
  elsif p_action='return' and v_batch.status='spouse_review' then
    v_to:='returned'; v_capability:='cash_verify'; v_event:='returned';
  elsif p_action='return' and v_batch.status='pastor_review' then
    v_to:='returned'; v_capability:='approve'; v_event:='returned';
  else raise exception 'invalid_transition'; end if;
  if not public.finance_user_can(p_actor,v_capability) then raise exception 'forbidden'; end if;
  if p_action='return' and v_reason is null then raise exception 'reason_required'; end if;
  if p_action<>'return' then
    select coalesce(sum(l.amount),0) into v_total
    from public.finance_cash_bags b join public.finance_cash_lines l on l.bag_id=b.id
    where b.batch_id=p_batch_id;
    if v_total<>v_batch.entered_total or v_total<>v_batch.counted_cash then raise exception 'cash_total_mismatch'; end if;
    if exists (
      select 1 from public.finance_cash_bags b where b.batch_id=p_batch_id and
      b.declared_total<>(select coalesce(sum(l.amount),0) from public.finance_cash_lines l where l.bag_id=b.id)
    ) then raise exception 'bag_total_mismatch'; end if;
    if p_action='verify_cash' and p_verified_cash is distinct from v_batch.counted_cash then raise exception 'verified_cash_mismatch'; end if;
  end if;
  update public.finance_cash_batches set
    status=v_to,version=version+1,updated_by=p_actor,updated_at=now(),
    spouse_verified_cash=case when p_action='verify_cash' then p_verified_cash when p_action='return' then null else spouse_verified_cash end,
    spouse_verified_by=case when p_action='verify_cash' then p_actor when p_action='return' then null else spouse_verified_by end,
    pastor_approved_by=case when p_action='approve' then p_actor else pastor_approved_by end
  where id=p_batch_id;
  insert into public.finance_cash_events(batch_id,version,action,from_status,to_status,actor_user_id,reason)
  values(p_batch_id,v_batch.version+1,v_event,v_batch.status,v_to,p_actor,v_reason);
  return jsonb_build_object('id',p_batch_id,'version',v_batch.version+1,'status',v_to);
end $$;
revoke all on function public.finance_transition_cash_batch(uuid,uuid,integer,text,bigint,text) from public,anon,authenticated;
grant execute on function public.finance_transition_cash_batch(uuid,uuid,integer,text,bigint,text) to service_role;

commit;
