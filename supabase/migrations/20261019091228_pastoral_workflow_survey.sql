-- One current response per staff member, entity, and survey version.
-- The Edge Function verifies Church OS or LINE identity before service-role access.
create table if not exists public.pastoral_workflow_survey_responses (
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  staff_id uuid not null references public.pastoral_staff(id) on delete cascade,
  survey_version smallint not null default 1 check (survey_version between 1 and 100),
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 65536),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity_key, staff_id, survey_version)
);

create index if not exists pastoral_workflow_survey_entity_updated_idx
  on public.pastoral_workflow_survey_responses (entity_key, survey_version, updated_at desc);

alter table public.pastoral_workflow_survey_responses enable row level security;
revoke all on public.pastoral_workflow_survey_responses from public, anon, authenticated;
grant select, insert, update on public.pastoral_workflow_survey_responses to service_role;

comment on table public.pastoral_workflow_survey_responses is
  '同工自填工作流程調查，僅驗證身分的 Edge Function 以 service role 存取；牧師／管理者只能讀取自己所屬單位。';
