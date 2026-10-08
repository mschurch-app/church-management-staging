-- Public signup selects a service preference, while the database assigns numbered positions.
-- Existing slot, waitlist, and leader review workflows remain unchanged.
create or replace function public.service_signup_register_preference_batch(
  p_church text,
  p_channel text,
  p_subject text,
  p_member_name text,
  p_choices jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_member bigint;
  v_actual_name text;
  v_choice_count integer;
  v_choice jsonb;
  v_group text;
  v_date date;
  v_slot public.service_signup_slots%rowtype;
  v_taken integer;
  v_queue integer;
  v_status text;
  v_registration bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if p_church<>'M+' or p_channel!~'^[0-9]+$' or p_subject!~'^U[0-9a-f]{32}$' then
    raise exception 'invalid_identity' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_member_name,''))) not between 2 and 80 then
    raise exception 'member_name_required' using errcode='22023';
  end if;
  if coalesce(jsonb_typeof(p_choices),'null')<>'array' or coalesce(jsonb_array_length(p_choices),0) not between 1 and 60 then
    raise exception 'invalid_choices' using errcode='22023';
  end if;

  select b.member_id,m.name into v_member,v_actual_name
  from church_auth.member_bindings b
  join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
  where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active
  limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501'; end if;
  if regexp_replace(lower(btrim(coalesce(v_actual_name,''))),'[[:space:]]+','','g')
     <> regexp_replace(lower(btrim(p_member_name)),'[[:space:]]+','','g') then
    raise exception 'member_name_mismatch' using errcode='22023';
  end if;

  select count(*),count(distinct value->>'service_date')
    into v_choice_count,v_taken
  from jsonb_array_elements(p_choices) choice(value);
  if v_choice_count<>v_taken then raise exception 'duplicate_service_date' using errcode='23505'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_choices) choice(value)
    where coalesce(value->>'role_key','') not in (
      'sound','projection_director','lighting','worship_leader','assistant_worship_leader',
      'keyboard','drums','guitar','bass','singer','welcome','children_teacher','children_assistant'
    ) or coalesce(value->>'service_date','')!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  ) then raise exception 'invalid_choices' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('service-signup-member:'||p_church||':'||v_member::text,0));

  for v_choice in select value from jsonb_array_elements(p_choices) choice(value)
  loop
    v_group:=v_choice->>'role_key';
    v_date:=(v_choice->>'service_date')::date;
    if exists(
      select 1 from public.service_signup_registrations r
      where r.church_id=p_church and r.member_id=v_member and r.service_date=v_date
        and r.status in ('registered','waitlisted','offered','confirmed')
    ) then raise exception 'one_service_per_sunday' using errcode='23505'; end if;

    perform pg_advisory_xact_lock(hashtextextended('service-signup-group:'||p_church||':'||v_date::text||':'||v_group,0));
    v_slot:=null;
    select sl.* into v_slot
    from public.service_signup_slots sl
    join public.service_signup_seasons s on s.id=sl.season_id
    where sl.church_id=p_church and sl.service_date=v_date and sl.is_open and s.status='open'
      and (s.opens_at is null or s.opens_at<=now()) and (s.closes_at is null or s.closes_at>now())
      and case v_group
        when 'welcome' then sl.role_key in ('welcome_1','welcome_2')
        when 'singer' then sl.role_key in ('singer_1','singer_2','singer_3')
        when 'keyboard' then sl.role_key in ('keyboard_1','keyboard_2')
        else sl.role_key=v_group
      end
    order by
      ((select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed','offered'))<sl.capacity) desc,
      (sl.capacity-(select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed','offered'))) desc,
      (select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status='waitlisted') asc,
      sl.role_key
    limit 1
    for update of sl;
    if v_slot.id is null then raise exception 'slot_unavailable' using errcode='22023'; end if;

    perform pg_advisory_xact_lock(hashtextextended('service-signup:'||v_slot.id::text,0));
    select count(*) into v_taken from public.service_signup_registrations r
    where r.slot_id=v_slot.id and r.status in ('registered','confirmed','offered');
    if v_taken<v_slot.capacity then
      v_status:='registered';v_queue:=null;
    else
      v_status:='waitlisted';
      select coalesce(max(greatest(coalesce(r.queue_number,0),coalesce(r.offered_queue_number,0))),0)+1
      into v_queue from public.service_signup_registrations r where r.slot_id=v_slot.id;
    end if;

    insert into public.service_signup_registrations(
      slot_id,season_id,church_id,service_date,member_id,line_subject,status,queue_number
    ) values(
      v_slot.id,v_slot.season_id,p_church,v_slot.service_date,v_member,p_subject,v_status,v_queue
    )
    on conflict(slot_id,member_id) do update set
      line_subject=excluded.line_subject,status=excluded.status,queue_number=excluded.queue_number,
      offered_queue_number=null,offer_expires_at=null,cancelled_at=null,updated_at=now()
    returning id into v_registration;
    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'id',v_registration,'slot_id',v_slot.id,'service_date',v_slot.service_date,
      'role_key',v_group,'assigned_role_key',v_slot.role_key,'status',v_status,'queue_number',v_queue
    ));
  end loop;
  return jsonb_build_object('member_id',v_member,'member_name',v_actual_name,'registrations',v_results);
end
$$;

revoke all on function public.service_signup_register_preference_batch(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.service_signup_register_preference_batch(text,text,text,text,jsonb) to service_role;
