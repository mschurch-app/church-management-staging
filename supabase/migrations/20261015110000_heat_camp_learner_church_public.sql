-- Save the optional church choice separately from payment and registration RPCs.
-- The public Edge Function uses the existing request ID, registration number and
-- guardian email as proof that the caller submitted this registration.
create function public.heat_camp_2027_save_church_affiliation_public(
  p_request_id uuid,
  p_registration_no text,
  p_email text,
  p_affiliation text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_registration_id uuid;
  v_affiliation text := btrim(coalesce(p_affiliation, ''));
begin
  if char_length(v_affiliation) not between 1 and 120 then
    raise exception 'invalid_church_affiliation';
  end if;
  select r.id into v_registration_id
    from camp_registration.registrations r
    join camp_registration.events e on e.id = r.event_id
    where e.slug = 'heat-basketball-camp-2027'
      and r.request_id = p_request_id
      and r.registration_no = p_registration_no
      and lower(r.email) = lower(btrim(coalesce(p_email, '')));
  if v_registration_id is null then raise exception 'registration_not_found'; end if;
  insert into camp_registration.registration_church_affiliations(registration_id, church_affiliation)
    values(v_registration_id, v_affiliation)
    on conflict(registration_id) do update
      set church_affiliation = excluded.church_affiliation, updated_at = now();
  return true;
end $$;
revoke all on function public.heat_camp_2027_save_church_affiliation_public(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.heat_camp_2027_save_church_affiliation_public(uuid,text,text,text) to service_role;
