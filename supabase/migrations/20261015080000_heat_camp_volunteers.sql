create table camp_registration.volunteer_applications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  event_id uuid not null references camp_registration.events(id),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (char_length(btrim(phone)) between 8 and 24),
  email text not null check (char_length(btrim(email)) between 5 and 160),
  line_id text not null default '' check (char_length(line_id) <= 80),
  requested_roles text[] not null check (cardinality(requested_roles) between 1 and 3 and requested_roles <@ array['group_leader','worship','basketball_assistant']::text[]),
  assigned_roles text[] not null default '{}' check (assigned_roles <@ array['group_leader','worship','basketball_assistant']::text[]),
  experience text not null default '' check (char_length(experience) <= 1000),
  notes text not null default '' check (char_length(notes) <= 1000),
  training_agreed_at timestamptz not null,
  deployment_agreed_at timestamptz not null,
  privacy_agreed_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','contacted','selected','declined')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  line_status text not null default 'pending' check (line_status in ('pending','sent','failed','unavailable')),
  line_sent_at timestamptz,
  line_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_assigned_requested check (assigned_roles <@ requested_roles),
  constraint volunteer_selected_assigned check (status <> 'selected' or cardinality(assigned_roles) > 0)
);
create index volunteer_applications_event_created_idx on camp_registration.volunteer_applications(event_id, created_at desc);
create index volunteer_applications_status_idx on camp_registration.volunteer_applications(status, created_at desc);
alter table camp_registration.volunteer_applications enable row level security;
revoke all on camp_registration.volunteer_applications from public, anon, authenticated;
grant select, insert, update on camp_registration.volunteer_applications to service_role;

create function camp_registration.notify_volunteer_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_roles text;
begin
  select string_agg(case role when 'group_leader' then '小隊輔' when 'worship' then '敬拜團' else '籃球助教' end, '、')
    into v_roles from unnest(new.requested_roles) as r(role);
  insert into public.app_notifications(user_id, church_id, event_key, title, body, target_url, source_key)
  select a.user_id, 'M+', 'camp_volunteer_application', '熱火籃球營有新志工報名',
    left(new.name, 30) || '｜' || v_roles,
    '/heat-camp-volunteers-admin.html?church=M%2B&id=' || new.id::text,
    'camp-volunteer:' || new.id::text
  from church_auth.accounts a
  where a.is_active
    and (exists(select 1 from church_auth.owners o where o.user_id = a.user_id)
      or exists(select 1 from church_auth.grants g where g.user_id = a.user_id and g.church_id = 'M+' and g.permission = 'heat_camp'))
    and coalesce((select f.can_view from church_auth.account_feature_permissions f
      where f.user_id = a.user_id and f.church_id = 'M+' and f.feature_key = 'heat_camp'), true)
  on conflict do nothing;
  return new;
end $$;
revoke all on function camp_registration.notify_volunteer_application() from public, anon, authenticated;
create trigger volunteer_application_notify_app after insert on camp_registration.volunteer_applications
for each row execute function camp_registration.notify_volunteer_application();

create function public.heat_camp_volunteer_admin(
  p_user uuid, p_action text, p_id uuid default null, p_status text default null,
  p_assigned_roles text[] default '{}'::text[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row camp_registration.volunteer_applications%rowtype;
  v_role text;
  v_limit int;
  v_count int;
  v_items jsonb;
  v_counts jsonb;
begin
  if not exists(select 1 from church_auth.accounts a where a.user_id = p_user and a.is_active)
    or (not exists(select 1 from church_auth.owners o where o.user_id = p_user)
      and not exists(select 1 from church_auth.grants g where g.user_id = p_user and g.church_id = 'M+' and g.permission = 'heat_camp'))
    or coalesce((select not f.can_view from church_auth.account_feature_permissions f
      where f.user_id = p_user and f.church_id = 'M+' and f.feature_key = 'heat_camp'), false)
  then raise exception 'forbidden'; end if;

  if p_action = 'update' then
    if coalesce((select not f.can_edit from church_auth.account_feature_permissions f
      where f.user_id = p_user and f.church_id = 'M+' and f.feature_key = 'heat_camp'), false)
    then raise exception 'forbidden'; end if;
    if p_status not in ('pending','contacted','selected','declined') then raise exception 'invalid_status'; end if;
    perform pg_catalog.pg_advisory_xact_lock(2027, 71215);
    select * into v_row from camp_registration.volunteer_applications where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
    if p_status = 'selected' then
      if cardinality(p_assigned_roles) = 0 or cardinality(p_assigned_roles) > 3
        or cardinality(p_assigned_roles) <> (select count(distinct r.role) from unnest(p_assigned_roles) as r(role))
        or not (p_assigned_roles <@ v_row.requested_roles)
      then raise exception 'invalid_roles'; end if;
      foreach v_role in array p_assigned_roles loop
        v_limit := case v_role when 'group_leader' then 10 when 'worship' then 5 when 'basketball_assistant' then 6 else 0 end;
        select count(*) into v_count from camp_registration.volunteer_applications a
          where a.event_id = v_row.event_id and a.id <> p_id and a.status = 'selected' and v_role = any(a.assigned_roles);
        if v_count >= v_limit then raise exception 'role_full'; end if;
      end loop;
    end if;
    update camp_registration.volunteer_applications
      set status = p_status, assigned_roles = case when p_status = 'selected' then p_assigned_roles else '{}'::text[] end,
        reviewed_at = now(), reviewed_by = p_user, updated_at = now()
      where id = p_id;
  elsif p_action <> 'list' then
    raise exception 'invalid_action';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) - 'request_id' order by a.created_at desc), '[]'::jsonb)
    into v_items from camp_registration.volunteer_applications a
    join camp_registration.events e on e.id = a.event_id
    where e.slug = 'heat-basketball-camp-2027';
  select jsonb_build_object(
    'group_leader', count(*) filter (where 'group_leader' = any(assigned_roles) and status = 'selected'),
    'worship', count(*) filter (where 'worship' = any(assigned_roles) and status = 'selected'),
    'basketball_assistant', count(*) filter (where 'basketball_assistant' = any(assigned_roles) and status = 'selected')
  ) into v_counts from camp_registration.volunteer_applications a
    join camp_registration.events e on e.id = a.event_id where e.slug = 'heat-basketball-camp-2027';
  return jsonb_build_object('items', v_items, 'selected_counts', v_counts);
end $$;
revoke all on function public.heat_camp_volunteer_admin(uuid,text,uuid,text,text[]) from public, anon, authenticated;
grant execute on function public.heat_camp_volunteer_admin(uuid,text,uuid,text,text[]) to service_role;

create table camp_registration.volunteer_notification_config (
  event_id uuid primary key references camp_registration.events(id),
  line_group_id text not null check (line_group_id ~ '^C[0-9a-fA-F]{32}$'),
  line_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table camp_registration.volunteer_notification_config enable row level security;
revoke all on camp_registration.volunteer_notification_config from public, anon, authenticated;
grant select, update on camp_registration.volunteer_notification_config to service_role;
insert into camp_registration.volunteer_notification_config(event_id,line_group_id)
select e.id, s.group_id from camp_registration.events e
join public.line_notification_settings s on s.church_id = 'M+' and s.event_key = 'binding_review'
where e.slug = 'heat-basketball-camp-2027' and s.group_id ~ '^C[0-9a-fA-F]{32}$';

create function public.heat_camp_volunteer_submit(p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_id uuid;
  v_roles text[];
  v_new boolean := false;
begin
  if p_request_id is null or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload->'roles') <> 'array'
    or p_payload->>'training_agreed' <> 'true'
    or p_payload->>'deployment_agreed' <> 'true'
    or p_payload->>'privacy_agreed' <> 'true'
  then raise exception 'invalid_request'; end if;
  select id into v_event_id from camp_registration.events
    where slug = 'heat-basketball-camp-2027' and active;
  if v_event_id is null then raise exception 'event_unavailable'; end if;
  select array_agg(distinct r.role order by r.role) into v_roles
    from jsonb_array_elements_text(p_payload->'roles') as r(role);
  if cardinality(v_roles) not between 1 and 3
    or not (v_roles <@ array['group_leader','worship','basketball_assistant']::text[])
    or char_length(btrim(coalesce(p_payload->>'name',''))) not between 2 and 80
    or btrim(coalesce(p_payload->>'phone','')) !~ '^[0-9+() -]{8,24}$'
    or btrim(coalesce(p_payload->>'email','')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(coalesce(p_payload->>'email','')) > 160
    or char_length(coalesce(p_payload->>'line_id','')) > 80
    or char_length(coalesce(p_payload->>'experience','')) > 1000
    or char_length(coalesce(p_payload->>'notes','')) > 1000
  then raise exception 'invalid_request'; end if;
  insert into camp_registration.volunteer_applications
    (request_id,event_id,name,phone,email,line_id,requested_roles,experience,notes,
     training_agreed_at,deployment_agreed_at,privacy_agreed_at)
  values (p_request_id,v_event_id,btrim(p_payload->>'name'),btrim(p_payload->>'phone'),
    lower(btrim(p_payload->>'email')),btrim(coalesce(p_payload->>'line_id','')),v_roles,
    btrim(coalesce(p_payload->>'experience','')),btrim(coalesce(p_payload->>'notes','')),
    now(),now(),now())
  on conflict(request_id) do nothing returning id into v_id;
  v_new := v_id is not null;
  if not v_new then
    select id into v_id from camp_registration.volunteer_applications where request_id = p_request_id;
  end if;
  return jsonb_build_object('id',v_id,'created',v_new);
end $$;
revoke all on function public.heat_camp_volunteer_submit(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.heat_camp_volunteer_submit(uuid,jsonb) to service_role;

create function public.heat_camp_volunteer_delivery(p_id uuid, p_status text, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent','failed','unavailable') then raise exception 'invalid_status'; end if;
  update camp_registration.volunteer_applications
    set line_status = p_status, line_sent_at = case when p_status = 'sent' then now() else null end,
      line_error = left(p_error,200), updated_at = now()
    where id = p_id and line_status = 'pending';
  return found;
end $$;
revoke all on function public.heat_camp_volunteer_delivery(uuid,text,text) from public, anon, authenticated;
grant execute on function public.heat_camp_volunteer_delivery(uuid,text,text) to service_role;

create function public.heat_camp_volunteer_line_config()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('enabled', c.line_enabled, 'group_id', c.line_group_id)
    from camp_registration.volunteer_notification_config c
    join camp_registration.events e on e.id = c.event_id
    where e.slug = 'heat-basketball-camp-2027'), '{}'::jsonb)
$$;
revoke all on function public.heat_camp_volunteer_line_config() from public, anon, authenticated;
grant execute on function public.heat_camp_volunteer_line_config() to service_role;
