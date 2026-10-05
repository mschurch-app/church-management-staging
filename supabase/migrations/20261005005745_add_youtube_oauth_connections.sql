create table if not exists public.youtube_oauth_connections (
  church_id text primary key check (church_id in ('M+', 'SHiNE')),
  channel_id text not null,
  channel_title text not null,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  granted_scope text not null,
  status text not null default 'connected' check (status in ('connected', 'expired', 'error')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.youtube_oauth_connections enable row level security;
revoke all on public.youtube_oauth_connections from anon, authenticated;
grant all on public.youtube_oauth_connections to service_role;
