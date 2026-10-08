-- Cover foreign-key lookups used by reviewer removal and member/season history.
create index if not exists service_signup_final_reviewers_user_idx
  on church_auth.service_signup_final_reviewers(user_id);
create index if not exists service_signup_change_season_idx
  on public.service_signup_change_requests(season_id);
create index if not exists service_signup_change_member_idx
  on public.service_signup_change_requests(member_id);
