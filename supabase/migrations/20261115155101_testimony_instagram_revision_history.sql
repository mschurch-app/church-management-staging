alter table public.testimony_instagram_jobs add column publication_history jsonb not null default '[]'::jsonb;
