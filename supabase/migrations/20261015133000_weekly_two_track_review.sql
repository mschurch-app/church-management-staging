begin;

alter table public.website_weekly_bulletins
  add column if not exists speaker_photo_path text,
  add column if not exists schedule_overrides jsonb not null default '{"current":{},"next":{}}'::jsonb;
alter table public.website_weekly_bulletins
  drop constraint if exists website_weekly_bulletins_status_check;
alter table public.website_weekly_bulletins
  add constraint website_weekly_bulletins_status_check
  check(status in ('draft','pending_initial','pending_review','changes_requested','published'));
alter table public.website_weekly_bulletins
  add constraint website_weekly_bulletins_speaker_photo_path_check
  check(speaker_photo_path is null or speaker_photo_path like church_id || '/weekly/%');
alter table public.website_weekly_bulletins
  add constraint website_weekly_bulletins_schedule_overrides_check
  check(jsonb_typeof(schedule_overrides)='object' and jsonb_typeof(schedule_overrides->'current')='object' and jsonb_typeof(schedule_overrides->'next')='object' and length(schedule_overrides::text)<=12000);

create table public.website_weekly_promos (
  bulletin_id uuid primary key references public.website_weekly_bulletins(id) on delete cascade,
  church_id text not null references public.churches(id),
  status text not null default 'draft' check(status in ('draft','pending_initial','pending_review','changes_requested','approved')),
  version integer not null default 1 check(version > 0),
  snapshot jsonb not null default '{}'::jsonb,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text check(review_comment is null or char_length(review_comment)<=2000),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  check(church_id in ('M+','SHiNE')),
  check(jsonb_typeof(snapshot)='object')
);
create index website_weekly_promos_queue_idx on public.website_weekly_promos(church_id,status,submitted_at desc);
create index website_weekly_promos_submitted_by_idx on public.website_weekly_promos(submitted_by);
create index website_weekly_promos_reviewed_by_idx on public.website_weekly_promos(reviewed_by);
alter table public.website_weekly_promos enable row level security;
revoke all on public.website_weekly_promos from public,anon,authenticated;
grant all on public.website_weekly_promos to service_role;

alter table public.website_weekly_bulletin_review_events
  drop constraint if exists website_weekly_bulletin_review_events_action_check;
alter table public.website_weekly_bulletin_review_events
  add constraint website_weekly_bulletin_review_events_action_check
  check(action in ('submitted','initial_approved','approved','changes_requested'));
alter table public.website_weekly_bulletin_review_events
  add column if not exists track text not null default 'bulletin'
  check(track in ('promo','bulletin'));

alter table public.review_workflow_settings
  drop constraint if exists review_workflow_settings_workflow_key_check;
alter table public.review_workflow_settings
  add constraint review_workflow_settings_workflow_key_check
  check(workflow_key in ('sermon_social','daily_devotional','service_change_media','service_change_worship','service_change_welcome','service_change_children','weekly_promo','weekly_bulletin'));
insert into public.review_workflow_settings(church_id,workflow_key,workflow_label,initial_reviewer_id,final_reviewer_id,notify_app,notify_line)
select church_id,'weekly_promo','主日社群預告',initial_reviewer_id,final_reviewer_id,notify_app,notify_line
from public.review_workflow_settings where church_id='M+' and workflow_key='sermon_social'
on conflict do nothing;
insert into public.review_workflow_settings(church_id,workflow_key,workflow_label,initial_reviewer_id,final_reviewer_id,notify_app,notify_line)
select church_id,'weekly_bulletin','主日週報上稿',initial_reviewer_id,final_reviewer_id,notify_app,notify_line
from public.review_workflow_settings where church_id='M+' and workflow_key='sermon_social'
on conflict do nothing;
insert into public.review_workflow_settings(church_id,workflow_key,workflow_label)
values ('SHiNE','weekly_promo','主日社群預告'),('SHiNE','weekly_bulletin','主日週報上稿')
on conflict do nothing;
update public.review_workflow_settings w
set initial_reviewer_id=a.user_id
from church_auth.accounts a
where w.church_id='M+'
  and w.workflow_key in ('weekly_promo','weekly_bulletin')
  and a.is_active
  and a.display_name='邵鈺庭'
  and (w.final_reviewer_id is null or w.final_reviewer_id<>a.user_id);

-- Public weekly view reads approved bulletin edits and per-week schedule corrections.
create or replace function public.get_website_weekly_data(
  p_church text default 'M+',
  p_service_date date default null
)
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
    where b.church_id=p_church
      and b.status='published'
      and b.service_date >= (now() at time zone 'Asia/Taipei')::date
    order by b.service_date asc limit 1;
    if v_bulletin.id is null then
      select * into v_bulletin from public.website_weekly_bulletins b
      where b.church_id=p_church and b.status='published'
      order by b.service_date desc limit 1;
    end if;
  end if;

  if v_bulletin.id is null and not v_can_edit then return null; end if;

  if v_bulletin.id is not null then
    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=v_bulletin.service_date::text
    group by s.id;

    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_next_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=(v_bulletin.service_date + 7)::text
    group by s.id;
  elsif p_service_date is not null and v_can_edit then
    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=p_service_date::text
    group by s.id;

    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_next_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=(p_service_date + 7)::text
    group by s.id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'role_key',r.role_key,
        'label',r.label,
        'icon',r.icon,
        'sort_order',r.sort_order
      ) order by r.sort_order,r.role_key
    ),
    '[]'::jsonb
  ) into v_roles
  from public.schedule_role_preferences r
  where r.church_id=p_church and r.is_visible;

  if v_bulletin.id is not null then
    v_schedule := case when v_schedule is null and coalesce(v_bulletin.schedule_overrides->'current','{}'::jsonb)='{}'::jsonb then null else coalesce(v_schedule,'{}'::jsonb) || coalesce(v_bulletin.schedule_overrides->'current','{}'::jsonb) end;
    v_next_schedule := case when v_next_schedule is null and coalesce(v_bulletin.schedule_overrides->'next','{}'::jsonb)='{}'::jsonb then null else coalesce(v_next_schedule,'{}'::jsonb) || coalesce(v_bulletin.schedule_overrides->'next','{}'::jsonb) end;
  end if;

  return jsonb_build_object(
    'bulletin',case when v_bulletin.id is null then null else jsonb_build_object(
      'id',v_bulletin.id,
      'church_id',v_bulletin.church_id,
      'service_date',v_bulletin.service_date,
      'title',v_bulletin.title,
      'sermon_topic',v_bulletin.sermon_topic,
      'sermon_scripture',v_bulletin.sermon_scripture,
      'sermon_speaker',v_bulletin.sermon_speaker,
      'subtitle',v_bulletin.subtitle,
      'service_time',v_bulletin.service_time,
      'hero_image_path',v_bulletin.hero_image_path,
      'sections',v_bulletin.sections,
      'status',v_bulletin.status,
      'version',v_bulletin.version,
      'updated_at',v_bulletin.updated_at,
      'published_at',v_bulletin.published_at
    ) end,
    'schedule',v_schedule,
    'next_schedule',v_next_schedule,
    'schedule_roles',v_roles
  );
end;
$$;

commit;
