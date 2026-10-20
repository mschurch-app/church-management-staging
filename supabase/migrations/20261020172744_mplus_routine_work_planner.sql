-- Service-only storage. Every request is authenticated and scoped in the calendar function.
create table public.mplus_work_routines (
 id uuid primary key, created_by uuid not null references public.pastoral_staff(id),
 primary_staff_id uuid not null references public.pastoral_staff(id),
 participant_ids uuid[] not null default '{}', title text not null check(length(title) between 1 and 200),
 definition jsonb not null, fingerprint text not null,
 google_event_id text not null unique,
 status text not null default 'pending' check(status in ('pending','active','stopped')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.mplus_work_routines(created_by,status);
create index on public.mplus_work_routines(primary_staff_id,status);
create table public.mplus_work_onboarding (
 staff_id uuid not null references public.pastoral_staff(id), campaign text not null,
 no_routines boolean not null default false, finished_at timestamptz not null default now(),
 primary key(staff_id,campaign)
);
create table public.mplus_event_reports (
 event_id text primary key, reported_by uuid not null references public.pastoral_staff(id),
 outcome text not null check(outcome in ('completed','cancelled')),
 note text not null check(length(note) between 1 and 3000), context jsonb not null default '{}', sync_status text not null default 'pending' check(sync_status in ('pending','synced')), reported_at timestamptz not null default now()
);
alter table public.mplus_work_routines enable row level security;
alter table public.mplus_work_onboarding enable row level security;
alter table public.mplus_event_reports enable row level security;
revoke all on public.mplus_work_routines,public.mplus_work_onboarding,public.mplus_event_reports from anon,authenticated;
grant select,insert,update on public.mplus_work_routines,public.mplus_work_onboarding,public.mplus_event_reports to service_role;
comment on table public.mplus_work_onboarding is 'M+ routine setup progress per verified staff, shared across browsers. No background AI jobs.';

-- Independent receipts: no changes to existing notification tables or constraints.
create table public.mplus_work_notifications (
 idempotency_key text primary key, recipient_staff_id uuid not null references public.pastoral_staff(id),
 event_key text not null, related_id text not null,
 app_status text not null, line_status text not null, status text not null,
 updated_at timestamptz not null default now()
);
alter table public.mplus_work_notifications enable row level security;
revoke all on public.mplus_work_notifications from anon,authenticated;
grant select,insert,update on public.mplus_work_notifications to service_role;
