-- Schedule preferences are scoped to each pastoral staff account.
create table if not exists public.pastoral_staff_schedule_preferences (
  staff_id uuid primary key references public.pastoral_staff(id) on delete cascade,
  rest_days smallint[] not null default '{}'::smallint[],
  work_start time not null default time '09:00',
  work_end time not null default time '17:00',
  timezone text not null default 'Asia/Taipei',
  allow_emergency_override boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint pastoral_staff_schedule_preferences_rest_days_valid
    check (rest_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint pastoral_staff_schedule_preferences_hours_valid
    check (work_start < work_end),
  constraint pastoral_staff_schedule_preferences_timezone_valid
    check (timezone = 'Asia/Taipei')
);

alter table public.pastoral_staff_schedule_preferences enable row level security;
create policy pastoral_staff_schedule_preferences_deny_anon
  on public.pastoral_staff_schedule_preferences
  for all to anon using (false) with check (false);
create policy pastoral_staff_schedule_preferences_deny_authenticated
  on public.pastoral_staff_schedule_preferences
  for all to authenticated using (false) with check (false);

comment on table public.pastoral_staff_schedule_preferences is
  '個別同工行程偏好；只能由驗證 LINE 身分的 pastoral-google-calendar Edge Function 以 service role 存取。';
comment on column public.pastoral_staff_schedule_preferences.rest_days is
  '週休日，0=週日、1=週一、...、6=週六；空陣列表示沒有固定週休日。';
