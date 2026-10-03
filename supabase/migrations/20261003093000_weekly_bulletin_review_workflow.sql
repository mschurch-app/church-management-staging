begin;

alter table public.website_weekly_bulletins
  drop constraint if exists website_weekly_bulletins_status_check;
alter table public.website_weekly_bulletins
  add constraint website_weekly_bulletins_status_check
  check(status in ('draft','pending_review','changes_requested','published'));

alter table public.website_weekly_bulletins
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text;

alter table public.website_weekly_bulletins
  drop constraint if exists website_weekly_bulletins_review_comment_length;
alter table public.website_weekly_bulletins
  add constraint website_weekly_bulletins_review_comment_length
  check(review_comment is null or char_length(review_comment)<=2000);

drop policy if exists website_weekly_bulletins_staff_insert on public.website_weekly_bulletins;
create policy website_weekly_bulletins_staff_insert
  on public.website_weekly_bulletins for insert to authenticated
  with check((select church_auth.allowed(church_id,'pastoral_chats'))
    and created_by=(select auth.uid()) and updated_by=(select auth.uid()) and status='draft');
drop policy if exists website_weekly_bulletins_staff_update on public.website_weekly_bulletins;
create policy website_weekly_bulletins_staff_update
  on public.website_weekly_bulletins for update to authenticated
  using((select church_auth.allowed(church_id,'pastoral_chats')) and status in ('draft','changes_requested'))
  with check((select church_auth.allowed(church_id,'pastoral_chats'))
    and updated_by=(select auth.uid()) and status in ('draft','changes_requested'));

create index if not exists website_weekly_bulletins_review_queue_idx
  on public.website_weekly_bulletins(church_id,status,submitted_at desc)
  where status='pending_review';
create index if not exists website_weekly_bulletins_submitted_by_idx
  on public.website_weekly_bulletins(submitted_by);
create index if not exists website_weekly_bulletins_reviewed_by_idx
  on public.website_weekly_bulletins(reviewed_by);

create table if not exists public.website_weekly_bulletin_review_events (
  id uuid primary key default gen_random_uuid(),
  bulletin_id uuid not null references public.website_weekly_bulletins(id) on delete cascade,
  church_id text not null references public.churches(id) on update cascade on delete restrict,
  bulletin_version integer not null check(bulletin_version>0),
  action text not null check(action in ('submitted','approved','changes_requested')),
  actor_user_id uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamptz not null default now(),
  constraint website_weekly_review_comment_length check(comment is null or char_length(comment)<=2000)
);
create index if not exists website_weekly_review_events_bulletin_idx
  on public.website_weekly_bulletin_review_events(bulletin_id,created_at desc);
create index if not exists website_weekly_review_events_church_idx
  on public.website_weekly_bulletin_review_events(church_id,created_at desc);
create index if not exists website_weekly_review_events_actor_idx
  on public.website_weekly_bulletin_review_events(actor_user_id);
alter table public.website_weekly_bulletin_review_events enable row level security;
revoke all on public.website_weekly_bulletin_review_events from anon,authenticated;
grant all on public.website_weekly_bulletin_review_events to service_role;

alter table public.pastoral_notification_deliveries
  drop constraint if exists pastoral_notification_deliveries_notification_type_check;
alter table public.pastoral_notification_deliveries
  add constraint pastoral_notification_deliveries_notification_type_check check(notification_type in (
    'calendar_participant','task_assigned','task_accepted','newcomer_care_created','newcomer_care_completed',
    'newcomer_care_reminder_24h','newcomer_care_overdue_48h','newcomer_group_created','member_binding_review',
    'weekly_bulletin_review','weekly_bulletin_approved','weekly_bulletin_changes_requested'
  ));

insert into public.notification_channel_routes(church_id,event_key,app_enabled,line_enabled)
values
  ('M+','weekly_bulletin_review',true,true),
  ('M+','weekly_bulletin_result',true,true),
  ('SHiNE','weekly_bulletin_review',true,true),
  ('SHiNE','weekly_bulletin_result',true,true)
on conflict(church_id,event_key) do nothing;

commit;
