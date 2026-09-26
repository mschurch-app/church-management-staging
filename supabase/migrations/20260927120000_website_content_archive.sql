begin;
create table if not exists public.website_content_posts(
 id uuid primary key default gen_random_uuid(), church_id text not null references public.churches(id),
 content_type text not null check(content_type in('group_resource','weekly_archive')), source_key text not null,
 title text not null, published_on date not null, excerpt text not null default '', content_html text not null default '',
 hero_image_url text not null default '', source_url text not null default '', status text not null default 'draft' check(status in('draft','published','archived')),
 sort_order integer not null default 0, metadata jsonb not null default '{}'::jsonb,
 created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz,
 unique(church_id,content_type,source_key), check(length(btrim(title)) between 1 and 160), check(length(content_html)<=500000)
);
create index if not exists website_content_posts_public_idx on public.website_content_posts(church_id,content_type,status,published_on desc);
alter table public.website_content_posts enable row level security;
revoke all on public.website_content_posts from anon,authenticated;
grant select,insert,update,delete on public.website_content_posts to authenticated;
create policy website_content_staff_select on public.website_content_posts for select to authenticated using((select church_auth.allowed(church_id,'pastoral_chats')));
create policy website_content_staff_insert on public.website_content_posts for insert to authenticated with check((select church_auth.allowed(church_id,'pastoral_chats')) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy website_content_staff_update on public.website_content_posts for update to authenticated using((select church_auth.allowed(church_id,'pastoral_chats'))) with check((select church_auth.allowed(church_id,'pastoral_chats')) and updated_by=(select auth.uid()));
create policy website_content_staff_delete on public.website_content_posts for delete to authenticated using((select church_auth.allowed(church_id,'pastoral_chats')));
create or replace function public.get_website_content_posts(p_church text default 'M+',p_type text default 'group_resource',p_limit integer default 20,p_offset integer default 0)
returns table(id uuid,title text,published_on date,excerpt text,content_html text,hero_image_url text,source_url text)
language sql stable security definer set search_path='' as $$
 select p.id,p.title,p.published_on,p.excerpt,p.content_html,p.hero_image_url,p.source_url from public.website_content_posts p
 where p.church_id=p_church and p.content_type=p_type and p.status in('published','archived')
 order by p.published_on desc,p.sort_order,p.created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)
$$;
revoke all on function public.get_website_content_posts(text,text,integer,integer) from public;
grant execute on function public.get_website_content_posts(text,text,integer,integer) to anon,authenticated;
update public.church_customizations set feature_modules=feature_modules || jsonb_build_array(jsonb_build_object('key','website_group_resources','permission','pastoral_chats','label','小組聚會資源','icon','📚','description','維護每週小組教材與完整聚會內容','enabled',true,'dashboard',true,'navigation',false,'dashboard_order',95,'navigation_order',95)),version=version+1,updated_at=now()
where church_id='M+' and not exists(select 1 from jsonb_array_elements(feature_modules) x where x->>'key'='website_group_resources');
commit;
