-- Task attachments remain private and are served only by the authenticated pastoral-tasks Edge Function.
create table if not exists public.pastoral_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.pastoral_tasks(id) on delete cascade,
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  object_path text not null unique,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/png',
    'image/webp'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  uploaded_by uuid not null references public.pastoral_staff(id),
  created_at timestamptz not null default now()
);

create index if not exists pastoral_task_attachments_task_created_idx
  on public.pastoral_task_attachments (task_id, created_at);

create table if not exists public.pastoral_task_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.pastoral_tasks(id) on delete cascade,
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  created_by uuid not null references public.pastoral_staff(id),
  report_text text not null check (char_length(btrim(report_text)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists pastoral_task_reports_task_created_idx
  on public.pastoral_task_reports (task_id, created_at);

alter table public.pastoral_task_attachments enable row level security;
alter table public.pastoral_task_reports enable row level security;
revoke all on table public.pastoral_task_attachments from public, anon, authenticated;
revoke all on table public.pastoral_task_reports from public, anon, authenticated;
grant all on table public.pastoral_task_attachments to service_role;
grant all on table public.pastoral_task_reports to service_role;

comment on table public.pastoral_task_attachments is
  'Private task-file metadata; only the LINE-authenticated pastoral-tasks Edge Function accesses this table.';
comment on table public.pastoral_task_reports is
  'Append-only progress reports for approved coworker tasks; only the LINE-authenticated pastoral-tasks Edge Function accesses this table.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pastoral-task-files',
  'pastoral-task-files',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
