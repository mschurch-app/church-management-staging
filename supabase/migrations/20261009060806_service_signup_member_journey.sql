-- Read-only yearly journey. LINE authentication remains in the existing Edge Function.
-- Reuse the existing (church_id, member_id, service_date) active-registration index.
create or replace function public.service_signup_member_journey(
  p_church text,p_channel text,p_subject text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_member bigint;v_today date:=(now() at time zone 'Asia/Taipei')::date;v_result jsonb;
begin
  if p_church not in ('M+','SHiNE') or p_church is null or p_channel is null or p_subject is null
    or p_channel !~ '^[0-9]+$' or p_subject !~ '^U[0-9a-f]{32}$' then
    raise exception 'invalid_identity' using errcode='22023';
  end if;
  select b.member_id into v_member from church_auth.member_bindings b
    join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
    where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active limit 1;
  if v_member is null then raise exception 'binding_required' using errcode='42501';end if;
  with registrations as (
    select r.id,r.service_date,r.status,sl.ministry_key,sl.role_key,s.starts_on season_starts_on
      from public.service_signup_registrations r
      join public.service_signup_slots sl on sl.id=r.slot_id and sl.church_id=r.church_id
      join public.service_signup_seasons s on s.id=r.season_id and s.church_id=r.church_id
      where r.church_id=p_church and r.member_id=v_member and r.status in ('registered','waitlisted','offered','confirmed')
  ), years as (
    select extract(year from v_today)::integer as service_year
    union select extract(year from service_date)::integer from registrations
    union select extract(year from starts_on)::integer from public.service_signup_seasons where church_id=p_church and status='open'
  ), totals as (
    select extract(year from service_date)::integer as service_year,
      count(distinct service_date) filter(where status='confirmed' and service_date<v_today) completed_count,
      count(distinct service_date) filter(where status in ('registered','confirmed') and service_date>=v_today) registered_count,
      count(distinct service_date) filter(where status in ('waitlisted','offered') and service_date>=v_today) waitlisted_count
      from registrations group by extract(year from service_date)::integer
  ) select jsonb_build_object(
    'as_of',v_today,'counting_rule','confirmed_and_date_passed',
    'years',coalesce((select jsonb_agg(jsonb_build_object('year',y.service_year,
      'completed_count',coalesce(t.completed_count,0),'registered_count',coalesce(t.registered_count,0),
      'waitlisted_count',coalesce(t.waitlisted_count,0)) order by y.service_year desc)
      from years y left join totals t using(service_year)),'[]'::jsonb),
    'registration_details',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,
      'ministry_key',r.ministry_key,'role_key',r.role_key,'season_starts_on',r.season_starts_on,
      'completed',r.status='confirmed' and r.service_date<v_today) order by r.service_date) from registrations r),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.service_signup_member_journey(text,text,text) from public,anon,authenticated;
grant execute on function public.service_signup_member_journey(text,text,text) to service_role;
