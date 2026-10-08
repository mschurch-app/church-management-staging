create or replace function public.service_signup_offer_next(p_slot bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.service_signup_registrations%rowtype;v_capacity integer;v_taken integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||p_slot::text,0));
  update public.service_signup_registrations set status='declined',queue_number=null,offered_queue_number=null,offer_expires_at=null,updated_at=now()
    where slot_id=p_slot and status='offered' and offer_expires_at<=now();
  select capacity into v_capacity from public.service_signup_slots where id=p_slot for update;
  if not found then return null; end if;
  select count(*) into v_taken from public.service_signup_registrations where slot_id=p_slot and status in ('registered','confirmed','offered');
  if v_taken>=v_capacity then return null; end if;
  select * into v_row from public.service_signup_registrations where slot_id=p_slot and status='waitlisted' order by queue_number,created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.service_signup_registrations set status='offered',queue_number=null,offered_queue_number=v_row.queue_number,offer_expires_at=now()+interval '24 hours',updated_at=now() where id=v_row.id returning * into v_row;
  return jsonb_build_object('registration_id',v_row.id,'line_subject',v_row.line_subject,'expires_at',v_row.offer_expires_at);
end $$;

create or replace function public.update_service_signup_slot(p_church text,p_slot bigint,p_capacity integer,p_open boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_ministry text;v_manage boolean;v_allowed boolean;v_reserved integer;
begin
  select ministry_key into v_ministry from public.service_signup_slots where id=p_slot and church_id=p_church;
  v_manage:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false);
  v_allowed:=v_manage or exists(select 1 from church_auth.service_ministry_scopes s where s.user_id=auth.uid() and s.church_id=p_church and s.ministry_key in ('all',v_ministry));
  if not v_allowed then raise exception 'forbidden'; end if;
  if p_capacity not between 1 and 20 then raise exception 'invalid_capacity'; end if;
  select count(*) into v_reserved from public.service_signup_registrations where slot_id=p_slot and status in ('registered','confirmed','offered');
  if p_capacity<v_reserved then raise exception 'capacity_below_reserved'; end if;
  update public.service_signup_slots set capacity=p_capacity,is_open=p_open,updated_at=now() where id=p_slot and church_id=p_church;
  return found;
end $$;
