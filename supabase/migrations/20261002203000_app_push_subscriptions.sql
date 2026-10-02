create table if not exists public.app_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  is_active boolean not null default true,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_push_subscriptions_user_active_idx
  on public.app_push_subscriptions(user_id, is_active);

alter table public.app_push_subscriptions enable row level security;

drop policy if exists "users manage own push subscriptions" on public.app_push_subscriptions;
create policy "users manage own push subscriptions"
  on public.app_push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.app_push_subscriptions from anon;
grant select, insert, update, delete on public.app_push_subscriptions to authenticated;

