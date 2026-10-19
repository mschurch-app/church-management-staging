begin;

create or replace function public.get_website_published_weekly_archive(
  p_church text default 'M+',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  service_date date,
  title text,
  subtitle text,
  service_time text,
  hero_image_path text,
  sections jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.service_date,
    b.title,
    b.subtitle,
    b.service_time,
    b.hero_image_path,
    b.sections
  from public.website_weekly_bulletins as b
  where p_church in ('M+', 'SHiNE')
    and b.church_id = p_church
    and b.status = 'published'
    and b.service_date <= (now() at time zone 'Asia/Taipei')::date
  order by b.service_date desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.get_website_published_weekly_archive(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_website_published_weekly_archive(text, integer, integer) to anon, authenticated;

commit;
