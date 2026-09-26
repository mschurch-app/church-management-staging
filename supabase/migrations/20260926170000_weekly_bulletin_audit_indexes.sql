create index if not exists website_weekly_bulletins_created_by_idx
  on public.website_weekly_bulletins(created_by);
create index if not exists website_weekly_bulletins_updated_by_idx
  on public.website_weekly_bulletins(updated_by);
