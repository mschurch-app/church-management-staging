begin;
alter function public.get_website_content_posts(text,text,integer,integer) security invoker;
grant select on public.website_content_posts to anon;
drop policy if exists website_content_public_read on public.website_content_posts;
create policy website_content_public_read on public.website_content_posts for select to anon
 using(status in('published','archived'));
commit;
