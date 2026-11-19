-- One atomic request for multiple Sunday preferences, using the existing guarded staff write.
create or replace function public.service_signup_admin_register_batch(p_church text,p_season bigint,p_member bigint,p_choices jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin jsonb;v_choice jsonb;v_keys text[];v_slot bigint;v_existing public.service_signup_registrations%rowtype;v_result jsonb;v_results jsonb:='[]';
begin
 v_admin:=public.get_service_signup_admin(p_church);
 if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'invalid_choices' using errcode='22023';end if;
 if jsonb_array_length(p_choices) not between 1 and 60 then raise exception 'invalid_choices' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_choices) c group by c->>'service_date' having count(*)>1) then raise exception 'duplicate_service_date' using errcode='23505';end if;
 if not exists(select 1 from public.members where id=p_member and church_id=p_church and archived_at is null) then raise exception 'member_unavailable' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('service-signup-member:'||p_church||':'||p_member::text,0));
 -- Lock all potentially selected positions in a stable order before assigning grouped roles.
 perform 1 from public.service_signup_slots sl where sl.church_id=p_church and sl.season_id=p_season and sl.service_date in (select (c->>'service_date')::date from jsonb_array_elements(p_choices)c) order by sl.id for update;
 for v_choice in select value from jsonb_array_elements(p_choices) order by value->>'service_date' loop
  v_keys:=case v_choice->>'role_key' when 'keyboard' then array['keyboard_1','keyboard_2'] when 'singer' then array['singer_1','singer_2','singer_3'] when 'welcome' then array['welcome_1','welcome_2'] else array[v_choice->>'role_key'] end;
  v_slot:=null;
  select * into v_existing from public.service_signup_registrations where church_id=p_church and member_id=p_member and service_date=(v_choice->>'service_date')::date and status in ('registered','confirmed','waitlisted','offered');
  if found then
   if not exists(select 1 from public.service_signup_slots sl where sl.id=v_existing.slot_id and sl.season_id=p_season and sl.role_key=any(v_keys)) then raise exception 'one_service_per_sunday' using errcode='23505';end if;
   v_slot:=v_existing.slot_id;
  else
   select sl.id into v_slot from public.service_signup_slots sl
   where sl.church_id=p_church and sl.season_id=p_season and sl.service_date=(v_choice->>'service_date')::date and sl.role_key=any(v_keys) and sl.is_open
    and exists(select 1 from jsonb_array_elements(v_admin->'slots') a where (a->>'id')::bigint=sl.id)
   order by ((select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed','offered'))<sl.capacity) desc,
    (select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed','offered')),sl.id limit 1;
  end if;
  if v_slot is null then raise exception 'slot_unavailable' using errcode='22023';end if;
  v_result:=public.service_signup_admin_register(p_church,v_slot,p_member);
  v_results:=v_results||jsonb_build_array(v_result||jsonb_build_object('slot_id',v_slot,'service_date',v_choice->>'service_date','role_key',v_choice->>'role_key'));
 end loop;
 return jsonb_build_object('registrations',v_results);
end $$;
revoke all on function public.service_signup_admin_register_batch(text,bigint,bigint,jsonb) from public,anon;
grant execute on function public.service_signup_admin_register_batch(text,bigint,bigint,jsonb) to authenticated;
