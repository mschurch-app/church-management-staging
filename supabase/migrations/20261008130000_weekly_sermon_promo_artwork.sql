begin;

alter table public.website_weekly_bulletins
  add column if not exists sermon_topic text not null default '',
  add column if not exists sermon_scripture text not null default '',
  add column if not exists sermon_speaker text not null default '',
  add column if not exists reel_cover_image_path text;

alter table public.website_weekly_bulletins
  add constraint website_weekly_bulletins_sermon_topic_length
    check (length(sermon_topic) <= 150),
  add constraint website_weekly_bulletins_sermon_scripture_length
    check (length(sermon_scripture) <= 150),
  add constraint website_weekly_bulletins_sermon_speaker_length
    check (length(sermon_speaker) <= 100),
  add constraint website_weekly_bulletins_reel_cover_path
    check (reel_cover_image_path is null or reel_cover_image_path like church_id || '/weekly/%');

commit;
