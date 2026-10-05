create table if not exists public.youtube_caption_publications (
  draft_id uuid primary key references public.sermon_social_drafts(id) on delete cascade,
  youtube_video_id text not null,
  caption_id text not null,
  language text not null default 'zh-TW',
  cue_count integer not null default 0,
  status text not null check (status in ('published','failed')),
  approved_at timestamptz,
  published_at timestamptz,
  error_code text,
  updated_at timestamptz not null default now()
);
alter table public.youtube_caption_publications enable row level security;
revoke all on public.youtube_caption_publications from anon,authenticated;
grant all on public.youtube_caption_publications to service_role;
