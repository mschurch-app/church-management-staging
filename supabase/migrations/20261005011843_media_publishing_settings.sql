create table if not exists public.media_publishing_settings (
  church_id text primary key check (church_id in ('M+', 'SHiNE')),
  sermon_analysis_enabled boolean not null default true,
  youtube_captions_enabled boolean not null default false,
  instagram_sermon_enabled boolean not null default true,
  instagram_weekly_reel_enabled boolean not null default false,
  instagram_weekday_reel_enabled boolean not null default false,
  instagram_holiday_reel_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.media_publishing_settings enable row level security;
revoke all on public.media_publishing_settings from anon, authenticated;
grant all on public.media_publishing_settings to service_role;

insert into public.media_publishing_settings (church_id)
values ('M+'), ('SHiNE')
on conflict (church_id) do nothing;

comment on table public.media_publishing_settings is 'Independent switches for each church media generation and publishing workflow.';
