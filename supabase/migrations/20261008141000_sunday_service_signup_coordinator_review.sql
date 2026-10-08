drop index if exists public.service_signup_one_role_per_sunday;
create unique index service_signup_one_role_per_sunday
  on public.service_signup_registrations(church_id,member_id,service_date)
  where status in ('registered','waitlisted','offered','confirmed');

create or replace function public.service_signup_review_registration(
  p_church text,p_registration bigint,p_status text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.service_signup_registrations%rowtype;v_scope text[];v_allowed boolean;v_offer jsonb;
begin
  if p_status not in ('confirmed','declined') then raise exception 'invalid_status'; end if;
  if auth.uid() is null or not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active) then raise exception 'forbidden'; end if;
  select * into v_row from public.service_signup_registrations where id=p_registration and church_id=p_church and status='registered' for update;
  if not found then raise exception 'registration_unavailable'; end if;
  select coalesce(array_agg(s.ministry_key),'{}') into v_scope from church_auth.service_ministry_scopes s where s.user_id=auth.uid() and s.church_id=p_church;
  v_allowed:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid())
    or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false)
    or exists(select 1 from church_auth.service_ministry_scopes s join public.service_signup_slots sl on sl.id=v_row.slot_id
      where s.user_id=auth.uid() and s.church_id=p_church and s.ministry_key in ('all',sl.ministry_key));
  if not v_allowed then raise exception 'forbidden'; end if;
  update public.service_signup_registrations set status=p_status,updated_at=now() where id=v_row.id;
  if p_status='declined' then v_offer:=public.service_signup_offer_next(v_row.slot_id); end if;
  return jsonb_build_object('status',p_status,'next_offer',v_offer);
end $$;
revoke all on function public.service_signup_review_registration(text,bigint,text) from public,anon;
grant execute on function public.service_signup_review_registration(text,bigint,text) to authenticated,service_role;

create or replace function public.set_service_signup_scopes(p_user uuid,p_church text,p_ministries text[])
returns boolean language plpgsql security definer set search_path='' as $$
declare v_ministry text;
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'forbidden'; end if;
  if p_church not in ('M+','SHiNE') or not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active) then raise exception 'invalid_account'; end if;
  if exists(select 1 from unnest(coalesce(p_ministries,'{}')) x where x not in ('media','worship','welcome','children','all')) then raise exception 'invalid_scope'; end if;
  if 'all'=any(coalesce(p_ministries,'{}')) and cardinality(coalesce(p_ministries,'{}'))>1 then raise exception 'invalid_scope'; end if;
  delete from church_auth.service_ministry_scopes where user_id=p_user and church_id=p_church;
  foreach v_ministry in array coalesce(p_ministries,'{}') loop
    insert into church_auth.service_ministry_scopes(user_id,church_id,ministry_key) values(p_user,p_church,v_ministry);
  end loop;
  return true;
end $$;

create or replace function public.get_service_signup_scopes(p_user uuid,p_church text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(ministry_key order by ministry_key) from church_auth.service_ministry_scopes where user_id=p_user and church_id=p_church),'[]'::jsonb);
end $$;
revoke all on function public.set_service_signup_scopes(uuid,text,text[]),public.get_service_signup_scopes(uuid,text) from public,anon;
grant execute on function public.set_service_signup_scopes(uuid,text,text[]),public.get_service_signup_scopes(uuid,text) to authenticated,service_role;
