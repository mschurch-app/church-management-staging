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
do $tests$ declare r jsonb;begin
 r:=pg_temp.service_signup_admin_register('M+',1,1);
 if r->>'status'<>'registered' then raise exception 'registration failed';end if;
 if (select line_subject is not null or registered_by is null from pg_temp.service_signup_registrations where id=(r->>'id')::bigint) then raise exception 'fake identity or missing audit';end if;
 r:=pg_temp.service_signup_admin_register('M+',1,1);if r->>'already_registered'<>'true' then raise exception 'not idempotent';end if;
 if (select count(*) from pg_temp.service_signup_registrations)<>1 then raise exception 'duplicate';end if;
 r:=pg_temp.service_signup_admin_register('M+',1,2);if r->>'status'<>'waitlisted' or r->>'queue_number'<>'1' then raise exception 'capacity waitlist failed';end if;
 begin perform pg_temp.service_signup_admin_register('M+',2,1);raise exception 'same day allowed';exception when unique_violation then null;end;
 begin perform pg_temp.service_signup_admin_register('M+',3,3);raise exception 'cross church allowed';exception when invalid_parameter_value then null;end;
 begin perform pg_temp.service_signup_admin_register('M+',3,5);raise exception 'archived member allowed';exception when invalid_parameter_value then null;end;
 perform set_config('codex.delegate_scope','media',true);
 begin perform pg_temp.service_signup_admin_register('M+',2,4);raise exception 'out of scope allowed';exception when insufficient_privilege then null;end;
 perform set_config('codex.delegate_scope','denied',true);
 begin perform pg_temp.service_signup_admin_register('M+',3,4);raise exception 'revoked allowed';exception when insufficient_privilege then null;end;
 perform set_config('codex.delegate_scope','all',true);
 update pg_temp.service_signup_slots set is_open=false where id=3;
 begin perform pg_temp.service_signup_admin_register('M+',3,4);raise exception 'closed slot allowed';exception when invalid_parameter_value then null;end;
 update pg_temp.service_signup_slots set service_date='2020-01-05' where id=4;
 begin perform pg_temp.service_signup_admin_register('M+',4,4);raise exception 'past date allowed';exception when invalid_parameter_value then null;end;
 update pg_temp.service_signup_registrations set status='offered',offered_queue_number=queue_number,queue_number=null,offer_expires_at=now()+interval '1 hour' where member_id=2;
 r:=pg_temp.service_signup_admin_accept_offer('M+',(select id from pg_temp.service_signup_registrations where member_id=2));
 if r->>'status'<>'registered' then raise exception 'assisted offer failed';end if;
 r:=pg_temp.service_signup_admin_accept_offer('M+',(select id from pg_temp.service_signup_registrations where member_id=2));
 if r->>'already_accepted'<>'true' then raise exception 'offer not idempotent';end if;
end $tests$;
select 'PASS: no-LINE register and audit, idempotency, capacity waitlist, same-day conflict, cross-church, archived member, scopes, revoked, closed, past-date, assisted offer and replay; temp tables only' result;
rollback;
