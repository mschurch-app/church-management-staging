begin;
create temporary table members(id bigint primary key,church_id text,archived_at timestamptz);
create temporary table member_bindings(member_id bigint,church_id text,line_subject text,active boolean);
create temporary table service_signup_seasons(like public.service_signup_seasons including all);
create temporary table service_signup_slots(like public.service_signup_slots including all);
create temporary table service_signup_registrations(like public.service_signup_registrations including all);
alter table service_signup_registrations add column if not exists registered_by uuid;
alter table service_signup_registrations alter column line_subject drop not null;
alter table service_signup_registrations add check(line_subject is not null or registered_by is not null);
create function pg_temp.get_service_signup_admin(p_church text) returns jsonb language plpgsql as $stub$
begin
 if auth.uid() is null or current_setting('codex.delegate_scope',true)='denied' then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object('slots',(select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]') from pg_temp.service_signup_slots where church_id=p_church and (current_setting('codex.delegate_scope',true)='all' or ministry_key=current_setting('codex.delegate_scope',true))));
end $stub$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099"}',true),set_config('codex.delegate_scope','all',true);
insert into pg_temp.members values(1,'M+',null),(2,'M+',null),(3,'SHiNE',null),(4,'M+',null),(5,'M+',now());
insert into pg_temp.service_signup_seasons(id,church_id,title,starts_on,ends_on,status,created_by) overriding system value values(1,'M+','隔離期別','2027-01-01','2027-02-28','open','00000000-0000-4000-8000-000000000099');
insert into pg_temp.service_signup_slots(id,season_id,church_id,service_date,ministry_key,role_key) overriding system value values(1,1,'M+','2027-01-03','media','sound'),(2,1,'M+','2027-01-03','worship','guitar'),(3,1,'M+','2027-01-10','media','sound'),(4,1,'M+','2027-01-17','media','sound');
create or replace function pg_temp.service_signup_admin_register(p_church text,p_slot bigint,p_member bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin jsonb;v_slot pg_temp.service_signup_slots%rowtype;v_season pg_temp.service_signup_seasons%rowtype;
 v_row pg_temp.service_signup_registrations%rowtype;v_taken int;v_queue int;v_status text;v_id bigint;v_subject text;
begin
 v_admin:=pg_temp.get_service_signup_admin(p_church);
 if not exists(select 1 from jsonb_array_elements(v_admin->'slots') s where (s->>'id')::bigint=p_slot) then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from pg_temp.members where id=p_member and church_id=p_church and archived_at is null) then raise exception 'member_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('service-signup-member:'||p_church||':'||p_member::text,0));
 select * into v_slot from pg_temp.service_signup_slots where id=p_slot and church_id=p_church for update;
 select * into v_season from pg_temp.service_signup_seasons where id=v_slot.season_id and church_id=p_church for share;
 select * into v_row from pg_temp.service_signup_registrations where church_id=p_church and member_id=p_member and service_date=v_slot.service_date and status in ('registered','confirmed','waitlisted','offered');
 if found then
  if v_row.slot_id<>p_slot then raise exception 'one_service_per_sunday' using errcode='23505'; end if;
  return jsonb_build_object('id',v_row.id,'status',v_row.status,'queue_number',v_row.queue_number,'already_registered',true);
 end if;
 if v_slot.id is null or not v_slot.is_open or v_season.status is distinct from 'open' or v_slot.service_date<(now() at time zone 'Asia/Taipei')::date or (v_season.opens_at is not null and v_season.opens_at>now()) or (v_season.closes_at is not null and v_season.closes_at<=now()) then raise exception 'slot_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('service-signup:'||p_slot::text,0));
 select count(*) into v_taken from pg_temp.service_signup_registrations where slot_id=p_slot and status in ('registered','confirmed','offered');
 if v_taken<v_slot.capacity then v_status:='registered';v_queue:=null;
 else
  v_status:='waitlisted';
  select coalesce(max(greatest(coalesce(queue_number,0),coalesce(offered_queue_number,0))),0)+1 into v_queue from pg_temp.service_signup_registrations where slot_id=p_slot;
 end if;
 select line_subject into v_subject from pg_temp.member_bindings where church_id=p_church and member_id=p_member and active limit 1;
 insert into pg_temp.service_signup_registrations(slot_id,season_id,church_id,service_date,member_id,line_subject,status,queue_number,registered_by)
 values(p_slot,v_slot.season_id,p_church,v_slot.service_date,p_member,v_subject,v_status,v_queue,auth.uid())
 on conflict(slot_id,member_id) do update set status=excluded.status,queue_number=excluded.queue_number,registered_by=excluded.registered_by,offered_queue_number=null,offer_expires_at=null,cancelled_at=null,updated_at=now()
 returning id into v_id;
 return jsonb_build_object('id',v_id,'status',v_status,'queue_number',v_queue,'already_registered',false);
end $$;
create or replace function pg_temp.service_signup_admin_accept_offer(p_church text,p_registration bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin jsonb;v_row pg_temp.service_signup_registrations%rowtype;
begin
 v_admin:=pg_temp.get_service_signup_admin(p_church);
 select * into v_row from pg_temp.service_signup_registrations where id=p_registration and church_id=p_church for update;
 if v_row.id is null or v_row.registered_by is null or not exists(select 1 from jsonb_array_elements(v_admin->'slots') s where (s->>'id')::bigint=v_row.slot_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if v_row.status in ('registered','confirmed') then return jsonb_build_object('status',v_row.status,'already_accepted',true); end if;
 if v_row.status<>'offered' or v_row.offer_expires_at is null or v_row.offer_expires_at<=now() then raise exception 'offer_expired' using errcode='22023'; end if;
 update pg_temp.service_signup_registrations set status='registered',offered_queue_number=null,offer_expires_at=null,updated_at=now() where id=v_row.id;
 return jsonb_build_object('status','registered','already_accepted',false);
end $$;
create or replace function pg_temp.service_signup_admin_register_batch(p_church text,p_season bigint,p_member bigint,p_choices jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin jsonb;v_choice jsonb;v_keys text[];v_slot bigint;v_existing pg_temp.service_signup_registrations%rowtype;v_result jsonb;v_results jsonb:='[]';
begin
 v_admin:=pg_temp.get_service_signup_admin(p_church);
 if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'invalid_choices' using errcode='22023';end if;
 if jsonb_array_length(p_choices) not between 1 and 60 then raise exception 'invalid_choices' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_choices) c group by c->>'service_date' having count(*)>1) then raise exception 'duplicate_service_date' using errcode='23505';end if;
 if not exists(select 1 from pg_temp.members where id=p_member and church_id=p_church and archived_at is null) then raise exception 'member_unavailable' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('service-signup-member:'||p_church||':'||p_member::text,0));
 -- Lock all potentially selected positions in a stable order before assigning grouped roles.
 perform 1 from pg_temp.service_signup_slots sl where sl.church_id=p_church and sl.season_id=p_season and sl.service_date in (select (c->>'service_date')::date from jsonb_array_elements(p_choices)c) order by sl.id for update;
 for v_choice in select value from jsonb_array_elements(p_choices) order by value->>'service_date' loop
  v_keys:=case v_choice->>'role_key' when 'keyboard' then array['keyboard_1','keyboard_2'] when 'singer' then array['singer_1','singer_2','singer_3'] when 'welcome' then array['welcome_1','welcome_2'] else array[v_choice->>'role_key'] end;
  v_slot:=null;
  select * into v_existing from pg_temp.service_signup_registrations where church_id=p_church and member_id=p_member and service_date=(v_choice->>'service_date')::date and status in ('registered','confirmed','waitlisted','offered');
  if found then
   if not exists(select 1 from pg_temp.service_signup_slots sl where sl.id=v_existing.slot_id and sl.season_id=p_season and sl.role_key=any(v_keys)) then raise exception 'one_service_per_sunday' using errcode='23505';end if;
   v_slot:=v_existing.slot_id;
  else
   select sl.id into v_slot from pg_temp.service_signup_slots sl
   where sl.church_id=p_church and sl.season_id=p_season and sl.service_date=(v_choice->>'service_date')::date and sl.role_key=any(v_keys) and sl.is_open
    and exists(select 1 from jsonb_array_elements(v_admin->'slots') a where (a->>'id')::bigint=sl.id)
   order by ((select count(*) from pg_temp.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed','offered'))<sl.capacity) desc,
    (select count(*) from pg_temp.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed','offered')),sl.id limit 1;
  end if;
  if v_slot is null then raise exception 'slot_unavailable' using errcode='22023';end if;
  v_result:=pg_temp.service_signup_admin_register(p_church,v_slot,p_member);
  v_results:=v_results||jsonb_build_array(v_result||jsonb_build_object('slot_id',v_slot,'service_date',v_choice->>'service_date','role_key',v_choice->>'role_key'));
 end loop;
 return jsonb_build_object('registrations',v_results);
end $$;
insert into pg_temp.members values (6,'M+',null),(7,'M+',null);
insert into pg_temp.service_signup_slots(id,season_id,church_id,service_date,ministry_key,role_key) overriding system value values(5,1,'M+','2027-01-24','welcome','welcome_1'),(6,1,'M+','2027-01-24','welcome','welcome_2');
do $tests$ declare r jsonb;batch jsonb:='[{"role_key":"sound","service_date":"2027-01-03"},{"role_key":"sound","service_date":"2027-01-10"}]';n int;begin
 r:=pg_temp.service_signup_admin_register_batch('M+',1,1,batch);
 if jsonb_array_length(r->'registrations')<>2 or exists(select 1 from jsonb_array_elements(r->'registrations')item where item->>'status'<>'registered') then raise exception 'batch failed';end if;
 r:=pg_temp.service_signup_admin_register_batch('M+',1,1,batch);
 if (select count(*) from pg_temp.service_signup_registrations)<>2 then raise exception 'duplicate batch';end if;
 r:=pg_temp.service_signup_admin_register_batch('M+',1,2,batch);
 if exists(select 1 from jsonb_array_elements(r->'registrations')item where item->>'status'<>'waitlisted') then raise exception 'batch waitlist failed';end if;
 n:=(select count(*) from pg_temp.service_signup_registrations);
 begin
  perform pg_temp.service_signup_admin_register_batch('M+',1,4,'[{"role_key":"sound","service_date":"2027-01-17"},{"role_key":"sound","service_date":"2027-02-07"}]');
  raise exception 'partial request accepted';
 exception when invalid_parameter_value then null;end;
 if (select count(*) from pg_temp.service_signup_registrations)<>n then raise exception 'partial rows persisted';end if;
 begin perform pg_temp.service_signup_admin_register_batch('M+',1,4,'[{"role_key":"sound","service_date":"2027-01-03"},{"role_key":"guitar","service_date":"2027-01-03"}]');raise exception 'duplicate dates allowed';exception when unique_violation then null;end;
 begin perform pg_temp.service_signup_admin_register_batch('M+',1,3,batch);raise exception 'cross church allowed';exception when invalid_parameter_value then null;end;
 perform set_config('codex.delegate_scope','media',true);
 begin perform pg_temp.service_signup_admin_register_batch('M+',1,4,'[{"role_key":"guitar","service_date":"2027-01-03"}]');raise exception 'scope leak';exception when invalid_parameter_value then null;end;
 perform set_config('codex.delegate_scope','all',true);
 r:=pg_temp.service_signup_admin_register_batch('M+',1,4,'[{"role_key":"welcome","service_date":"2027-01-24"}]');
 if r->'registrations'->0->>'slot_id'<>'5' then raise exception 'group assignment first slot';end if;
 r:=pg_temp.service_signup_admin_register_batch('M+',1,6,'[{"role_key":"welcome","service_date":"2027-01-24"}]');
 if r->'registrations'->0->>'slot_id'<>'6' or r->'registrations'->0->>'status'<>'registered' then raise exception 'group capacity not used';end if;
 r:=pg_temp.service_signup_admin_register_batch('M+',1,7,'[{"role_key":"welcome","service_date":"2027-01-24"}]');
 if r->'registrations'->0->>'status'<>'waitlisted' then raise exception 'group waitlist';end if;
 if exists(select 1 from pg_temp.service_signup_registrations where line_subject is not null or registered_by is null) then raise exception 'identity audit mismatch';end if;
end $tests$;
select 'PASS: atomic multi-date batch, idempotent replay, mixed capacity waitlist, rollback of earlier choice on later failure, same-day conflict, church and ministry scope, grouped numbered capacity; no production writes' result;
rollback;
