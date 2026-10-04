create table if not exists public.instagram_publishing_connections (
  church_id text primary key check (church_id in ('M+', 'SHiNE')),
  instagram_user_id text not null,
  username text not null,
  account_type text,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'expired', 'disconnected', 'error')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.instagram_publishing_connections enable row level security;
revoke all on table public.instagram_publishing_connections from anon, authenticated;
comment on table public.instagram_publishing_connections is 'Encrypted Instagram publishing credentials. Service role access only.';
