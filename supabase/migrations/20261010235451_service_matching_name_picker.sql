-- Names only, searched within the selected church and an authorized service slot.
create or replace function public.get_service_signup_member_candidates(p_church text,p_slot bigint,p_query text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_manage boolean;v_item public.service_signup_slots%rowtype;v_season public.service_signup_seasons%rowtype;v_target text;v_query text;v_result jsonb;
begin
  if p_church not in ('M+','SHiNE') or auth.uid() is null or not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active) then raise exception 'forbidden' using errcode='42501'; end if;
  v_manage:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false);
  select * into v_item from public.service_signup_slots where id=p_slot and church_id=p_church;
  if v_item.id is null then raise exception 'slot_unavailable' using errcode='22023'; end if;
  if not v_manage and not exists(select 1 from church_auth.service_ministry_scopes s where s.user_id=auth.uid() and s.church_id=p_church and s.ministry_key in ('all',v_item.ministry_key)) then raise exception 'forbidden' using errcode='42501'; end if;
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
  if v_target is null then raise exception 'unsupported_role' using errcode='22023'; end if;
  select * into v_season from public.service_signup_seasons where id=v_item.season_id and church_id=p_church;
  v_query:=btrim(coalesce(p_query,''));
  if char_length(v_query)>80 then raise exception 'invalid_name' using errcode='22023'; end if;
  if v_query='' then return jsonb_build_object('members','[]'::jsonb,'has_more',false); end if;
  with matched as (
    select m.id,m.name,m.group_name from public.members m where m.church_id=p_church and m.archived_at is null and strpos(lower(m.name),lower(v_query))>0 order by m.name,m.id limit 31
  ), details as (
    select m.*,coalesce((select jsonb_agg(distinct replace(s.service_date,'/','-')) from public.service_schedules s
      where s.church_id=p_church and replace(s.service_date,'/','-') between v_season.starts_on::text and v_season.ends_on::text and exists(
        select 1 from jsonb_each_text(to_jsonb(s)||coalesce(s.custom_assignments,'{}'::jsonb)) a(key,value)
        cross join lateral regexp_split_to_table(coalesce(a.value,''),'[、,，;；\n]+') assigned_name
        where (a.key=any(array['speaker','worship_leader','presider','prayer','tech_sound','tech_video','usher1','usher2','sunday_school','sunday_school_ta','transport','communion','communion_bread','communion_cup','wed_prayer','singers','keyboard','guitar','bass','drums','ushers']) or a.key like 'custom_%') and btrim(assigned_name)=btrim(m.name))),'[]'::jsonb) as formal_dates,
      exists(select 1 from public.service_schedules s where s.church_id=p_church and replace(s.service_date,'/','-')=v_item.service_date::text and exists(
        select 1 from jsonb_each_text(to_jsonb(s)||coalesce(s.custom_assignments,'{}'::jsonb)) a(key,value)
        cross join lateral regexp_split_to_table(coalesce(a.value,''),'[、,，;；\n]+') assigned_name
        where a.key<>v_target and (a.key=any(array['speaker','worship_leader','presider','prayer','tech_sound','tech_video','usher1','usher2','sunday_school','sunday_school_ta','transport','communion','communion_bread','communion_cup','wed_prayer','singers','keyboard','guitar','bass','drums','ushers']) or a.key like 'custom_%') and btrim(assigned_name)=btrim(m.name))) as same_day_conflict
    from (select * from matched order by name,id limit 30) m
  ) select jsonb_build_object('members',coalesce((select jsonb_agg(to_jsonb(d) order by d.name,d.id) from details d),'[]'::jsonb),'has_more',(select count(*)>30 from matched)) into v_result;
  return v_result;
end $$;
revoke all on function public.get_service_signup_member_candidates(text,bigint,text) from public,anon;
grant execute on function public.get_service_signup_member_candidates(text,bigint,text) to authenticated,service_role;

-- One transaction for registered suggestions and manually coordinated names.
create or replace function public.service_signup_apply_match_draft(p_church text,p_season bigint,p_registrations bigint[],p_manual jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_admin jsonb;v_result jsonb:='{"applied":0,"skipped":0,"results":[]}'::jsonb;v_manual jsonb:=coalesce(p_manual,'[]'::jsonb);v_choice jsonb;
 v_item public.service_signup_slots%rowtype;v_schedule public.service_schedules%rowtype;v_target text;v_name text;v_member bigint;v_exact integer;v_existing text;v_assigned_name text;v_taken integer;v_key text;v_written jsonb:='{}'::jsonb;v_status text;
begin
 if p_church not in ('M+','SHiNE') or jsonb_typeof(v_manual)<>'array' then raise exception 'invalid_request' using errcode='22023'; end if;
 if coalesce(cardinality(p_registrations),0)+jsonb_array_length(v_manual) not between 1 and 300 then raise exception 'invalid_request' using errcode='22023'; end if;
 v_admin:=public.get_service_signup_admin(p_church);
 if not exists(select 1 from public.service_signup_seasons where id=p_season and church_id=p_church) then raise exception 'season_unavailable' using errcode='22023'; end if;
 if coalesce(cardinality(p_registrations),0)>0 then
   v_result:=public.service_signup_apply_smart_match(p_church,p_season,p_registrations);
   select coalesce(jsonb_object_agg((e->>'service_date')||':'||(e->>'target_key'),true),'{}'::jsonb) into v_written from jsonb_array_elements(v_result->'results') e where e->>'status'='applied';
 end if;
 for v_choice in select value from jsonb_array_elements(v_manual) order by (value->>'slot_id')::bigint loop
   if jsonb_typeof(v_choice)<>'object' then raise exception 'invalid_request' using errcode='22023'; end if;
   select * into v_item from public.service_signup_slots where id=(v_choice->>'slot_id')::bigint and church_id=p_church and season_id=p_season for update;
   if v_item.id is null then raise exception 'slot_unavailable' using errcode='22023'; end if;
   if not (v_admin->>'can_manage')::boolean and not ((v_admin->'scopes') ? 'all' or (v_admin->'scopes') ? v_item.ministry_key) then raise exception 'forbidden' using errcode='42501'; end if;
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
   if v_target is null then raise exception 'unsupported_role' using errcode='22023'; end if;
   v_name:=btrim(coalesce(v_choice->>'name',''));v_member:=nullif(v_choice->>'member_id','')::bigint;
   if v_member is not null then
     select btrim(name) into v_name from public.members where id=v_member and church_id=p_church and archived_at is null;
     if v_name is null then raise exception 'member_unavailable' using errcode='22023'; end if;
   else
     select count(*),min(id) into v_exact,v_member from public.members where church_id=p_church and archived_at is null and lower(btrim(name))=lower(v_name);
     if v_exact>1 then raise exception 'ambiguous_member_name' using errcode='22023'; end if;
     if v_member is not null then select btrim(name) into v_name from public.members where id=v_member; end if;
   end if;
   if char_length(v_name) not between 1 and 80 or v_name ~ '[、,，;；\n\r\t]' then raise exception 'invalid_name' using errcode='22023'; end if;
   if exists(select 1 from public.service_signup_registrations r where r.church_id=p_church and r.slot_id=v_item.id and r.member_id=v_member and r.status in ('waitlisted','offered')) then
     v_result:=jsonb_set(v_result,'{skipped}',to_jsonb((v_result->>'skipped')::integer+1));
     v_result:=jsonb_set(v_result,'{results}',(v_result->'results')||jsonb_build_array(jsonb_build_object('slot_id',v_item.id,'status','pending_offer')));continue;
   end if;
   v_schedule:=null;
   select * into v_schedule from public.service_schedules where church_id=p_church and replace(service_date,'/','-')=v_item.service_date::text order by id limit 1 for update;
   if v_schedule.id is null then
     insert into public.service_schedules(church_id,service_date,event) values(p_church,v_item.service_date::text,'主日崇拜') on conflict(church_id,service_date) do nothing;
     select * into v_schedule from public.service_schedules where church_id=p_church and service_date=v_item.service_date::text for update;
   end if;
   if v_schedule.id is null then raise exception 'schedule_unavailable'; end if;
   v_existing:=case when v_target like 'custom_%' then v_schedule.custom_assignments->>v_target else to_jsonb(v_schedule)->>v_target end;
   v_key:=v_item.service_date::text||':'||v_target;v_status:='applied';
   if exists(select 1 from regexp_split_to_table(coalesce(v_existing,''),'[、,，;；\n]+') assigned_name where btrim(assigned_name)=v_name) then v_status:='already_present';
   elsif nullif(btrim(coalesce(v_existing,'')),'') is not null and not (v_written ? v_key) then v_status:='conflict';
   elsif exists(select 1 from jsonb_each_text(to_jsonb(v_schedule)||coalesce(v_schedule.custom_assignments,'{}'::jsonb)) a(key,value)
     cross join lateral regexp_split_to_table(coalesce(a.value,''),'[、,，;；\n]+') assigned_name
     where a.key<>v_target and (a.key=any(array['speaker','worship_leader','presider','prayer','tech_sound','tech_video','usher1','usher2','sunday_school','sunday_school_ta','transport','communion','communion_bread','communion_cup','wed_prayer','singers','keyboard','guitar','bass','drums','ushers']) or a.key like 'custom_%') and btrim(assigned_name)=v_name) then v_status:='same_day_conflict';
   else
     select count(*) into v_taken from regexp_split_to_table(coalesce(v_existing,''),'[、,，;；\n]+') assigned_name where nullif(btrim(assigned_name),'') is not null;
     if v_taken>=v_item.capacity then v_status:='capacity_full'; end if;
   end if;
   if v_status='applied' then
     v_assigned_name:=case when nullif(btrim(coalesce(v_existing,'')),'') is not null then v_existing||'、'||v_name else v_name end;
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
     v_written:=v_written||jsonb_build_object(v_key,true);
   end if;
   if v_status in ('applied','already_present') then
     update public.service_signup_registrations set status='confirmed',updated_at=now() where church_id=p_church and slot_id=v_item.id and member_id=v_member and status='registered';
     v_result:=jsonb_set(v_result,'{applied}',to_jsonb((v_result->>'applied')::integer+1));
   else v_result:=jsonb_set(v_result,'{skipped}',to_jsonb((v_result->>'skipped')::integer+1));end if;
   v_result:=jsonb_set(v_result,'{results}',(v_result->'results')||jsonb_build_array(jsonb_build_object('slot_id',v_item.id,'status',v_status,'service_date',v_item.service_date,'target_key',v_target)));
 end loop;
 return v_result;
end $$;
revoke all on function public.service_signup_apply_match_draft(text,bigint,bigint[],jsonb) from public,anon;
grant execute on function public.service_signup_apply_match_draft(text,bigint,bigint[],jsonb) to authenticated,service_role;
notify pgrst, 'reload schema';
