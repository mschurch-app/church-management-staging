begin;

create table if not exists public.website_weekly_bulletins (
  id uuid primary key default gen_random_uuid(),
  church_id text not null references public.churches(id) on update cascade on delete restrict,
  service_date date not null,
  title text not null default '本週週報',
  subtitle text not null default '',
  service_time text not null default '主日崇拜 · 每週日上午 10:00',
  hero_image_path text,
  sections jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check(status in ('draft','published')),
  version integer not null default 1 check(version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique(church_id,service_date),
  constraint website_weekly_bulletins_church check(church_id in ('M+','SHiNE')),
  constraint website_weekly_bulletins_title check(length(btrim(title)) between 1 and 100),
  constraint website_weekly_bulletins_subtitle check(length(subtitle) <= 500),
  constraint website_weekly_bulletins_service_time check(length(service_time) <= 200),
  constraint website_weekly_bulletins_image_path check(hero_image_path is null or hero_image_path like church_id || '/weekly/%'),
  constraint website_weekly_bulletins_sections check(jsonb_typeof(sections)='array' and jsonb_array_length(sections) <= 30)
);

create index if not exists website_weekly_bulletins_public_lookup
  on public.website_weekly_bulletins(church_id,status,service_date desc);

alter table public.website_weekly_bulletins enable row level security;
revoke all on public.website_weekly_bulletins from anon,authenticated;
grant select on public.website_weekly_bulletins to anon,authenticated;
grant insert,update,delete on public.website_weekly_bulletins to authenticated;

create policy website_weekly_bulletins_public_read
  on public.website_weekly_bulletins for select to anon,authenticated
  using(status='published');
create policy website_weekly_bulletins_staff_read
  on public.website_weekly_bulletins for select to authenticated
  using((select church_auth.allowed(church_id,'pastoral_chats')));
create policy website_weekly_bulletins_staff_insert
  on public.website_weekly_bulletins for insert to authenticated
  with check((select church_auth.allowed(church_id,'pastoral_chats')) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy website_weekly_bulletins_staff_update
  on public.website_weekly_bulletins for update to authenticated
  using((select church_auth.allowed(church_id,'pastoral_chats')))
  with check((select church_auth.allowed(church_id,'pastoral_chats')) and updated_by=(select auth.uid()));
create policy website_weekly_bulletins_staff_delete
  on public.website_weekly_bulletins for delete to authenticated
  using((select church_auth.allowed(church_id,'pastoral_chats')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('church-website-public-media','church-website-public-media',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy church_website_media_public_read
  on storage.objects for select to anon,authenticated
  using(bucket_id='church-website-public-media');
create policy church_website_media_staff_insert
  on storage.objects for insert to authenticated
  with check(bucket_id='church-website-public-media'
    and (storage.foldername(name))[1] in ('M+','SHiNE')
    and (storage.foldername(name))[2]='weekly'
    and (select church_auth.allowed((storage.foldername(name))[1],'pastoral_chats')));
create policy church_website_media_staff_update
  on storage.objects for update to authenticated
  using(bucket_id='church-website-public-media'
    and (storage.foldername(name))[1] in ('M+','SHiNE')
    and (storage.foldername(name))[2]='weekly'
    and (select church_auth.allowed((storage.foldername(name))[1],'pastoral_chats')))
  with check(bucket_id='church-website-public-media'
    and (storage.foldername(name))[1] in ('M+','SHiNE')
    and (storage.foldername(name))[2]='weekly'
    and (select church_auth.allowed((storage.foldername(name))[1],'pastoral_chats')));
create policy church_website_media_staff_delete
  on storage.objects for delete to authenticated
  using(bucket_id='church-website-public-media'
    and (storage.foldername(name))[1] in ('M+','SHiNE')
    and (storage.foldername(name))[2]='weekly'
    and (select church_auth.allowed((storage.foldername(name))[1],'pastoral_chats')));

create or replace function public.get_website_weekly_data(p_church text default 'M+',p_service_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_bulletin public.website_weekly_bulletins%rowtype;
  v_schedule jsonb;
  v_next_schedule jsonb;
  v_roles jsonb;
  v_can_edit boolean := false;
begin
  if p_church not in ('M+','SHiNE') then return null; end if;
  v_can_edit := auth.uid() is not null and church_auth.allowed(p_church,'pastoral_chats');

  if p_service_date is not null then
    select * into v_bulletin from public.website_weekly_bulletins b
    where b.church_id=p_church and b.service_date=p_service_date
      and (b.status='published' or v_can_edit)
    limit 1;
  elsif v_can_edit then
    select * into v_bulletin from public.website_weekly_bulletins b
    where b.church_id=p_church and b.status='published'
    order by b.service_date desc limit 1;
  else
    select * into v_bulletin from public.website_weekly_bulletins b
    where b.church_id=p_church and b.status='published' and b.service_date<=current_date
    order by b.service_date desc limit 1;
    if v_bulletin.id is null then
      select * into v_bulletin from public.website_weekly_bulletins b
      where b.church_id=p_church and b.status='published'
      order by b.service_date asc limit 1;
    end if;
  end if;

  if v_bulletin.id is null and not v_can_edit then return null; end if;
  if v_bulletin.id is not null then
    select to_jsonb(s) - 'id' - 'church_id' into v_schedule
    from public.service_schedules s
    where s.church_id=p_church and s.service_date=v_bulletin.service_date::text
    limit 1;
    select to_jsonb(s) - 'id' - 'church_id' into v_next_schedule
    from public.service_schedules s
    where s.church_id=p_church and s.service_date=(v_bulletin.service_date + 7)::text
    limit 1;
  elsif p_service_date is not null and v_can_edit then
    select to_jsonb(s) - 'id' - 'church_id' into v_schedule
    from public.service_schedules s
    where s.church_id=p_church and s.service_date=p_service_date::text
    limit 1;
    select to_jsonb(s) - 'id' - 'church_id' into v_next_schedule
    from public.service_schedules s
    where s.church_id=p_church and s.service_date=(p_service_date + 7)::text
    limit 1;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('role_key',r.role_key,'label',r.label,'icon',r.icon,'sort_order',r.sort_order) order by r.sort_order,r.role_key),'[]'::jsonb)
    into v_roles from public.schedule_role_preferences r
    where r.church_id=p_church and r.is_visible;

  return jsonb_build_object(
    'bulletin',case when v_bulletin.id is null then null else jsonb_build_object(
      'id',v_bulletin.id,'church_id',v_bulletin.church_id,'service_date',v_bulletin.service_date,
      'title',v_bulletin.title,'subtitle',v_bulletin.subtitle,'service_time',v_bulletin.service_time,
      'hero_image_path',v_bulletin.hero_image_path,'sections',v_bulletin.sections,
      'status',v_bulletin.status,'version',v_bulletin.version,'updated_at',v_bulletin.updated_at,'published_at',v_bulletin.published_at) end,
    'schedule',v_schedule,'next_schedule',v_next_schedule,'schedule_roles',v_roles);
end;
$$;

revoke all on function public.get_website_weekly_data(text,date) from public;
grant execute on function public.get_website_weekly_data(text,date) to anon,authenticated;

commit;
