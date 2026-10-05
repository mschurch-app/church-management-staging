create table if not exists public.sermon_subtitle_segments (
  draft_id uuid not null references public.sermon_social_drafts(id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  start_seconds integer not null check (start_seconds >= 0),
  end_seconds integer not null check (end_seconds > start_seconds),
  cues jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  error_code text,
  model text,
  updated_at timestamptz not null default now(),
  primary key (draft_id, segment_index)
);
alter table public.sermon_subtitle_segments enable row level security;
revoke all on public.sermon_subtitle_segments from anon, authenticated;
grant all on public.sermon_subtitle_segments to service_role;
