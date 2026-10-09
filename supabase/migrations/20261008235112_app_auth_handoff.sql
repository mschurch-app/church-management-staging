-- Only the Edge Function may read an encrypted, short-lived App login handoff.
create table public.app_auth_handoffs (
  id uuid primary key,
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  cipher_payload jsonb not null check (octet_length(cipher_payload::text) <= 14000),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
alter table public.app_auth_handoffs enable row level security;
revoke all on public.app_auth_handoffs from public, anon, authenticated;
grant select, insert, delete on public.app_auth_handoffs to service_role;
create index app_auth_handoffs_expiry_idx on public.app_auth_handoffs(expires_at);
create index app_auth_handoffs_creator_idx on public.app_auth_handoffs(creator_user_id,created_at);
comment on table public.app_auth_handoffs is 'AES-GCM encrypted login handoffs; five minute lifetime, capability protected; no plaintext tokens.';

create or replace function church_auth.get_my_app_capabilities()
returns jsonb language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('is_owner',auth.uid() is not null and exists(select 1 from church_auth.owners where user_id=auth.uid())); $$;
revoke all on function church_auth.get_my_app_capabilities() from public, anon;
grant execute on function church_auth.get_my_app_capabilities() to authenticated;
create or replace function public.get_my_app_capabilities()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select church_auth.get_my_app_capabilities(); $$;
revoke all on function public.get_my_app_capabilities() from public, anon;
grant execute on function public.get_my_app_capabilities() to authenticated;
