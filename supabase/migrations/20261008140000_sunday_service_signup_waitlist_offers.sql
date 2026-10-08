-- Waitlist members receive an expiring offer and must accept it before the slot is theirs.
alter table public.service_signup_registrations
  drop constraint if exists service_signup_registrations_status_check,
  add constraint service_signup_registrations_status_check
    check (status in ('registered','waitlisted','offered','confirmed','cancelled','declined')),
  drop constraint if exists service_signup_registrations_check,
  add constraint service_signup_registrations_check
    check ((status = 'waitlisted') = (queue_number is not null));
alter table public.service_signup_registrations
  add column if not exists offer_expires_at timestamptz,
  add column if not exists offered_queue_number integer;
create index if not exists service_signup_offer_expiry_idx
  on public.service_signup_registrations(offer_expires_at)
  where status = 'offered';

create or replace function public.service_signup_offer_next(p_slot bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.service_signup_registrations%rowtype; v_capacity integer; v_taken integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||p_slot::text,0));
  update public.service_signup_registrations
    set status='waitlisted', queue_number=offered_queue_number, offered_queue_number=null,
      offer_expires_at=null, updated_at=now()
    where slot_id=p_slot and status='offered' and offer_expires_at<=now();
  select capacity into v_capacity from public.service_signup_slots where id=p_slot for update;
  if not found then return null; end if;
  select count(*) into v_taken from public.service_signup_registrations
    where slot_id=p_slot and status in ('registered','confirmed','offered');
  if v_taken>=v_capacity then return null; end if;
  select * into v_row from public.service_signup_registrations
    where slot_id=p_slot and status='waitlisted' order by queue_number,created_at
    for update skip locked limit 1;
  if not found then return null; end if;
  update public.service_signup_registrations set status='offered',queue_number=null,
    offered_queue_number=v_row.queue_number,offer_expires_at=now()+interval '24 hours',updated_at=now() where id=v_row.id
    returning * into v_row;
  return jsonb_build_object('registration_id',v_row.id,'line_subject',v_row.line_subject,
    'expires_at',v_row.offer_expires_at);
end $$;

create or replace function public.service_signup_accept_offer(
  p_church text,p_channel text,p_subject text,p_registration bigint,p_accept boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;v_row public.service_signup_registrations%rowtype;v_next jsonb;
begin
  select b.member_id into v_member from church_auth.member_bindings b
    where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501'; end if;
  select * into v_row from public.service_signup_registrations
    where id=p_registration and church_id=p_church and member_id=v_member and status='offered' for update;
  if not found or v_row.offer_expires_at<=now() then raise exception 'offer_expired' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||v_row.slot_id::text,0));
  if p_accept then
    update public.service_signup_registrations set status='registered',offered_queue_number=null,offer_expires_at=null,updated_at=now() where id=v_row.id;
    return jsonb_build_object('accepted',true,'slot_id',v_row.slot_id);
  end if;
  update public.service_signup_registrations set status='declined',offered_queue_number=null,offer_expires_at=null,updated_at=now() where id=v_row.id;
  v_next:=public.service_signup_offer_next(v_row.slot_id);
  return jsonb_build_object('accepted',false,'next_offer',v_next);
end $$;

create or replace function public.service_signup_register(p_church text,p_channel text,p_subject text,p_slot bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;v_slot public.service_signup_slots%rowtype;v_taken integer;v_queue integer;v_status text;v_registration bigint;
begin
  if p_church not in ('M+','SHiNE') or p_channel !~ '^[0-9]+$' or p_subject !~ '^U[0-9a-f]{32}$' then raise exception 'invalid_identity' using errcode='22023'; end if;
  select b.member_id into v_member from church_auth.member_bindings b join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
    where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||p_slot::text,0));
  select sl.* into v_slot from public.service_signup_slots sl join public.service_signup_seasons s on s.id=sl.season_id
    where sl.id=p_slot and sl.church_id=p_church and sl.is_open and s.status='open' and (s.opens_at is null or s.opens_at<=now()) and (s.closes_at is null or s.closes_at>now()) for update;
  if not found then raise exception 'slot_unavailable' using errcode='22023'; end if;
  if exists(select 1 from public.service_signup_registrations r where r.church_id=p_church and r.member_id=v_member and r.service_date=v_slot.service_date and r.status in ('registered','waitlisted','offered','confirmed')) then raise exception 'one_service_per_sunday' using errcode='23505'; end if;
  select count(*) into v_taken from public.service_signup_registrations r where r.slot_id=p_slot and r.status in ('registered','confirmed','offered');
  if v_taken<v_slot.capacity then v_status:='registered';v_queue:=null; else v_status:='waitlisted';
    select coalesce(max(greatest(coalesce(r.queue_number,0),coalesce(r.offered_queue_number,0))),0)+1 into v_queue from public.service_signup_registrations r where r.slot_id=p_slot;
  end if;
  insert into public.service_signup_registrations(slot_id,season_id,church_id,service_date,member_id,line_subject,status,queue_number)
    values(p_slot,v_slot.season_id,p_church,v_slot.service_date,v_member,p_subject,v_status,v_queue)
    on conflict(slot_id,member_id) do update set status=excluded.status,queue_number=excluded.queue_number,offered_queue_number=null,offer_expires_at=null,cancelled_at=null,updated_at=now()
    returning id into v_registration;
  return jsonb_build_object('id',v_registration,'status',v_status,'queue_number',v_queue);
end $$;

create or replace function public.service_signup_member_view(
  p_church text,p_channel text,p_subject text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;v_result jsonb;v_issued jsonb:='[]'::jsonb;v_offer jsonb;v_slot record;
begin
  if p_church not in ('M+','SHiNE') or p_channel !~ '^[0-9]+$' or p_subject !~ '^U[0-9a-f]{32}$' then raise exception 'invalid_identity' using errcode='22023'; end if;
  select b.member_id into v_member from church_auth.member_bindings b join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
    where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then return jsonb_build_object('binding_status','required','seasons','[]'::jsonb,'registrations','[]'::jsonb); end if;
  for v_slot in select sl.id from public.service_signup_slots sl join public.service_signup_seasons s on s.id=sl.season_id
    where sl.church_id=p_church and s.status='open' and (s.closes_at is null or s.closes_at>now()) loop
    v_offer:=public.service_signup_offer_next(v_slot.id);
    if v_offer is not null then v_issued:=v_issued||jsonb_build_array(v_offer); end if;
  end loop;
  select jsonb_build_object('binding_status','approved','member',jsonb_build_object('id',m.id,'name',m.name,'group_name',m.group_name),
    'seasons',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'starts_on',s.starts_on,'ends_on',s.ends_on,
      'slots',coalesce((select jsonb_agg(jsonb_build_object('id',sl.id,'service_date',sl.service_date,'ministry_key',sl.ministry_key,'role_key',sl.role_key,'capacity',sl.capacity,
      'registered_count',(select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status in ('registered','confirmed','offered')),
      'waitlist_count',(select count(*) from public.service_signup_registrations r where r.slot_id=sl.id and r.status='waitlisted')) order by sl.service_date,sl.ministry_key,sl.role_key)
      from public.service_signup_slots sl where sl.season_id=s.id and sl.is_open),'[]'::jsonb)) order by s.starts_on)
      from public.service_signup_seasons s where s.church_id=p_church and s.status='open' and (s.opens_at is null or s.opens_at<=now()) and (s.closes_at is null or s.closes_at>now())),'[]'::jsonb),
    'registrations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'slot_id',r.slot_id,'service_date',r.service_date,'status',r.status,'queue_number',r.queue_number,'offer_expires_at',r.offer_expires_at)
      order by r.service_date) from public.service_signup_registrations r where r.church_id=p_church and r.member_id=v_member and r.status in ('registered','waitlisted','offered','confirmed')),'[]'::jsonb))
    into v_result from public.members m where m.id=v_member;
  return v_result||jsonb_build_object('issued_offers',v_issued);
end $$;

create or replace function public.service_signup_cancel(p_church text,p_channel text,p_subject text,p_registration bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;v_row public.service_signup_registrations%rowtype;v_offer jsonb;
begin
  select b.member_id into v_member from church_auth.member_bindings b where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501'; end if;
  select * into v_row from public.service_signup_registrations where id=p_registration and church_id=p_church and member_id=v_member and status in ('registered','waitlisted','offered','confirmed') for update;
  if not found then raise exception 'registration_unavailable' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||v_row.slot_id::text,0));
  update public.service_signup_registrations set status='cancelled',queue_number=null,offered_queue_number=null,offer_expires_at=null,cancelled_at=now(),updated_at=now() where id=v_row.id;
  if v_row.status in ('registered','confirmed','offered') then v_offer:=public.service_signup_offer_next(v_row.slot_id); end if;
  return jsonb_build_object('cancelled',true,'next_offer',v_offer);
end $$;

revoke all on function public.service_signup_offer_next(bigint),public.service_signup_accept_offer(text,text,text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.service_signup_offer_next(bigint),public.service_signup_accept_offer(text,text,text,bigint,boolean) to service_role;
revoke all on function public.service_signup_member_view(text,text,text),public.service_signup_register(text,text,text,bigint),public.service_signup_cancel(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.service_signup_member_view(text,text,text),public.service_signup_register(text,text,text,bigint),public.service_signup_cancel(text,text,text,bigint) to service_role;
