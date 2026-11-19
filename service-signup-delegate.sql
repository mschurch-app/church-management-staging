-- Staff-assisted registration uses real member IDs and never creates a LINE identity.
set local lock_timeout='3s';
alter table public.service_signup_registrations add column if not exists registered_by uuid references auth.users(id);
alter table public.service_signup_registrations alter column line_subject drop not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.service_signup_registrations'::regclass and conname='service_signup_registration_identity') then
  alter table public.service_signup_registrations add constraint service_signup_registration_identity check(line_subject is not null or registered_by is not null);
 end if;
end $$;

create or replace function public.service_signup_admin_register(p_church text,p_slot bigint,p_member bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin jsonb;v_slot public.service_signup_slots%rowtype;v_season public.service_signup_seasons%rowtype;
 v_row public.service_signup_registrations%rowtype;v_taken int;v_queue int;v_status text;v_id bigint;v_subject text;
begin
 v_admin:=public.get_service_signup_admin(p_church);
 if not exists(select 1 from jsonb_array_elements(v_admin->'slots') s where (s->>'id')::bigint=p_slot) then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.members where id=p_member and church_id=p_church and archived_at is null) then raise exception 'member_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('service-signup-member:'||p_church||':'||p_member::text,0));
 select * into v_slot from public.service_signup_slots where id=p_slot and church_id=p_church for update;
 select * into v_season from public.service_signup_seasons where id=v_slot.season_id and church_id=p_church for share;
 select * into v_row from public.service_signup_registrations where church_id=p_church and member_id=p_member and service_date=v_slot.service_date and status in ('registered','confirmed','waitlisted','offered');
 if found then
  if v_row.slot_id<>p_slot then raise exception 'one_service_per_sunday' using errcode='23505'; end if;
  return jsonb_build_object('id',v_row.id,'status',v_row.status,'queue_number',v_row.queue_number,'already_registered',true);
 end if;
 if v_slot.id is null or not v_slot.is_open or v_season.status is distinct from 'open' or v_slot.service_date<(now() at time zone 'Asia/Taipei')::date or (v_season.opens_at is not null and v_season.opens_at>now()) or (v_season.closes_at is not null and v_season.closes_at<=now()) then raise exception 'slot_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('service-signup:'||p_slot::text,0));
 select count(*) into v_taken from public.service_signup_registrations where slot_id=p_slot and status in ('registered','confirmed','offered');
 if v_taken<v_slot.capacity then v_status:='registered';v_queue:=null;
 else
  v_status:='waitlisted';
  select coalesce(max(greatest(coalesce(queue_number,0),coalesce(offered_queue_number,0))),0)+1 into v_queue from public.service_signup_registrations where slot_id=p_slot;
 end if;
 select line_subject into v_subject from church_auth.member_bindings where church_id=p_church and member_id=p_member and active limit 1;
 insert into public.service_signup_registrations(slot_id,season_id,church_id,service_date,member_id,line_subject,status,queue_number,registered_by)
 values(p_slot,v_slot.season_id,p_church,v_slot.service_date,p_member,v_subject,v_status,v_queue,auth.uid())
 on conflict(slot_id,member_id) do update set status=excluded.status,queue_number=excluded.queue_number,registered_by=excluded.registered_by,offered_queue_number=null,offer_expires_at=null,cancelled_at=null,updated_at=now()
 returning id into v_id;
 return jsonb_build_object('id',v_id,'status',v_status,'queue_number',v_queue,'already_registered',false);
end $$;

create or replace function public.service_signup_admin_accept_offer(p_church text,p_registration bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin jsonb;v_row public.service_signup_registrations%rowtype;
begin
 v_admin:=public.get_service_signup_admin(p_church);
 select * into v_row from public.service_signup_registrations where id=p_registration and church_id=p_church for update;
 if v_row.id is null or v_row.registered_by is null or not exists(select 1 from jsonb_array_elements(v_admin->'slots') s where (s->>'id')::bigint=v_row.slot_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if v_row.status in ('registered','confirmed') then return jsonb_build_object('status',v_row.status,'already_accepted',true); end if;
 if v_row.status<>'offered' or v_row.offer_expires_at is null or v_row.offer_expires_at<=now() then raise exception 'offer_expired' using errcode='22023'; end if;
 update public.service_signup_registrations set status='registered',offered_queue_number=null,offer_expires_at=null,updated_at=now() where id=v_row.id;
 return jsonb_build_object('status','registered','already_accepted',false);
end $$;
revoke all on function public.service_signup_admin_register(text,bigint,bigint),public.service_signup_admin_accept_offer(text,bigint) from public,anon;
grant execute on function public.service_signup_admin_register(text,bigint,bigint),public.service_signup_admin_accept_offer(text,bigint) to authenticated;

-- Extend the existing authorized read model with provenance only.
do $$ declare source text;begin
 source:=pg_get_functiondef('public.get_service_signup_admin(text)'::regprocedure);
 if strpos(source,'''registered_by'',r.registered_by')=0 then
  if strpos(source,'''created_at'',r.created_at)')=0 then raise exception 'admin_read_model_changed'; end if;
  source:=replace(source,'''created_at'',r.created_at)','''created_at'',r.created_at,''registered_by'',r.registered_by)');
  execute source;
 end if;
end $$;
