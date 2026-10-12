-- Apply only to the isolated October test project svwgfgyxxgbqabosriom,
-- after october-garden.sql. No formal member/group tables are read or changed.
begin;
create table if not exists public.tree_reading_october_teams (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now()
);
create table if not exists public.tree_reading_october_team_members (
 line_subject text primary key references public.tree_reading_october_test_participants(line_subject) on delete cascade,
 public_id uuid not null default gen_random_uuid() unique,
 team_id uuid references public.tree_reading_october_teams(id) on delete set null,
 joined_at timestamptz not null default now()
);
create index if not exists october_team_members_team on public.tree_reading_october_team_members(team_id);
create table if not exists public.tree_reading_october_team_invites (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 team_id uuid not null references public.tree_reading_october_teams(id) on delete cascade,
 inviter text not null references public.tree_reading_october_test_participants(line_subject) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists october_team_invites_owner on public.tree_reading_october_team_invites(inviter,expires_at);
create table if not exists public.tree_reading_october_team_care (
 sender text not null references public.tree_reading_october_test_participants(line_subject) on delete cascade,
 recipient text not null references public.tree_reading_october_test_participants(line_subject) on delete cascade,
 team_id uuid references public.tree_reading_october_teams(id) on delete set null,
 care_day date not null check(care_day between date '2026-10-01' and date '2026-10-31'),
 request_id uuid not null,
 message text not null default '' check(length(message)<=120),
 hp_delta smallint not null check(hp_delta between 0 and 10),
 mp_delta smallint not null check(mp_delta between 0 and 15),
 created_at timestamptz not null default now(),
 primary key(sender,recipient,care_day),
 unique(sender,request_id),
 check(sender<>recipient)
);
create index if not exists october_team_care_received on public.tree_reading_october_team_care(recipient,care_day);
alter table public.tree_reading_october_teams enable row level security;
alter table public.tree_reading_october_team_members enable row level security;
alter table public.tree_reading_october_team_invites enable row level security;
alter table public.tree_reading_october_team_care enable row level security;
revoke all on public.tree_reading_october_teams,public.tree_reading_october_team_members,public.tree_reading_october_team_invites,public.tree_reading_october_team_care from public,anon,authenticated;
grant select,insert,update,delete on public.tree_reading_october_teams,public.tree_reading_october_team_members,public.tree_reading_october_team_invites to service_role;
grant select,insert on public.tree_reading_october_team_care to service_role;

-- The Edge Function verifies LINE and passes only its verified subject. A team
-- token can join a team, never enroll a new test participant or grant admin.
create or replace function public.october_garden_team(p_subject text,p_action text,p_token_hash text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_team uuid;v_target uuid;v_expires timestamptz;v_members jsonb;v_received jsonb;
begin
 if p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' then raise exception 'join_required';end if;
 if p_action is null or p_action not in ('team','invite','join','leave') then raise exception 'invalid_action';end if;
 if p_action<>'team' then
  if v_today<date '2026-10-01' or v_today>date '2026-10-31' then raise exception 'test_closed';end if;
  -- A short, test-only lock serializes membership changes and care. Ordinary
  -- reading saves use the same participant -> state row order below.
  perform pg_catalog.pg_advisory_xact_lock(20261012,3101);
  perform line_subject from public.tree_reading_october_test_participants where line_subject=p_subject for update;
  if not found then raise exception 'join_required';end if;
 elsif not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then
  raise exception 'join_required';
 end if;
 select team_id into v_team from public.tree_reading_october_team_members where line_subject=p_subject;
 if p_action='leave' then
  delete from public.tree_reading_october_team_invites where inviter=p_subject;
  update public.tree_reading_october_team_members set team_id=null where line_subject=p_subject;
  if v_team is not null and not exists(select 1 from public.tree_reading_october_team_members where team_id=v_team) then
   delete from public.tree_reading_october_teams where id=v_team;
  end if;
  v_team:=null;
 elsif p_action in ('invite','join') then
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invite_invalid';end if;
  if p_action='join' then
   select i.team_id into v_target from public.tree_reading_october_team_invites i
    join public.tree_reading_october_team_members inviter on inviter.line_subject=i.inviter and inviter.team_id=i.team_id
    join public.tree_reading_october_test_participants allowed on allowed.line_subject=i.inviter
    where i.token_hash=p_token_hash and i.expires_at>now();
   if v_target is null then raise exception 'invite_invalid';end if;
   if v_team is not null and v_team<>v_target then raise exception 'team_already_joined';end if;
   v_team:=v_target;
  elsif v_team is null then
   insert into public.tree_reading_october_teams default values returning id into v_team;
  end if;
  insert into public.tree_reading_october_team_members(line_subject,team_id) values(p_subject,v_team)
   on conflict(line_subject) do update set team_id=excluded.team_id,joined_at=case when public.tree_reading_october_team_members.team_id is distinct from excluded.team_id then now() else public.tree_reading_october_team_members.joined_at end;
  if p_action='invite' then
   v_expires:=least(now()+interval '7 days',timestamptz '2026-11-01 00:00:00+08');
   -- Store only SHA-256, never the shareable bearer token. Only one link per
   -- issuer remains active; asking for a fresh link revokes their previous one.
   delete from public.tree_reading_october_team_invites where inviter=p_subject;
   insert into public.tree_reading_october_team_invites(token_hash,team_id,inviter,expires_at) values(p_token_hash,v_team,p_subject,v_expires);
  end if;
 end if;
 if v_team is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.public_id,'name',p.display_name,'self',m.line_subject=p_subject,
   'sent_today',exists(select 1 from public.tree_reading_october_team_care c where c.sender=p_subject and c.recipient=m.line_subject and c.care_day=v_today)) order by m.joined_at,m.public_id),'[]'::jsonb)
   into v_members from public.tree_reading_october_team_members m
   join public.tree_reading_october_test_participants p on p.line_subject=m.line_subject where m.team_id=v_team;
  select coalesce(jsonb_agg(jsonb_build_object('name',p.display_name,'message',c.message) order by c.created_at),'[]'::jsonb)
   into v_received from public.tree_reading_october_team_care c
   join public.tree_reading_october_test_participants p on p.line_subject=c.sender
   join public.tree_reading_october_team_members m on m.line_subject=c.sender and m.team_id=v_team
   where c.recipient=p_subject and c.team_id=v_team and c.care_day=v_today;
 end if;
 return jsonb_build_object('enabled',v_team is not null,'group_name','同工同行小隊','invite',null,'invite_expires_at',v_expires,
  'members',coalesce(v_members,'[]'::jsonb),'received',coalesce(v_received,'[]'::jsonb));
end $$;

create or replace function public.october_garden_send_care(p_subject text,p_recipient uuid,p_request uuid,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_receiver text;v_team uuid;v_state jsonb;v_hp int;v_mp int;v_old_hp int;v_old_mp int;
 v_prior public.tree_reading_october_team_care;
begin
 if p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' or p_recipient is null or p_request is null then raise exception 'invalid_request';end if;
 if p_message is null or length(p_message)>120 then raise exception 'invalid_message';end if;
 if v_today<date '2026-10-01' or v_today>date '2026-10-31' then raise exception 'test_closed';end if;
 perform pg_catalog.pg_advisory_xact_lock(20261012,3101);
 select line_subject into v_receiver from public.tree_reading_october_team_members where public_id=p_recipient;
 if v_receiver is null or v_receiver=p_subject then raise exception 'care_forbidden';end if;
 -- The global team lock prevents leave/join races. Ordered participant/state
 -- locks also serialize limits and prevent concurrent game saves erasing care.
 perform line_subject from public.tree_reading_october_test_participants where line_subject in(p_subject,v_receiver) order by line_subject for update;
 if not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject)
  or not exists(select 1 from public.tree_reading_october_test_participants where line_subject=v_receiver) then raise exception 'care_forbidden';end if;
 perform line_subject from public.tree_reading_october_game_states where line_subject in(p_subject,v_receiver) order by line_subject for update;
 select own.team_id into v_team from public.tree_reading_october_team_members own
  join public.tree_reading_october_team_members receiver on receiver.line_subject=v_receiver and receiver.team_id=own.team_id
  where own.line_subject=p_subject and own.team_id is not null;
 if v_team is null then raise exception 'care_forbidden';end if;
 select * into v_prior from public.tree_reading_october_team_care where sender=p_subject and request_id=p_request;
 if found then
  if v_prior.recipient<>v_receiver or v_prior.message<>btrim(p_message) then raise exception 'invalid_request';end if;
  return jsonb_build_object('already_sent',true,'hp_delta',v_prior.hp_delta,'mp_delta',v_prior.mp_delta);
 end if;
 select * into v_prior from public.tree_reading_october_team_care where sender=p_subject and recipient=v_receiver and care_day=v_today;
 if found then return jsonb_build_object('already_sent',true,'hp_delta',v_prior.hp_delta,'mp_delta',v_prior.mp_delta);end if;
 if (select count(*) from public.tree_reading_october_team_care where sender=p_subject and care_day=v_today)>=3
  or (select count(*) from public.tree_reading_october_team_care where recipient=v_receiver and care_day=v_today)>=3 then raise exception 'care_limit';end if;
 select state into v_state from public.tree_reading_october_game_states where line_subject=v_receiver;
 if v_state is null or not exists(select 1 from public.tree_reading_october_game_states where line_subject=p_subject) then raise exception 'care_forbidden';end if;
 v_old_hp:=greatest(0,least(100,coalesce((v_state#>>'{life,hp}')::int,100)));
 v_old_mp:=greatest(0,least(100,coalesce((v_state#>>'{life,mp}')::int,100)));
 v_hp:=least(100,v_old_hp+10);v_mp:=least(100,v_old_mp+15);
 -- October's existing fountain buff still belongs to watering. Do not consume
 -- it, alter reading/journal rows, or replace any other recipient game state.
 v_state:=jsonb_set(jsonb_set(v_state,'{life,hp}',to_jsonb(v_hp)),'{life,mp}',to_jsonb(v_mp));
 update public.tree_reading_october_game_states set state=v_state,version=version+1,updated_at=now() where line_subject=v_receiver;
 insert into public.tree_reading_october_team_care(sender,recipient,team_id,care_day,request_id,message,hp_delta,mp_delta)
  values(p_subject,v_receiver,v_team,v_today,p_request,btrim(p_message),v_hp-v_old_hp,v_mp-v_old_mp);
 return jsonb_build_object('sent',true,'hp_delta',v_hp-v_old_hp,'mp_delta',v_mp-v_old_mp);
end $$;
revoke all on function public.october_garden_team(text,text,text),public.october_garden_send_care(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.october_garden_team(text,text,text),public.october_garden_send_care(text,uuid,uuid,text) to service_role;
comment on table public.tree_reading_october_teams is 'Coworker-only teams for the isolated October Proverbs test; no formal group membership.';
comment on table public.tree_reading_october_team_invites is 'Hashed expiring team tokens; valid only for already enrolled October test participants.';
commit;
