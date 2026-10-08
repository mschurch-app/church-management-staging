-- Convert approved service intentions into official schedule assignments.
-- Existing official assignments are never overwritten.

insert into public.schedule_role_preferences(church_id,role_key,label,icon,is_visible,sort_order,updated_at)
values
  ('M+','custom_9ce39850489c56cd','敬拜副主領','🎶',true,30,now()),
  ('M+','custom_321a786c791201d4','第一鍵盤','🎹',true,40,now()),
  ('M+','custom_5a2347d6f4712277','第二鍵盤','🎹',true,50,now()),
  ('M+','guitar','吉他','🎸',true,60,now()),
  ('M+','bass','Bass','🎸',true,70,now()),
  ('M+','drums','爵士鼓','🥁',true,80,now()),
  ('M+','custom_9462bfb6bd5d047b','歌手一','🎤',true,90,now()),
  ('M+','custom_8111d3ff9bdab05c','歌手二','🎤',true,100,now()),
  ('M+','custom_24781cd4004d4df5','歌手三','🎤',true,110,now()),
  ('M+','custom_f15e659f6a90065d','燈光','💡',true,160,now())
on conflict(church_id,role_key) do update
set label=excluded.label,icon=excluded.icon,is_visible=true,sort_order=excluded.sort_order,updated_at=now();

update public.schedule_role_preferences
set sort_order=case role_key
  when 'speaker' then 10
  when 'worship_leader' then 20
  when 'presider' then 120
  when 'prayer' then 130
  when 'tech_sound' then 140
  when 'tech_video' then 150
  when 'usher1' then 170
  when 'usher2' then 180
  when 'sunday_school' then 190
  when 'sunday_school_ta' then 200
  else sort_order
end,
updated_at=now()
where church_id='M+'
  and role_key in ('speaker','worship_leader','presider','prayer','tech_sound','tech_video','usher1','usher2','sunday_school','sunday_school_ta');

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
    select r.id,r.service_date,r.status,r.created_at,
      sl.ministry_key,sl.role_key,m.name as member_name
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

    if nullif(btrim(coalesce(v_existing,'')),'') is not null and btrim(v_existing)=btrim(v_item.member_name) then
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
        then jsonb_set(s.custom_assignments,array[v_target],to_jsonb(v_assigned_name),true)
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
