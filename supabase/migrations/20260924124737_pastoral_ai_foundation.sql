-- Applied to church-management-staging as migration 20260924124737_pastoral_ai_foundation.
-- This is additive: CHURCH MANAGEMENT already owns public.churches, public.members,
-- admin_users and the church_auth schema. Do not create duplicate users/member tables.

create extension if not exists vector with schema extensions;

create table if not exists public.pastoral_staff (
  id uuid primary key default gen_random_uuid(),
  line_subject text not null unique check (line_subject ~ '^U[0-9a-f]{32}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  role text not null check (role in ('pastor', 'secretary', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pastoral_staff_access (
  staff_id uuid not null references public.pastoral_staff(id) on delete cascade,
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  created_at timestamptz not null default now(),
  primary key (staff_id, entity_key)
);

create table if not exists public.pastoral_tasks (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '',
  task_type text not null default 'general',
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'completed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  assigned_to uuid references public.pastoral_staff(id) on delete set null,
  created_by uuid references public.pastoral_staff(id) on delete set null,
  approved_by uuid references public.pastoral_staff(id) on delete set null,
  idempotency_key text unique,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pastoral_tasks_entity_status_due_idx
  on public.pastoral_tasks (entity_key, status, due_at);
create index if not exists pastoral_tasks_assigned_status_idx
  on public.pastoral_tasks (assigned_to, status, created_at desc);

create table if not exists public.sermons (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  church_id text references public.churches(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  passage text not null default '',
  sermon_date date,
  outline jsonb not null default '{}'::jsonb check (jsonb_typeof(outline) = 'object'),
  full_text text not null default '',
  canva_rows jsonb not null default '[]'::jsonb check (jsonb_typeof(canva_rows) = 'array'),
  propresenter_text text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'published', 'archived')),
  created_by uuid references public.pastoral_staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((entity_key = 'mplus' and (church_id is null or church_id = 'M+'))
      or (entity_key = 'shine' and (church_id is null or church_id = 'SHiNE'))
      or (entity_key = 'tcsc' and church_id is null))
);
create index if not exists sermons_entity_date_idx
  on public.sermons (entity_key, sermon_date desc nulls last);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  source_type text not null check (source_type in ('sermon', 'meeting', 'teaching', 'document', 'other')),
  source_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  source_date date,
  source_reference text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (entity_key, source_type, source_id)
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_no integer not null check (chunk_no >= 0),
  content text not null check (char_length(btrim(content)) > 0),
  embedding extensions.vector(768),
  embedding_model text not null default 'gemini-embedding-001',
  created_at timestamptz not null default now(),
  unique (document_id, chunk_no)
);
create index if not exists knowledge_chunks_document_idx
  on public.knowledge_chunks (document_id, chunk_no);
create index if not exists knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists public.camps (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null check (entity_key in ('mplus', 'shine', 'tcsc')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  starts_on date,
  ends_on date,
  registration_open boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table if not exists public.camp_registrations (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.camps(id) on delete cascade,
  participant_name text not null check (char_length(btrim(participant_name)) between 1 and 120),
  guardian_name text,
  contact_phone text,
  jersey_size text check (jersey_size is null or jersey_size in ('S', 'M', 'L', 'XL')),
  is_paid boolean not null default false,
  paid_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists camp_registrations_camp_paid_idx
  on public.camp_registrations (camp_id, is_paid);
create index if not exists camp_registrations_camp_jersey_idx
  on public.camp_registrations (camp_id, jersey_size);

-- Member identity and milestone fields already live in public.members.
-- This table stores only sensitive visit notes, associated by the existing member ID.
create table if not exists public.pastoral_care_visits (
  id uuid primary key default gen_random_uuid(),
  member_id bigint not null references public.members(id) on delete cascade,
  visited_at timestamptz not null default now(),
  summary text not null default '',
  prayer_items text not null default '',
  scripture_recommendations text[] not null default '{}',
  created_by uuid references public.pastoral_staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pastoral_care_visits_member_date_idx
  on public.pastoral_care_visits (member_id, visited_at desc);

-- Only the server-side Supabase Edge Function service role accesses pastoral data.
-- Browser users cannot query these tables directly; staff and entity authorization
-- is checked against the LINE subject verified server-side and pastoral_staff_access.
alter table public.pastoral_staff enable row level security;
alter table public.pastoral_staff_access enable row level security;
alter table public.pastoral_tasks enable row level security;
alter table public.sermons enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.camps enable row level security;
alter table public.camp_registrations enable row level security;
alter table public.pastoral_care_visits enable row level security;

revoke all on public.pastoral_staff, public.pastoral_staff_access,
  public.pastoral_tasks, public.sermons, public.knowledge_documents,
  public.knowledge_chunks, public.camps, public.camp_registrations,
  public.pastoral_care_visits from public, anon, authenticated;
grant all on public.pastoral_staff, public.pastoral_staff_access,
  public.pastoral_tasks, public.sermons, public.knowledge_documents,
  public.knowledge_chunks, public.camps, public.camp_registrations,
  public.pastoral_care_visits to service_role;

create or replace function public.match_pastoral_knowledge(
  query_embedding extensions.vector(768),
  requested_entity text,
  result_limit integer default 10
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  source_type text,
  source_date date,
  source_reference text,
  content text,
  similarity real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.id, d.id, d.title, d.source_type, d.source_date,
         d.source_reference, k.content,
         (1 - (k.embedding OPERATOR(extensions.<=>) query_embedding))::real
  from public.knowledge_chunks k
  join public.knowledge_documents d on d.id = k.document_id
  where d.entity_key = requested_entity
    and requested_entity in ('mplus', 'shine', 'tcsc')
    and k.embedding is not null
  order by k.embedding OPERATOR(extensions.<=>) query_embedding
  limit greatest(1, least(coalesce(result_limit, 10), 50));
$$;
revoke all on function public.match_pastoral_knowledge(extensions.vector, text, integer)
  from public, anon, authenticated;
grant execute on function public.match_pastoral_knowledge(extensions.vector, text, integer)
  to service_role;
