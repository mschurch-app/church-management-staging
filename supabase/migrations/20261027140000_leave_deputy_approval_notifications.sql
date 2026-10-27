-- A leave request now waits for its named deputy before managerial review.
-- Existing pending requests remain reviewable without inventing a deputy.
alter table public.pastoral_staff_leave_requests
  add column deputy_staff_id uuid references public.pastoral_staff(id) on delete restrict,
  add column deputy_response text check (deputy_response in ('accepted','declined')),
  add column deputy_responded_at timestamptz,
  add constraint pastoral_leave_deputy_not_self check (deputy_staff_id is null or deputy_staff_id <> staff_id),
  add constraint pastoral_leave_deputy_response_pair check ((deputy_response is null) = (deputy_responded_at is null));

alter table public.pastoral_staff_leave_requests
  drop constraint pastoral_staff_leave_requests_status_check;
alter table public.pastoral_staff_leave_requests
  add constraint pastoral_staff_leave_requests_status_check
  check (status in ('pending_substitute','pending','approved','rejected','substitute_declined','cancelled'));

create index pastoral_leave_deputy_queue_idx
  on public.pastoral_staff_leave_requests(entity_key,deputy_staff_id,status,created_at desc)
  where deputy_staff_id is not null;

alter table public.pastoral_notification_deliveries
  drop constraint pastoral_notification_deliveries_notification_type_check;
alter table public.pastoral_notification_deliveries
  add constraint pastoral_notification_deliveries_notification_type_check check(notification_type in (
    'calendar_participant','task_assigned','task_accepted','newcomer_care_created','newcomer_care_completed',
    'newcomer_care_reminder_24h','newcomer_care_overdue_48h','newcomer_group_created','member_binding_review',
    'weekly_bulletin_review','weekly_bulletin_approved','weekly_bulletin_changes_requested','sermon_social_review',
    'leave_substitute','leave_review','leave_result'
  ));

insert into public.notification_channel_routes(church_id,event_key,app_enabled,line_enabled)
select church,event,true,true from unnest(array['M+','SHiNE']) church
cross join unnest(array['leave_substitute','leave_review','leave_result']) event
on conflict(church_id,event_key) do nothing;

create or replace function public.save_notification_channel_route(p_church text,p_event_key text,p_app_enabled boolean,p_line_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform church_auth.lock_binding_reviewer(p_church);
 if p_event_key not in (
  'newcomer_created','newcomer_care_reminders','task_assigned','task_accepted','calendar_participant',
  'binding_review','school_daily_report','line_group_summary','sunday_service_card',
  'leave_substitute','leave_review','leave_result'
 ) then raise exception 'invalid_event'; end if;
 if not p_app_enabled and not p_line_enabled then raise exception 'one_channel_required'; end if;
 insert into public.notification_channel_routes(church_id,event_key,app_enabled,line_enabled,updated_at)
 values(p_church,p_event_key,p_app_enabled,p_line_enabled,now())
 on conflict(church_id,event_key) do update
 set app_enabled=excluded.app_enabled,line_enabled=excluded.line_enabled,updated_at=now();
 return true;
end $$;
revoke all on function public.save_notification_channel_route(text,text,boolean,boolean) from public,anon;
grant execute on function public.save_notification_channel_route(text,text,boolean,boolean) to authenticated,service_role;
