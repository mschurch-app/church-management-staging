-- Data-only configuration. No leave records, recipients, or other event routes change.
-- M+ leave notifications use LINE; SHiNE remains silent.
begin;
update public.notification_channel_routes
set app_enabled = false,
    line_enabled = (church_id = 'M+'),
    updated_at = now()
where church_id in ('M+', 'SHiNE')
  and event_key in ('leave_substitute', 'leave_review', 'leave_result');
commit;

select church_id,event_key,app_enabled,line_enabled
from public.notification_channel_routes
where church_id in ('M+', 'SHiNE')
  and event_key in ('leave_substitute', 'leave_review', 'leave_result')
order by church_id,event_key;
