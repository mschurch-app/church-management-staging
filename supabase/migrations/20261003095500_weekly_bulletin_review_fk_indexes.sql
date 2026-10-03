create index if not exists website_weekly_bulletins_submitted_by_idx
  on public.website_weekly_bulletins(submitted_by);
create index if not exists website_weekly_bulletins_reviewed_by_idx
  on public.website_weekly_bulletins(reviewed_by);
create index if not exists website_weekly_review_events_actor_idx
  on public.website_weekly_bulletin_review_events(actor_user_id);
