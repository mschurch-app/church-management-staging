-- Canva credentials and work-in-progress are server-only. Existing bulletins are untouched.
create table public.weekly_canva_connections (
  church_id text primary key check (church_id in ('M+','SHiNE')),
  credentials jsonb not null,
  expires_at timestamptz not null,
  connected_by uuid not null references auth.users(id),
  connected_at timestamptz not null default now(),
  templates jsonb not null default '{}'::jsonb,
  refresh_lease uuid,
  refresh_lease_until timestamptz
);
create table public.weekly_canva_oauth_states (
  state_hash text primary key,
  church_id text not null check (church_id in ('M+','SHiNE')),
  user_id uuid not null references auth.users(id),
  verifier jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create table public.weekly_canva_jobs (
  id uuid primary key,
  church_id text not null check (church_id in ('M+','SHiNE')),
  requested_by uuid not null references auth.users(id),
  -- A new, unsaved bulletin has a client-generated UUID; it need not exist yet.
  bulletin_id uuid not null,
  input jsonb not null,
  outputs jsonb not null,
  status text not null default 'working' check (status in ('working','ready','blocked')),
  last_error text,
  lease uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index weekly_canva_jobs_owner_idx on public.weekly_canva_jobs(requested_by,church_id,created_at desc);
alter table public.weekly_canva_connections enable row level security;
alter table public.weekly_canva_oauth_states enable row level security;
alter table public.weekly_canva_jobs enable row level security;
revoke all on public.weekly_canva_connections,public.weekly_canva_oauth_states,public.weekly_canva_jobs from public,anon,authenticated;
grant all on public.weekly_canva_connections,public.weekly_canva_oauth_states,public.weekly_canva_jobs to service_role;

create function public.claim_weekly_canva_job(p_id uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.weekly_canva_jobs set lease=p_lease,lease_until=now()+interval '120 seconds'
    where id=p_id and status='working' and (lease_until is null or lease_until<now());
  return found;
end;
$$;
create function public.claim_weekly_canva_refresh(p_church text,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.weekly_canva_connections set refresh_lease=p_lease,refresh_lease_until=now()+interval '60 seconds'
    where church_id=p_church and (refresh_lease_until is null or refresh_lease_until<now());
  return found;
end;
$$;
revoke all on function public.claim_weekly_canva_job(uuid,uuid),public.claim_weekly_canva_refresh(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_weekly_canva_job(uuid,uuid),public.claim_weekly_canva_refresh(text,uuid) to service_role;
notify pgrst,'reload schema';
