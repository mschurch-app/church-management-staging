-- Cover deputy_staff_id as the leading column for FK checks and deputy inbox lookups.
create index pastoral_leave_deputy_staff_idx
  on public.pastoral_staff_leave_requests(deputy_staff_id,entity_key,status,created_at desc)
  where deputy_staff_id is not null;
