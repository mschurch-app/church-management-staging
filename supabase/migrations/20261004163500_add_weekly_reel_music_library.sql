alter table public.website_weekly_bulletins add column if not exists reel_audio_path text;

create table if not exists public.instagram_reel_music (
  id uuid primary key default gen_random_uuid(), church_id text not null check (church_id in ('M+','SHiNE')),
  title text not null check (char_length(title) between 1 and 100), storage_path text not null unique,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.instagram_reel_music enable row level security;
revoke all on public.instagram_reel_music from anon,authenticated;
grant select,insert,delete on public.instagram_reel_music to authenticated;
create policy "reel music editors read" on public.instagram_reel_music for select to authenticated using ((select church_auth.allowed(church_id,'pastoral_chats')));
create policy "reel music editors insert" on public.instagram_reel_music for insert to authenticated with check ((select church_auth.allowed(church_id,'pastoral_chats')));
create policy "reel music editors delete" on public.instagram_reel_music for delete to authenticated using ((select church_auth.allowed(church_id,'pastoral_chats')));
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/mp4','audio/wav','audio/x-wav'] where id='church-website-public-media';

create policy church_website_reel_music_insert on storage.objects for insert to authenticated
with check(bucket_id='church-website-public-media' and (storage.foldername(name))[1] in ('M+','SHiNE') and (storage.foldername(name))[2]='reel-music' and (select church_auth.allowed((storage.foldername(name))[1],'pastoral_chats')));
create policy church_website_reel_music_delete on storage.objects for delete to authenticated
using(bucket_id='church-website-public-media' and (storage.foldername(name))[1] in ('M+','SHiNE') and (storage.foldername(name))[2]='reel-music' and (select church_auth.allowed((storage.foldername(name))[1],'pastoral_chats')));
