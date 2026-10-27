alter table public.pastoral_staff_leave_requests
  add column calendar_sync_status text not null default 'not_applicable'
    check (calendar_sync_status in ('not_applicable', 'pending', 'synced', 'failed')),
  add column calendar_event_id text,
  add column calendar_synced_at timestamptz;

update public.pastoral_staff_leave_requests
set calendar_sync_status = 'pending'
where entity_key = 'mplus' and status = 'approved';
