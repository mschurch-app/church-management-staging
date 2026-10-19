-- Church OS publishes association news to the public TCSC homepage.
-- The live database was provisioned through the Supabase connector on 2026-10-19.
create table if not exists public.association_news (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 360),
  body text not null check (char_length(body) between 1 and 20000),
  hero_image_url text not null default '',
  status text not null default 'published' check (status in ('draft','published','archived')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  image_urls text[] not null default '{}'
);
create index if not exists association_news_latest_idx
  on public.association_news (published_at desc) where status='published';
alter table public.association_news enable row level security;
grant select on public.association_news to anon;
grant select,insert,update on public.association_news to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='association_news' and policyname='association_news_public_read') then
    create policy association_news_public_read on public.association_news
      for select to anon,authenticated using (status='published');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='association_news' and policyname='association_news_staff_read') then
    create policy association_news_staff_read on public.association_news
      for select to authenticated using ((select church_auth.allowed('M+','website_group_resources')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='association_news' and policyname='association_news_staff_insert') then
    create policy association_news_staff_insert on public.association_news
      for insert to authenticated with check (
        (select church_auth.allowed('M+','website_group_resources'))
        and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='association_news' and policyname='association_news_staff_update') then
    create policy association_news_staff_update on public.association_news
      for update to authenticated
      using ((select church_auth.allowed('M+','website_group_resources')))
      with check ((select church_auth.allowed('M+','website_group_resources')) and updated_by=(select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='association_news_image_upload') then
    create policy association_news_image_upload on storage.objects
      for insert to authenticated with check (
        bucket_id='church-website-public-media'
        and (storage.foldername(name))[1]='association-news'
        and (select church_auth.allowed('M+','website_group_resources')));
  end if;
end $$;
