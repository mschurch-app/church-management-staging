create table if not exists public.notification_channel_routes(
 church_id text not null check(church_id in ('M+','SHiNE')),
 event_key text not null,
 app_enabled boolean not null default true,
 line_enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(church_id,event_key)
);
alter table public.notification_channel_routes enable row level security;
revoke all on public.notification_channel_routes from public,anon,authenticated;
grant all on public.notification_channel_routes to service_role;

insert into public.notification_channel_routes(church_id,event_key,app_enabled,line_enabled)
select church,event,true,true from unnest(array['M+','SHiNE']) church cross join unnest(array[
 'newcomer_created','newcomer_care_reminders','task_assigned','task_accepted','calendar_participant','binding_review','school_daily_report','line_group_summary','sunday_service_card'
]) event on conflict do nothing;

alter table public.pastoral_notification_deliveries add column if not exists app_status text not null default 'not_attempted';
alter table public.pastoral_notification_deliveries add column if not exists line_status text not null default 'not_attempted';
alter table public.pastoral_notification_deliveries drop constraint if exists pastoral_notification_deliveries_notification_type_check;
alter table public.pastoral_notification_deliveries add constraint pastoral_notification_deliveries_notification_type_check check(notification_type=any(array['calendar_participant','task_assigned','task_accepted','newcomer_care_created','newcomer_care_completed','newcomer_care_reminder_24h','newcomer_care_overdue_48h','newcomer_group_created','member_binding_review']));

create or replace function public.get_notification_channel_routes(p_church text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform church_auth.lock_binding_reviewer(p_church);
 return coalesce((select jsonb_agg(jsonb_build_object('event_key',event_key,'app_enabled',app_enabled,'line_enabled',line_enabled) order by event_key) from public.notification_channel_routes where church_id=p_church),'[]'::jsonb);
end $$;
create or replace function public.save_notification_channel_route(p_church text,p_event_key text,p_app_enabled boolean,p_line_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform church_auth.lock_binding_reviewer(p_church);
 if p_event_key not in ('newcomer_created','newcomer_care_reminders','task_assigned','task_accepted','calendar_participant','binding_review','school_daily_report','line_group_summary','sunday_service_card') then raise exception 'invalid_event'; end if;
 if not p_app_enabled and not p_line_enabled then raise exception 'one_channel_required'; end if;
 insert into public.notification_channel_routes(church_id,event_key,app_enabled,line_enabled,updated_at) values(p_church,p_event_key,p_app_enabled,p_line_enabled,now())
 on conflict(church_id,event_key) do update set app_enabled=excluded.app_enabled,line_enabled=excluded.line_enabled,updated_at=now();
 return true;
end $$;
revoke all on function public.get_notification_channel_routes(text),public.save_notification_channel_route(text,text,boolean,boolean) from public,anon;
grant execute on function public.get_notification_channel_routes(text),public.save_notification_channel_route(text,text,boolean,boolean) to authenticated,service_role;
