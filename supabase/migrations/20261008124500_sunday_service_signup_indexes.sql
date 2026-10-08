create index if not exists service_signup_registrations_member_idx
  on public.service_signup_registrations(member_id);
create index if not exists service_signup_registrations_season_idx
  on public.service_signup_registrations(season_id);
create index if not exists service_signup_seasons_created_by_idx
  on public.service_signup_seasons(created_by);
