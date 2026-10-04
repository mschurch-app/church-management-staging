alter table public.website_weekly_bulletins add column if not exists reel_audio_start_seconds numeric(8,2) not null default 0 check (reel_audio_start_seconds >= 0);
