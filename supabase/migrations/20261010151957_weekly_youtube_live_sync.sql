alter table public.website_weekly_bulletins
  add column youtube_sync_enabled boolean not null default false,
  add column youtube_video_id text check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column youtube_title text check (char_length(youtube_title) <= 100),
  add column youtube_description text check (char_length(youtube_description) <= 5000),
  add column youtube_tags jsonb check (youtube_tags is null or (jsonb_typeof(youtube_tags) = 'array' and jsonb_array_length(youtube_tags) <= 30));

create table public.weekly_youtube_settings (
  church_id text primary key check (church_id = 'M+'),
  preferred_stream_id text,
  updated_at timestamptz not null default now()
);
create table public.weekly_youtube_publications (
  bulletin_id uuid primary key references public.website_weekly_bulletins(id) on delete cascade,
  church_id text not null check (church_id = 'M+'),
  bulletin_version integer not null,
  video_id text,
  fingerprint text not null default '',
  status text not null default 'pending' check (status in ('pending','syncing','synced','failed')),
  attempt_id uuid,
  lease_expires_at timestamptz,
  metadata_synced_at timestamptz,
  thumbnail_synced_at timestamptz,
  verified_at timestamptz,
  previous_metadata jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.weekly_youtube_settings enable row level security;
alter table public.weekly_youtube_publications enable row level security;
revoke all on public.weekly_youtube_settings, public.weekly_youtube_publications from anon, authenticated;
grant all on public.weekly_youtube_settings, public.weekly_youtube_publications to service_role;
comment on table public.weekly_youtube_publications is 'Service-only YouTube publication checkpoints; contains no OAuth credentials.';
