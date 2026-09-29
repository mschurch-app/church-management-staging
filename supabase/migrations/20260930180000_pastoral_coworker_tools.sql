-- Coworker tools: private/team memos, personal attendance and leave, Drive photo archive metadata.
-- All writes/reads go through pastoral-coworker-tools after LINE ID-token verification.
create table public.pastoral_coworker_memos (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  content text not null default '' check (char_length(content) <= 8000),
  visibility text not null default 'personal' check (visibility in ('personal', 'team')),
  due_on date,
  created_by uuid not null references public.pastoral_staff(id) on delete cascade,
  updated_by uuid not null references public.pastoral_staff(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pastoral_coworker_memos_entity_visibility_idx
  on public.pastoral_coworker_memos(entity_key, visibility, created_at desc)
  where archived_at is null;
create index pastoral_coworker_memos_creator_idx
  on public.pastoral_coworker_memos(created_by, created_at desc)
  where archived_at is null;

create table public.pastoral_staff_attendance (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  staff_id uuid not null references public.pastoral_staff(id) on delete cascade,
  work_date date not null,
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_key, staff_id, work_date),
  check (clocked_out_at is null or clocked_in_at is not null),
  check (clocked_out_at is null or clocked_out_at >= clocked_in_at)
);
create index pastoral_staff_attendance_entity_date_idx
  on public.pastoral_staff_attendance(entity_key, work_date desc);

create table public.pastoral_staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  staff_id uuid not null references public.pastoral_staff(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  period text not null default 'full_day' check (period in ('full_day', 'morning', 'afternoon')),
  leave_type text not null check (leave_type in ('annual', 'personal', 'sick', 'family', 'other')),
  reason text not null default '' check (char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references public.pastoral_staff(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 90),
  check ((status in ('approved', 'rejected')) = (reviewed_at is not null))
);
create index pastoral_staff_leave_staff_idx
  on public.pastoral_staff_leave_requests(entity_key, staff_id, start_date desc);
create index pastoral_staff_leave_pending_idx
  on public.pastoral_staff_leave_requests(entity_key, status, start_date);

create table public.pastoral_drive_folder_settings (
  entity_key text primary key check (entity_key in ('mplus', 'shine', 'tcsc')),
  folder_id text not null check (char_length(btrim(folder_id)) between 10 and 200),
  configured_by uuid not null references public.pastoral_staff(id) on delete restrict,
  configured_at timestamptz not null default now()
);

create table public.pastoral_photo_archives (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  drive_file_id text not null unique,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  caption text not null default '' check (char_length(caption) <= 1000),
  album text not null default '' check (char_length(album) <= 120),
  uploaded_by uuid not null references public.pastoral_staff(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index pastoral_photo_archives_entity_created_idx
  on public.pastoral_photo_archives(entity_key, created_at desc);

alter table public.pastoral_coworker_memos enable row level security;
alter table public.pastoral_staff_attendance enable row level security;
alter table public.pastoral_staff_leave_requests enable row level security;
alter table public.pastoral_drive_folder_settings enable row level security;
alter table public.pastoral_photo_archives enable row level security;

revoke all on public.pastoral_coworker_memos, public.pastoral_staff_attendance,
  public.pastoral_staff_leave_requests, public.pastoral_drive_folder_settings,
  public.pastoral_photo_archives from public, anon, authenticated;
grant all on public.pastoral_coworker_memos, public.pastoral_staff_attendance,
  public.pastoral_staff_leave_requests, public.pastoral_drive_folder_settings,
  public.pastoral_photo_archives to service_role;
