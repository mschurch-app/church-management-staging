create table if not exists public.pastoral_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  notification_type text not null check (notification_type in ('calendar_participant', 'task_assigned', 'task_accepted')),
  recipient_staff_id uuid references public.pastoral_staff(id) on delete set null,
  related_id text not null,
  idempotency_key text not null unique,
  status text not null check (status in ('sent', 'failed', 'not_configured')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists pastoral_notification_deliveries_entity_created_idx
  on public.pastoral_notification_deliveries (entity_key, created_at desc);
create index if not exists pastoral_notification_deliveries_recipient_created_idx
  on public.pastoral_notification_deliveries (recipient_staff_id, created_at desc);

alter table public.pastoral_notification_deliveries enable row level security;
revoke all on table public.pastoral_notification_deliveries from anon, authenticated;
grant all on table public.pastoral_notification_deliveries to service_role;
