-- Church credentials are separate from association story publishing credentials.
create table public.church_facebook_connections (
 church_id text primary key check(church_id='M+'),
 page_id text not null check(page_id='171944699561868'),
 page_name text not null,
 token_ciphertext text not null,
 token_iv text not null,
 connected_by uuid references auth.users(id),
 connected_at timestamptz not null default now(),
 last_verified_at timestamptz not null default now()
);
alter table public.church_facebook_connections enable row level security;
revoke all on public.church_facebook_connections from public,anon,authenticated;
grant all on public.church_facebook_connections to service_role;
create table public.church_facebook_connection_tickets (
 ticket_hash text primary key check(ticket_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 used_at timestamptz
);
alter table public.church_facebook_connection_tickets enable row level security;
revoke all on public.church_facebook_connection_tickets from public,anon,authenticated;
grant all on public.church_facebook_connection_tickets to service_role;
-- Token installation and capability consumption must commit together.
create function public.complete_church_facebook_connection(p_hash text,p_name text,p_ciphertext text,p_iv text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare actor uuid;
begin
 update public.church_facebook_connection_tickets set used_at=now()
 where ticket_hash=p_hash and used_at is null and expires_at>now() returning created_by into actor;
 if actor is null then return false; end if;
 insert into public.church_facebook_connections(church_id,page_id,page_name,token_ciphertext,token_iv,connected_by)
 values('M+','171944699561868',p_name,p_ciphertext,p_iv,actor)
 on conflict(church_id) do update set page_name=excluded.page_name,token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,connected_by=excluded.connected_by,connected_at=now(),last_verified_at=now();
 return true;
end $$;
revoke all on function public.complete_church_facebook_connection(text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_church_facebook_connection(text,text,text,text) to service_role;
