-- Existing volunteer applications remain valid; their insurance details can be completed later.
alter table camp_registration.volunteer_applications
  add column if not exists birthday date,
  add column if not exists national_id_ciphertext text,
  add column if not exists national_id_last4 text,
  add column if not exists guardian_name text;

do $$ begin
  if not exists(select 1 from pg_catalog.pg_constraint where conname='volunteer_insurance_id_pair' and conrelid='camp_registration.volunteer_applications'::regclass) then
    alter table camp_registration.volunteer_applications add constraint volunteer_insurance_id_pair check (
      (national_id_ciphertext is null and national_id_last4 is null)
      or (national_id_ciphertext is not null and national_id_last4 ~ '^[0-9]{4}$')
    );
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conname='volunteer_guardian_name_length' and conrelid='camp_registration.volunteer_applications'::regclass) then
    alter table camp_registration.volunteer_applications add constraint volunteer_guardian_name_length check (
      guardian_name is null or char_length(btrim(guardian_name)) between 2 and 80
    );
  end if;
end $$;

comment on column camp_registration.volunteer_applications.national_id_ciphertext is
  'AES-256 encrypted national ID for camp volunteer insurance only. Never expose in list, LINE, App notifications, or logs.';
comment on column camp_registration.volunteer_applications.birthday is
  'Date of birth for camp volunteer insurance. Nullable for applications submitted before this field was introduced.';
comment on column camp_registration.volunteer_applications.guardian_name is
  'Guardian name for volunteers under 18 at application time, for insurance only.';

create or replace function public.heat_camp_volunteer_submit(p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_id uuid;
  v_roles text[];
  v_new boolean := false;
  v_birthday date;
  v_national_id text;
  v_guardian_name text;
  v_encryption_key text;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
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
  v_national_id := upper(btrim(coalesce(p_payload->>'national_id','')));
  v_guardian_name := btrim(coalesce(p_payload->>'guardian_name',''));
  if coalesce(p_payload->>'birthday','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or v_national_id !~ '^[A-Z][12][0-9]{8}$'
  then raise exception 'invalid_insurance'; end if;
  begin
    v_birthday := (p_payload->>'birthday')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_insurance';
  end;
  if v_birthday < date '1900-01-01' or v_birthday > v_today
    or (v_birthday > (v_today - interval '18 years')::date and char_length(v_guardian_name) not between 2 and 80)
  then raise exception 'invalid_insurance'; end if;
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
  select decrypted_secret into v_encryption_key from vault.decrypted_secrets
    where name = 'heat-camp-data-encryption-key';
  if v_encryption_key is null then raise exception 'encryption_unavailable'; end if;
  insert into camp_registration.volunteer_applications
    (request_id,event_id,name,church_affiliation,phone,email,line_id,birthday,
     national_id_ciphertext,national_id_last4,guardian_name,requested_roles,experience,notes,
     training_agreed_at,deployment_agreed_at,privacy_agreed_at)
  values (p_request_id,v_event_id,btrim(p_payload->>'name'),btrim(p_payload->>'church_affiliation'),
    btrim(p_payload->>'phone'),lower(btrim(p_payload->>'email')),
    btrim(coalesce(p_payload->>'line_id','')),v_birthday,
    encode(extensions.pgp_sym_encrypt(v_national_id,v_encryption_key,'cipher-algo=aes256'),'base64'),
    right(v_national_id,4),case when v_birthday > (v_today - interval '18 years')::date then v_guardian_name else null end,
    v_roles,btrim(coalesce(p_payload->>'experience','')),btrim(coalesce(p_payload->>'notes','')),
    now(),now(),now())
  on conflict(request_id) do nothing returning id into v_id;
  v_new := v_id is not null;
  if not v_new then
    select id into v_id from camp_registration.volunteer_applications where request_id = p_request_id;
  end if;
  return jsonb_build_object('id',v_id,'created',v_new);
end $$;
revoke all on function public.heat_camp_volunteer_submit(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.heat_camp_volunteer_submit(uuid,jsonb) to service_role;

-- Full ID is returned only after an explicit, authorized insurance-detail request.
create or replace function public.heat_camp_volunteer_insurance_get(p_user uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row camp_registration.volunteer_applications%rowtype;
  v_encryption_key text;
begin
  if not exists(select 1 from church_auth.accounts a where a.user_id = p_user and a.is_active)
    or (not exists(select 1 from church_auth.owners o where o.user_id = p_user)
      and not exists(select 1 from church_auth.grants g where g.user_id = p_user and g.church_id = 'M+' and g.permission = 'heat_camp'))
    or coalesce((select not f.can_view or not f.can_edit from church_auth.account_feature_permissions f
      where f.user_id = p_user and f.church_id = 'M+' and f.feature_key = 'heat_camp'), false)
  then raise exception 'forbidden'; end if;
  select a.* into v_row from camp_registration.volunteer_applications a
    join camp_registration.events e on e.id = a.event_id
    where a.id = p_id and e.slug = 'heat-basketball-camp-2027';
  if not found then raise exception 'not_found'; end if;
  if v_row.national_id_ciphertext is not null then
    select decrypted_secret into v_encryption_key from vault.decrypted_secrets
      where name = 'heat-camp-data-encryption-key';
    if v_encryption_key is null then raise exception 'encryption_unavailable'; end if;
  end if;
  insert into camp_registration.audit_log(actor_type,actor_id,action,details)
    values('staff',p_user::text,'volunteer_insurance_details_viewed',jsonb_build_object('volunteer_application_id',p_id));
  return jsonb_build_object(
    'birthday',v_row.birthday,
    'national_id',case when v_row.national_id_ciphertext is null then null
      else extensions.pgp_sym_decrypt(decode(v_row.national_id_ciphertext,'base64'),v_encryption_key) end,
    'guardian_name',v_row.guardian_name
  );
end $$;
revoke all on function public.heat_camp_volunteer_insurance_get(uuid,uuid) from public,anon,authenticated;
grant execute on function public.heat_camp_volunteer_insurance_get(uuid,uuid) to service_role;

-- Keep the encrypted value out of the standard volunteer review list.
create or replace function public.heat_camp_volunteer_admin(
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

  select coalesce(jsonb_agg(to_jsonb(a) - 'request_id' - 'national_id_ciphertext' order by a.created_at desc), '[]'::jsonb)
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
