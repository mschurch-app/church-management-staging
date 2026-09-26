begin;

-- The website uses the RPC for public reads so anonymous callers never see audit columns.
drop policy if exists website_weekly_bulletins_public_read on public.website_weekly_bulletins;
create policy website_weekly_bulletins_public_read
  on public.website_weekly_bulletins for select to anon
  using(status='published');
revoke select on public.website_weekly_bulletins from anon,authenticated;
grant select on public.website_weekly_bulletins to authenticated;

-- Return only schedule roles the church has explicitly made visible in its schedule settings.
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
    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,to_jsonb(s)->r.role_key)
        filter(where r.role_key is not null and to_jsonb(s)->r.role_key is not null),'{}'::jsonb)
      into v_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church and s.service_date=v_bulletin.service_date::text
    group by s.id;

    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,to_jsonb(s)->r.role_key)
        filter(where r.role_key is not null and to_jsonb(s)->r.role_key is not null),'{}'::jsonb)
      into v_next_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church and s.service_date=(v_bulletin.service_date + 7)::text
    group by s.id;
  elsif p_service_date is not null and v_can_edit then
    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,to_jsonb(s)->r.role_key)
        filter(where r.role_key is not null and to_jsonb(s)->r.role_key is not null),'{}'::jsonb)
      into v_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church and s.service_date=p_service_date::text
    group by s.id;

    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,to_jsonb(s)->r.role_key)
        filter(where r.role_key is not null and to_jsonb(s)->r.role_key is not null),'{}'::jsonb)
      into v_next_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church and s.service_date=(p_service_date + 7)::text
    group by s.id;
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
