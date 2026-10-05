alter table public.sermon_subtitle_segments
  add column if not exists reviewed_cues jsonb,
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending','processing','completed','failed')),
  add column if not exists review_error text,
  add column if not exists reviewed_at timestamptz;
