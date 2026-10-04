alter table public.website_weekly_bulletins
  add column if not exists reel_enabled boolean not null default true,
  add column if not exists reel_video_path text,
  add column if not exists reel_caption text;

alter table public.website_weekly_bulletins
  drop constraint if exists website_weekly_bulletins_reel_path;
alter table public.website_weekly_bulletins
  add constraint website_weekly_bulletins_reel_path
  check(reel_video_path is null or reel_video_path like church_id || '/weekly/%');

create table if not exists public.instagram_publication_jobs (
  id uuid primary key default gen_random_uuid(),
  church_id text not null check(church_id in ('M+', 'SHiNE')),
  bulletin_id uuid not null references public.website_weekly_bulletins(id) on delete cascade,
  bulletin_version integer not null,
  media_path text not null,
  caption text not null default '',
  status text not null default 'queued' check(status in ('queued','processing','published','failed','skipped')),
  attempt_count integer not null default 0,
  container_id text,
  instagram_media_id text,
  error_code text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(bulletin_id,bulletin_version)
);

alter table public.instagram_publication_jobs enable row level security;
revoke all on table public.instagram_publication_jobs from anon, authenticated;

update storage.buckets
set file_size_limit=52428800,
    allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4']
where id='church-website-public-media';
