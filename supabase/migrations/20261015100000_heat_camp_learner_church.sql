create table camp_registration.registration_church_affiliations (
  registration_id uuid primary key references camp_registration.registrations(id) on delete cascade,
  church_affiliation text not null check (char_length(btrim(church_affiliation)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table camp_registration.registration_church_affiliations enable row level security;
revoke all on camp_registration.registration_church_affiliations from public, anon, authenticated;
grant select, insert, update on camp_registration.registration_church_affiliations to service_role;

create function public.heat_camp_2027_save_church_affiliation(p_request_id uuid, p_affiliation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_registration_id uuid; v_affiliation text;
begin
  v_affiliation := coalesce(nullif(btrim(p_affiliation), ''), '未提供');
  if char_length(v_affiliation) > 120 then raise exception 'invalid_church_affiliation'; end if;
  select r.id into v_registration_id from camp_registration.registrations r where r.request_id = p_request_id;
  if v_registration_id is null then raise exception 'registration_not_found'; end if;
  insert into camp_registration.registration_church_affiliations(registration_id, church_affiliation)
    values(v_registration_id, v_affiliation)
    on conflict(registration_id) do update
      set church_affiliation=excluded.church_affiliation,updated_at=now();
  return true;
end $$;
revoke all on function public.heat_camp_2027_save_church_affiliation(uuid,text) from public, anon, authenticated;
grant execute on function public.heat_camp_2027_save_church_affiliation(uuid,text) to service_role;

create function public.heat_camp_2027_church_affiliations(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_map jsonb;
begin
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
    or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
      and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id='M+' and g.permission='heat_camp'))
    or coalesce((select not f.can_view from church_auth.account_feature_permissions f
      where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),false)
  then raise exception 'forbidden'; end if;
  select coalesce(jsonb_object_agg(r.registration_no,coalesce(a.church_affiliation,'未提供')), '{}'::jsonb)
    into v_map from camp_registration.registrations r
    join camp_registration.events e on e.id=r.event_id
    left join camp_registration.registration_church_affiliations a on a.registration_id=r.id
    where e.slug='heat-basketball-camp-2027';
  return v_map;
end $$;
revoke all on function public.heat_camp_2027_church_affiliations(uuid) from public, anon, authenticated;
grant execute on function public.heat_camp_2027_church_affiliations(uuid) to service_role;
