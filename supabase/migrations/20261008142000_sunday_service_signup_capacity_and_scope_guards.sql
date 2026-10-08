-- Capacity checks must include outstanding offers, and scoped leaders need an M+ schedule grant.
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

create or replace function public.service_signup_accept_offer(p_church text,p_channel text,p_subject text,p_registration bigint,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member bigint;v_row public.service_signup_registrations%rowtype;v_next jsonb;
begin
  select b.member_id into v_member from church_auth.member_bindings b where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501'; end if;
  select * into v_row from public.service_signup_registrations where id=p_registration and church_id=p_church and member_id=v_member and status='offered' for update;
  if not found or v_row.offer_expires_at<=now() then raise exception 'offer_expired' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-signup:'||v_row.slot_id::text,0));
  if p_accept then update public.service_signup_registrations set status='registered',offered_queue_number=null,offer_expires_at=null,updated_at=now() where id=v_row.id;return jsonb_build_object('accepted',true,'slot_id',v_row.slot_id);end if;
  update public.service_signup_registrations set status='declined',offered_queue_number=null,offer_expires_at=null,updated_at=now() where id=v_row.id;
  v_next:=public.service_signup_offer_next(v_row.slot_id);return jsonb_build_object('accepted',false,'next_offer',v_next);
end $$;

create or replace function public.set_service_signup_scopes(p_user uuid,p_church text,p_ministries text[])
returns boolean language plpgsql security definer set search_path='' as $$
declare v_ministry text;
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'forbidden'; end if;
  if p_church not in ('M+','SHiNE') or not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
    or (cardinality(coalesce(p_ministries,'{}'))>0 and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id=p_church and g.permission='schedules')) then raise exception 'invalid_account'; end if;
  if exists(select 1 from unnest(coalesce(p_ministries,'{}')) x where x not in ('media','worship','welcome','children','all')) then raise exception 'invalid_scope'; end if;
  if 'all'=any(coalesce(p_ministries,'{}')) and cardinality(coalesce(p_ministries,'{}'))>1 then raise exception 'invalid_scope'; end if;
  delete from church_auth.service_ministry_scopes where user_id=p_user and church_id=p_church;
  foreach v_ministry in array coalesce(p_ministries,'{}') loop insert into church_auth.service_ministry_scopes(user_id,church_id,ministry_key) values(p_user,p_church,v_ministry);end loop;
  return true;
end $$;

create or replace function public.get_service_signup_admin(p_church text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_scopes text[];v_manage boolean;
begin
  if auth.uid() is null or not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active) then raise exception 'forbidden'; end if;
  v_manage:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false);
  select coalesce(array_agg(s.ministry_key),'{}') into v_scopes from church_auth.service_ministry_scopes s where s.user_id=auth.uid() and s.church_id=p_church;
  if not v_manage and cardinality(v_scopes)=0 then raise exception 'forbidden'; end if;
  return jsonb_build_object('can_manage',v_manage,'scopes',to_jsonb(v_scopes),
    'seasons',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'starts_on',s.starts_on,'ends_on',s.ends_on,'status',s.status,'opens_at',s.opens_at,'closes_at',s.closes_at) order by s.starts_on desc) from public.service_signup_seasons s where s.church_id=p_church),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(jsonb_build_object('id',sl.id,'season_id',sl.season_id,'service_date',sl.service_date,'ministry_key',sl.ministry_key,'role_key',sl.role_key,'capacity',sl.capacity,'is_open',sl.is_open,
      'registrations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'name',m.name,'status',r.status,'queue_number',r.queue_number,'created_at',r.created_at) order by case r.status when 'confirmed' then 0 when 'registered' then 1 when 'offered' then 2 else 3 end,r.queue_number,r.created_at)
        from public.service_signup_registrations r join public.members m on m.id=r.member_id where r.slot_id=sl.id and r.status in ('registered','waitlisted','offered','confirmed')),'[]'::jsonb))
      order by sl.service_date,sl.ministry_key,sl.role_key) from public.service_signup_slots sl where sl.church_id=p_church and (v_manage or 'all'=any(v_scopes) or sl.ministry_key=any(v_scopes))),'[]'::jsonb));
end $$;
