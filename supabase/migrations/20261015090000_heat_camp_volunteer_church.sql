alter table camp_registration.volunteer_applications
  add column church_affiliation text not null default '' check (char_length(btrim(church_affiliation)) between 1 and 120);

create or replace function public.heat_camp_volunteer_submit(p_request_id uuid, p_payload jsonb)
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
    or char_length(btrim(coalesce(p_payload->>'church_affiliation',''))) not between 1 and 120
    or btrim(coalesce(p_payload->>'phone','')) !~ '^[0-9+() -]{8,24}$'
    or btrim(coalesce(p_payload->>'email','')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(coalesce(p_payload->>'email','')) > 160
    or char_length(coalesce(p_payload->>'line_id','')) > 80
    or char_length(coalesce(p_payload->>'experience','')) > 1000
    or char_length(coalesce(p_payload->>'notes','')) > 1000
  then raise exception 'invalid_request'; end if;
  insert into camp_registration.volunteer_applications
    (request_id,event_id,name,church_affiliation,phone,email,line_id,requested_roles,experience,notes,
     training_agreed_at,deployment_agreed_at,privacy_agreed_at)
  values (p_request_id,v_event_id,btrim(p_payload->>'name'),btrim(p_payload->>'church_affiliation'),
    btrim(p_payload->>'phone'),lower(btrim(p_payload->>'email')),
    btrim(coalesce(p_payload->>'line_id','')),v_roles,
    btrim(coalesce(p_payload->>'experience','')),btrim(coalesce(p_payload->>'notes','')),
    now(),now(),now())
  on conflict(request_id) do nothing returning id into v_id;
  v_new := v_id is not null;
  if not v_new then
    select id into v_id from camp_registration.volunteer_applications where request_id = p_request_id;
  end if;
  return jsonb_build_object('id',v_id,'created',v_new);
end $$;

create or replace function camp_registration.notify_volunteer_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_roles text;
begin
  select string_agg(case role when 'group_leader' then '小隊輔' when 'worship' then '敬拜團' else '籃球助教' end, '、')
    into v_roles from unnest(new.requested_roles) as r(role);
  insert into public.app_notifications(user_id, church_id, event_key, title, body, target_url, source_key)
  select a.user_id, 'M+', 'camp_volunteer_application', '熱火籃球營有新志工報名',
    left(new.name, 30) || '（' || left(new.church_affiliation, 60) || '）｜' || v_roles,
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
