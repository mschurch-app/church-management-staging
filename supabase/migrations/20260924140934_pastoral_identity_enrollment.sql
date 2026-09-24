-- Applied to church-management-staging as migration 20260924140934_pastoral_identity_enrollment.
-- Invite claims record only a verified LINE subject; they do not grant pastoral workspace access.
create table public.pastoral_identity_enrollments (
  id uuid primary key default gen_random_uuid(),
  intended_name text not null check (char_length(btrim(intended_name)) between 1 and 120),
  invite_code_hash text not null unique check (invite_code_hash ~ '^[0-9a-f]{64}$'),
  expected_line_subject text check (expected_line_subject is null or expected_line_subject ~ '^U[0-9a-f]{32}$'),
  claimed_line_subject text check (claimed_line_subject is null or claimed_line_subject ~ '^U[0-9a-f]{32}$'),
  claimed_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((claimed_line_subject is null) = (claimed_at is null))
);
create unique index pastoral_identity_enrollments_claimed_subject_uidx
  on public.pastoral_identity_enrollments (claimed_line_subject)
  where claimed_line_subject is not null;
alter table public.pastoral_identity_enrollments enable row level security;
revoke all on public.pastoral_identity_enrollments from public, anon, authenticated;
grant all on public.pastoral_identity_enrollments to service_role;

create or replace function public.claim_pastoral_identity_invite(
  p_code_hash text,
  p_line_subject text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.pastoral_identity_enrollments%rowtype;
begin
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_line_subject !~ '^U[0-9a-f]{32}$' then
    return 'invalid';
  end if;

  select * into v_invite
  from public.pastoral_identity_enrollments
  where invite_code_hash = p_code_hash
    and claimed_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    return 'invalid';
  end if;
  if v_invite.expected_line_subject is not null
     and v_invite.expected_line_subject <> p_line_subject then
    return 'identity_mismatch';
  end if;
  if exists (select 1 from public.pastoral_staff s where s.line_subject = p_line_subject) then
    return 'already_authorized';
  end if;
  if exists (
    select 1 from public.pastoral_identity_enrollments e
    where e.claimed_line_subject = p_line_subject
  ) then
    return 'already_claimed';
  end if;

  update public.pastoral_identity_enrollments
  set claimed_line_subject = p_line_subject, claimed_at = now()
  where id = v_invite.id;
  return 'claimed';
end;
$$;
revoke all on function public.claim_pastoral_identity_invite(text, text)
  from public, anon, authenticated;
grant execute on function public.claim_pastoral_identity_invite(text, text)
  to service_role;
