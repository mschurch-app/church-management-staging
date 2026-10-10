-- Read-only context for service scheduling drafts; never changes registration or schedule data.
create or replace function public.get_service_signup_match_context(p_church text,p_season bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin jsonb;v_result jsonb;
begin
  v_admin:=public.get_service_signup_admin(p_church);
  if not exists(select 1 from public.service_signup_seasons s where s.id=p_season and s.church_id=p_church) then
    raise exception 'season_unavailable' using errcode='22023';
  end if;
  with role_map(role_key,target_key) as (values
      ('sound','tech_sound'),
      ('projection_director','tech_video'),
      ('lighting','custom_f15e659f6a90065d'),
      ('worship_leader','worship_leader'),
      ('assistant_worship_leader','custom_9ce39850489c56cd'),
      ('keyboard_1','custom_321a786c791201d4'),
      ('keyboard_2','custom_5a2347d6f4712277'),
      ('drums','drums'),
      ('guitar','guitar'),
      ('bass','bass'),
      ('singer_1','custom_9462bfb6bd5d047b'),
      ('singer_2','custom_8111d3ff9bdab05c'),
      ('singer_3','custom_24781cd4004d4df5'),
      ('welcome_1','usher1'),
      ('welcome_2','usher2'),
      ('children_teacher','sunday_school'),
      ('children_assistant','sunday_school_ta')
  ), visible_slots as (
    select sl.*,rm.target_key from public.service_signup_slots sl join role_map rm using(role_key)
    where sl.church_id=p_church and sl.season_id=p_season
      and ((v_admin->>'can_manage')::boolean or (v_admin->'scopes') ? 'all' or (v_admin->'scopes') ? sl.ministry_key)
  ), season_schedules as (
    select distinct on(replace(s.service_date,'/','-')) s.*,replace(s.service_date,'/','-') as date_key,
      to_jsonb(s)||coalesce(s.custom_assignments,'{}'::jsonb) as flattened
    from public.service_schedules s where s.church_id=p_church
      and exists(select 1 from visible_slots sl where sl.service_date::text=replace(s.service_date,'/','-'))
    order by replace(s.service_date,'/','-'),s.id
  )
  select jsonb_build_object(
    'schedules',coalesce((select jsonb_agg(jsonb_build_object('service_date',s.date_key,'assignments',
      coalesce((select jsonb_object_agg(a.key,a.value) from jsonb_each(s.flattened) a
        where a.key in(select distinct sl.target_key from visible_slots sl)),'{}'::jsonb)) order by s.date_key,s.id)
      from season_schedules s),'[]'::jsonb),
    'blocked_registration_ids',coalesce((select jsonb_agg(distinct r.id)
      from public.service_signup_registrations r join visible_slots sl on sl.id=r.slot_id
      join public.members m on m.id=r.member_id and m.church_id=r.church_id
      join season_schedules s on s.date_key=r.service_date::text
      where r.church_id=p_church and r.season_id=p_season and r.status in ('registered','confirmed') and exists(
        select 1 from jsonb_each_text(s.flattened) a(key,value)
        cross join lateral regexp_split_to_table(coalesce(a.value,''),'[、,，;；\n]+') as assigned_name
        where a.key<>sl.target_key and (a.key=any(array[
          'speaker','worship_leader','presider','prayer','tech_sound','tech_video','usher1','usher2',
          'sunday_school','sunday_school_ta','transport','communion','communion_bread','communion_cup',
          'wed_prayer','singers','keyboard','guitar','bass','drums','ushers'
        ]) or a.key like 'custom_%') and btrim(assigned_name)=btrim(m.name)
      )),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_service_signup_match_context(text,bigint) from public,anon;
grant execute on function public.get_service_signup_match_context(text,bigint) to authenticated,service_role;

create or replace function public.service_signup_apply_smart_match(
  p_church text,
  p_season bigint,
  p_registrations bigint[]
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_manage boolean;
  v_scopes text[];
  v_requested integer;
  v_distinct integer;
  v_item record;
  v_schedule public.service_schedules%rowtype;
  v_target text;
  v_assigned_name text;
  v_existing text;
  v_group_key text;
  v_capacity integer;
  v_taken integer;
  v_written jsonb := '{}'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_applied integer := 0;
  v_skipped integer := 0;
begin
  if p_church not in ('M+','SHiNE') or coalesce(cardinality(p_registrations),0) not between 1 and 300 then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  if auth.uid() is null or not exists(
    select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active
  ) then raise exception 'forbidden' using errcode='42501'; end if;

  v_manage:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid())
    or coalesce((select p.can_manage from church_auth.account_feature_permissions p
      where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false);
  select coalesce(array_agg(s.ministry_key),'{}') into v_scopes
  from church_auth.service_ministry_scopes s
  where s.user_id=auth.uid() and s.church_id=p_church;
  if not v_manage and cardinality(v_scopes)=0 then raise exception 'forbidden' using errcode='42501'; end if;

  select count(*),count(distinct id) into v_requested,v_distinct from unnest(p_registrations) as selected(id);
  if v_requested<>v_distinct then raise exception 'duplicate_registrations' using errcode='22023'; end if;
  if not exists(select 1 from public.service_signup_seasons s where s.id=p_season and s.church_id=p_church) then
    raise exception 'season_unavailable' using errcode='22023';
  end if;

  for v_item in
    select r.id,r.member_id,r.service_date,r.status,r.created_at,
      sl.id as slot_id,sl.ministry_key,sl.role_key,m.name as member_name
    from public.service_signup_registrations r
    join public.service_signup_slots sl on sl.id=r.slot_id and sl.season_id=r.season_id and sl.church_id=r.church_id
    join public.members m on m.id=r.member_id and m.church_id=r.church_id and m.archived_at is null
    where r.id=any(p_registrations) and r.church_id=p_church and r.season_id=p_season
      and r.status in ('registered','confirmed')
    order by r.service_date,sl.ministry_key,sl.role_key,r.created_at,r.id
    for update of r
  loop
    if not v_manage and not ('all'=any(v_scopes) or v_item.ministry_key=any(v_scopes)) then
      raise exception 'forbidden' using errcode='42501';
    end if;

    select sl.capacity into v_capacity from public.service_signup_slots sl
    where sl.id=v_item.slot_id for update;

    v_target:=case v_item.role_key
      when 'sound' then 'tech_sound'
      when 'projection_director' then 'tech_video'
      when 'lighting' then 'custom_f15e659f6a90065d'
      when 'worship_leader' then 'worship_leader'
      when 'assistant_worship_leader' then 'custom_9ce39850489c56cd'
      when 'keyboard_1' then 'custom_321a786c791201d4'
      when 'keyboard_2' then 'custom_5a2347d6f4712277'
      when 'drums' then 'drums'
      when 'guitar' then 'guitar'
      when 'bass' then 'bass'
      when 'singer_1' then 'custom_9462bfb6bd5d047b'
      when 'singer_2' then 'custom_8111d3ff9bdab05c'
      when 'singer_3' then 'custom_24781cd4004d4df5'
      when 'welcome_1' then 'usher1'
      when 'welcome_2' then 'usher2'
      when 'children_teacher' then 'sunday_school'
      when 'children_assistant' then 'sunday_school_ta'
      else null
    end;
    if v_target is null then
      v_skipped:=v_skipped+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('registration_id',v_item.id,'status','unsupported'));
      continue;
    end if;

    v_schedule:=null;
    select s.* into v_schedule from public.service_schedules s
    where s.church_id=p_church and replace(s.service_date,'/','-')=v_item.service_date::text
    order by s.id limit 1 for update;
    if v_schedule.id is null then
      insert into public.service_schedules(church_id,service_date,event)
      values(p_church,v_item.service_date::text,'主日崇拜')
      on conflict(church_id,service_date) do nothing;
      select s.* into v_schedule from public.service_schedules s
      where s.church_id=p_church and s.service_date=v_item.service_date::text
      for update;
    end if;
    if v_schedule.id is null then raise exception 'schedule_unavailable'; end if;

    v_existing:=case when v_target like 'custom_%'
      then v_schedule.custom_assignments->>v_target
      else to_jsonb(v_schedule)->>v_target
    end;
    v_group_key:=v_item.service_date::text||':'||v_target;

    if exists(select 1 from regexp_split_to_table(coalesce(v_existing,''),'[、,，;；\n]+') as existing_name
      where btrim(existing_name)=btrim(v_item.member_name)) then
      update public.service_signup_registrations set status='confirmed',updated_at=now()
      where id=v_item.id and status='registered';
      v_applied:=v_applied+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'registration_id',v_item.id,'status','already_present','service_date',v_item.service_date,'target_key',v_target
      ));
      continue;
    end if;

    if nullif(btrim(coalesce(v_existing,'')),'') is not null and not (v_written ? v_group_key) then
      v_skipped:=v_skipped+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'registration_id',v_item.id,'status','conflict','service_date',v_item.service_date,'target_key',v_target
      ));
      continue;
    end if;

    -- Recheck current schedule under the row lock, including assignments outside this leader's scope.
    if exists(
      select 1 from jsonb_each_text(to_jsonb(v_schedule)||coalesce(v_schedule.custom_assignments,'{}'::jsonb)) as a(key,value)
      cross join lateral regexp_split_to_table(coalesce(a.value,''),'[、,，;；\n]+') as assigned_name
      where a.key<>v_target and (a.key=any(array[
        'speaker','worship_leader','presider','prayer','tech_sound','tech_video','usher1','usher2',
        'sunday_school','sunday_school_ta','transport','communion','communion_bread','communion_cup',
        'wed_prayer','singers','keyboard','guitar','bass','drums','ushers'
      ]) or a.key like 'custom_%') and btrim(assigned_name)=btrim(v_item.member_name)
    ) then
      v_skipped:=v_skipped+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('registration_id',v_item.id,'status','same_day_conflict'));
      continue;
    end if;
    select count(*) into v_taken from regexp_split_to_table(coalesce(v_existing,''),'[、,，;；\n]+') as assigned_name
    where nullif(btrim(assigned_name),'') is not null;
    if v_taken>=v_capacity then
      v_skipped:=v_skipped+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('registration_id',v_item.id,'status','capacity_full'));
      continue;
    end if;

    v_assigned_name:=case when nullif(btrim(coalesce(v_existing,'')),'') is not null
      then v_existing||'、'||v_item.member_name else v_item.member_name end;
    update public.service_schedules s set
      worship_leader=case when v_target='worship_leader' then v_assigned_name else s.worship_leader end,
      guitar=case when v_target='guitar' then v_assigned_name else s.guitar end,
      bass=case when v_target='bass' then v_assigned_name else s.bass end,
      drums=case when v_target='drums' then v_assigned_name else s.drums end,
      tech_sound=case when v_target='tech_sound' then v_assigned_name else s.tech_sound end,
      tech_video=case when v_target='tech_video' then v_assigned_name else s.tech_video end,
      usher1=case when v_target='usher1' then v_assigned_name else s.usher1 end,
      usher2=case when v_target='usher2' then v_assigned_name else s.usher2 end,
      sunday_school=case when v_target='sunday_school' then v_assigned_name else s.sunday_school end,
      sunday_school_ta=case when v_target='sunday_school_ta' then v_assigned_name else s.sunday_school_ta end,
      custom_assignments=case when v_target like 'custom_%'
        then jsonb_set(coalesce(s.custom_assignments,'{}'::jsonb),array[v_target],to_jsonb(v_assigned_name),true)
        else s.custom_assignments end
    where s.id=v_schedule.id;
    update public.service_signup_registrations set status='confirmed',updated_at=now()
    where id=v_item.id and status='registered';
    v_written:=v_written||jsonb_build_object(v_group_key,true);
    v_applied:=v_applied+1;
    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'registration_id',v_item.id,'status','applied','service_date',v_item.service_date,'target_key',v_target
    ));
  end loop;

  if v_applied+v_skipped<>v_requested then raise exception 'registration_unavailable' using errcode='22023'; end if;
  return jsonb_build_object('applied',v_applied,'skipped',v_skipped,'results',v_results);
end
$$;

revoke all on function public.service_signup_apply_smart_match(text,bigint,bigint[]) from public,anon;
grant execute on function public.service_signup_apply_smart_match(text,bigint,bigint[]) to authenticated,service_role;

notify pgrst, 'reload schema';
