-- October-only social layer. Existing teams, members, care and progress are retained.
create table public.october_team_profiles (
 line_subject text primary key references public.tree_reading_october_test_participants(line_subject) on delete cascade,
 share_avatar boolean not null default false,
 picture_url text,
 updated_at timestamptz not null default now(),
 check (picture_url is null or (length(picture_url)<=2048 and picture_url ~ '^https://([a-z0-9-]+\.)?line-scdn\.net/'))
);
create table public.october_team_interactions (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.tree_reading_october_teams(id) on delete cascade,
 sender text not null references public.tree_reading_october_test_participants(line_subject),
 recipient text references public.tree_reading_october_test_participants(line_subject),
 request_id uuid not null,
 kind text not null check(kind in ('bless','pray','support','request','care')),
 need text not null default 'prayer' check(need in ('hp','mp','both','prayer')),
 message text not null default '' check(length(message)<=200),
 target_id uuid references public.october_team_interactions(id),
 request_status text not null default 'open' check(request_status in ('open','responded','resolved')),
 hp_delta smallint not null default 0 check(hp_delta between 0 and 40),
 mp_delta smallint not null default 0 check(mp_delta between 0 and 40),
 interaction_day date not null default ((now() at time zone 'Asia/Taipei')::date),
 created_at timestamptz not null default now(),
 unique(sender,request_id),
 check(kind='request' or (recipient is not null and recipient<>sender))
);
create unique index october_team_one_kind_per_pair_day on public.october_team_interactions(sender,recipient,kind,interaction_day) where kind<>'request';
create index october_team_feed on public.october_team_interactions(team_id,created_at desc);
create index october_team_daily_receive on public.october_team_interactions(recipient,interaction_day);
alter table public.october_team_profiles enable row level security;
alter table public.october_team_interactions enable row level security;
revoke all on public.october_team_profiles,public.october_team_interactions from public,anon,authenticated;
grant select,insert,update,delete on public.october_team_profiles,public.october_team_interactions to service_role;

create function public.october_team_profile(p_subject text,p_share boolean,p_picture text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_share is null or not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then raise exception 'join_required';end if;
 if p_share and (p_picture is null or p_picture !~ '^https://([a-z0-9-]+\.)?line-scdn\.net/' or length(p_picture)>2048) then raise exception 'avatar_unavailable';end if;
 insert into public.october_team_profiles(line_subject,share_avatar,picture_url) values(p_subject,p_share,case when p_share then p_picture else null end)
 on conflict(line_subject) do update set share_avatar=excluded.share_avatar,picture_url=excluded.picture_url,updated_at=now();
 if not p_share then update public.october_team_direct_invites set picture_url=null where inviter=p_subject and status='pending';end if;
 return jsonb_build_object('saved',true,'share_avatar',p_share);
end $$;

create function public.october_team_interact(p_subject text,p_kind text,p_request uuid,p_recipient uuid default null,p_message text default '',p_target uuid default null,p_need text default 'prayer') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_today date:=(now() at time zone 'Asia/Taipei')::date;v_team uuid;v_receiver text;v_state jsonb;v_request public.october_team_interactions;v_prior public.october_team_interactions;v_id uuid;
 v_hp int:=0;v_mp int:=0;v_old_hp int;v_old_mp int;v_used_hp int;v_used_mp int;v_gift_hp int;v_gift_mp int;
begin
 if p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' or p_request is null or p_kind is null or p_kind not in ('bless','pray','support','request','resolve','care') then raise exception 'invalid_request';end if;
 if p_message is null or length(p_message)>200 or p_need is null or p_need not in ('hp','mp','both','prayer') then raise exception 'invalid_message';end if;
 if v_today<date '2026-10-01' or v_today>date '2026-10-31' then raise exception 'test_closed';end if;
 -- Same lock as existing team/care operations: never race a leave or concurrent gift.
 perform pg_catalog.pg_advisory_xact_lock(20261012,3101);
 select team_id into v_team from public.tree_reading_october_team_members where line_subject=p_subject;
 if v_team is null or not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then raise exception 'team_required';end if;
 if p_recipient is not null then
  select line_subject into v_receiver from public.tree_reading_october_team_members where public_id=p_recipient and team_id=v_team;
  if v_receiver is null or v_receiver=p_subject then raise exception 'care_forbidden';end if;
 end if;
 select * into v_prior from public.october_team_interactions where sender=p_subject and request_id=p_request;
 if found then
  if v_prior.team_id<>v_team or v_prior.kind<>p_kind or v_prior.recipient is distinct from v_receiver or v_prior.message<>btrim(p_message) or v_prior.target_id is distinct from p_target or v_prior.need<>p_need then raise exception 'invalid_request';end if;
  return jsonb_build_object('already_sent',true,'hp_delta',v_prior.hp_delta,'mp_delta',v_prior.mp_delta,'id',v_prior.id);
 end if;
 if p_target is not null then
  select * into v_request from public.october_team_interactions where id=p_target and team_id=v_team and kind='request' for update;
  if not found then raise exception 'request_unavailable';end if;
  if p_kind='resolve' then
   if v_request.sender<>p_subject then raise exception 'care_forbidden';end if;
   update public.october_team_interactions set request_status='resolved' where id=p_target;
   return jsonb_build_object('saved',true,'resolved',true);
  end if;
  if p_kind not in ('pray','support') or v_request.sender<>v_receiver or v_request.request_status='resolved' or (v_request.recipient is not null and v_request.recipient<>p_subject) then raise exception 'request_unavailable';end if;
 end if;
 if p_kind='resolve' then raise exception 'invalid_request';end if;
 if p_kind='request' then
  if (select count(*) from public.october_team_interactions where sender=p_subject and kind='request' and interaction_day=v_today)>=3 then raise exception 'request_limit';end if;
 else
  if v_receiver is null then raise exception 'care_forbidden';end if;
  select * into v_prior from public.october_team_interactions where sender=p_subject and recipient=v_receiver and kind=p_kind and interaction_day=v_today;
  if found then
   if p_target is not null then update public.october_team_interactions set request_status='responded' where id=p_target;end if;
   return jsonb_build_object('already_sent',true,'hp_delta',v_prior.hp_delta,'mp_delta',v_prior.mp_delta,'id',v_prior.id);
  end if;
  if p_kind='care' and exists(select 1 from public.tree_reading_october_team_care where sender=p_subject and recipient=v_receiver and care_day=v_today) then return jsonb_build_object('already_sent',true,'hp_delta',0,'mp_delta',0);end if;
  if p_kind='support' then
   if not exists(select 1 from public.tree_reading_october_test_progress where line_subject=p_subject and reading_date=v_today and completion_type in ('on_time','makeup')) then raise exception 'support_read_first';end if;
   if exists(select 1 from public.october_team_interactions where sender=p_subject and kind='support' and interaction_day=v_today) then raise exception 'supply_used';end if;
  elsif p_kind='care' then
   if (select count(*) from public.october_team_interactions where sender=p_subject and kind='care' and interaction_day=v_today)+(select count(*) from public.tree_reading_october_team_care where sender=p_subject and care_day=v_today)>=3 then raise exception 'care_limit';end if;
  elsif (select count(*) from public.october_team_interactions where sender=p_subject and kind=p_kind and interaction_day=v_today)>=10 then raise exception 'care_limit';end if;
  -- Preserve unrelated progress, lock recipient against game saves, and increment its version.
  perform line_subject from public.tree_reading_october_game_states where line_subject in(p_subject,v_receiver) order by line_subject for update;
  select state into v_state from public.tree_reading_october_game_states where line_subject=v_receiver;
  if v_state is null or not exists(select 1 from public.tree_reading_october_game_states where line_subject=p_subject) then raise exception 'care_forbidden';end if;
  select coalesce(sum(hp_delta),0),coalesce(sum(mp_delta),0) into v_used_hp,v_used_mp from public.october_team_interactions where recipient=v_receiver and interaction_day=v_today;
  select v_used_hp+coalesce(sum(hp_delta),0),v_used_mp+coalesce(sum(mp_delta),0) into v_used_hp,v_used_mp from public.tree_reading_october_team_care where recipient=v_receiver and care_day=v_today;
  v_gift_hp:=case p_kind when 'pray' then 10 when 'support' then 20 when 'care' then 10 else 0 end;
  v_gift_mp:=case p_kind when 'bless' then 10 when 'pray' then 5 when 'support' then 20 when 'care' then 15 else 0 end;
  v_old_hp:=greatest(0,least(100,coalesce((v_state#>>'{life,hp}')::int,100)));v_old_mp:=greatest(0,least(100,coalesce((v_state#>>'{life,mp}')::int,100)));
  v_hp:=least(100-v_old_hp,v_gift_hp,greatest(0,40-v_used_hp));v_mp:=least(100-v_old_mp,v_gift_mp,greatest(0,40-v_used_mp));
  if p_kind='support' and v_hp=0 and v_mp=0 then raise exception 'already_full';end if;
  if v_hp>0 or v_mp>0 then
   v_state:=jsonb_set(jsonb_set(v_state,'{life,hp}',to_jsonb(v_old_hp+v_hp)),'{life,mp}',to_jsonb(v_old_mp+v_mp));
   update public.tree_reading_october_game_states set state=v_state,version=version+1,updated_at=now() where line_subject=v_receiver;
  end if;
 end if;
 insert into public.october_team_interactions(team_id,sender,recipient,request_id,kind,need,message,target_id,hp_delta,mp_delta)
 values(v_team,p_subject,v_receiver,p_request,p_kind,p_need,btrim(p_message),p_target,v_hp,v_mp) returning id into v_id;
 if p_target is not null then update public.october_team_interactions set request_status='responded' where id=p_target;end if;
 return jsonb_build_object('sent',true,'id',v_id,'hp_delta',v_hp,'mp_delta',v_mp);
end $$;

create function public.october_team_social_view(p_subject text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_team uuid;v_members jsonb;v_feed jsonb;v_requests jsonb;v_supply int;v_share boolean;
begin
 if not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then raise exception 'join_required';end if;
 select team_id into v_team from public.tree_reading_october_team_members where line_subject=p_subject;
 select coalesce(share_avatar,false) into v_share from public.october_team_profiles where line_subject=p_subject;
 v_supply:=case when exists(select 1 from public.tree_reading_october_test_progress where line_subject=p_subject and reading_date=(now() at time zone 'Asia/Taipei')::date and completion_type in('on_time','makeup'))
 and not exists(select 1 from public.october_team_interactions where sender=p_subject and kind='support' and interaction_day=(now() at time zone 'Asia/Taipei')::date) then 1 else 0 end;
 if v_team is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.public_id,'name',p.display_name,'self',m.line_subject=p_subject,
   'picture',case when profile.share_avatar then profile.picture_url else null end,'avatar',g.state->>'avatarId',
   'hp',coalesce((g.state#>>'{life,hp}')::int,100),'mp',coalesce((g.state#>>'{life,mp}')::int,100),
   'read_today',exists(select 1 from public.tree_reading_october_test_progress r where r.line_subject=m.line_subject and r.reading_date=(now() at time zone 'Asia/Taipei')::date),
   'sent_today',exists(select 1 from public.tree_reading_october_team_care c where c.sender=p_subject and c.recipient=m.line_subject and c.care_day=(now() at time zone 'Asia/Taipei')::date) or exists(select 1 from public.october_team_interactions i where i.sender=p_subject and i.recipient=m.line_subject and i.kind='care' and i.interaction_day=(now() at time zone 'Asia/Taipei')::date),
   'sent_kinds',coalesce((select jsonb_agg(i.kind) from public.october_team_interactions i where i.sender=p_subject and i.recipient=m.line_subject and i.interaction_day=(now() at time zone 'Asia/Taipei')::date),'[]'::jsonb)
  ) order by m.joined_at,m.public_id),'[]'::jsonb) into v_members
  from public.tree_reading_october_team_members m join public.tree_reading_october_test_participants p on p.line_subject=m.line_subject
  left join public.october_team_profiles profile on profile.line_subject=m.line_subject left join public.tree_reading_october_game_states g on g.line_subject=m.line_subject where m.team_id=v_team;
  select coalesce(jsonb_agg(x.item order by x.at desc),'[]'::jsonb) into v_feed from (
   select i.created_at as at,jsonb_build_object('id',i.id,'kind',i.kind,'name',p.display_name,'recipient_name',r.display_name,'message',i.message,'created_at',i.created_at,'mine',i.sender=p_subject,'to_me',i.recipient=p_subject,'hp',i.hp_delta,'mp',i.mp_delta) as item
   from public.october_team_interactions i join public.tree_reading_october_test_participants p on p.line_subject=i.sender left join public.tree_reading_october_test_participants r on r.line_subject=i.recipient
   where i.team_id=v_team and (i.recipient is null or i.recipient=p_subject or i.sender=p_subject) and exists(select 1 from public.tree_reading_october_team_members m where m.line_subject=i.sender and m.team_id=v_team)
   order by i.created_at desc limit 20) x;
  select coalesce(jsonb_agg(x.item order by x.at desc),'[]'::jsonb) into v_requests from (
   select i.created_at as at,jsonb_build_object('id',i.id,'sender_id',m.public_id,'name',p.display_name,'message',i.message,'need',i.need,'status',i.request_status,'mine',i.sender=p_subject,'created_at',i.created_at) as item
   from public.october_team_interactions i join public.tree_reading_october_test_participants p on p.line_subject=i.sender join public.tree_reading_october_team_members m on m.line_subject=i.sender and m.team_id=v_team
   where i.team_id=v_team and i.kind='request' and i.request_status<>'resolved' and (i.recipient is null or i.recipient=p_subject or i.sender=p_subject) order by i.created_at desc limit 12) x;
 end if;
 return jsonb_build_object('members',coalesce(v_members,'[]'::jsonb),'activity',coalesce(v_feed,'[]'::jsonb),'requests',coalesce(v_requests,'[]'::jsonb),'supply',v_supply,'share_avatar',coalesce(v_share,false));
end $$;
revoke all on function public.october_team_profile(text,boolean,text),public.october_team_interact(text,text,uuid,uuid,text,uuid,text),public.october_team_social_view(text) from public,anon,authenticated;
grant execute on function public.october_team_profile(text,boolean,text),public.october_team_interact(text,text,uuid,uuid,text,uuid,text),public.october_team_social_view(text) to service_role;

-- Invitations are delivered inside the recipient's garden; no copied codes required.
create table public.october_team_direct_invites (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.tree_reading_october_teams(id) on delete cascade,
 inviter text not null references public.tree_reading_october_test_participants(line_subject),
 recipient text not null references public.tree_reading_october_test_participants(line_subject),
 request_id uuid not null,
 picture_url text,
 status text not null default 'pending' check(status in('pending','accepted','declined')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default least(now()+interval '7 days',timestamptz '2026-11-01 00:00:00+08'),
 unique(inviter,request_id),check(inviter<>recipient),
 check(picture_url is null or (length(picture_url)<=2048 and picture_url ~ '^https://([a-z0-9-]+\.)?line-scdn\.net/'))
);
create index october_team_inbox on public.october_team_direct_invites(recipient,status,expires_at);
alter table public.october_team_direct_invites enable row level security;
revoke all on public.october_team_direct_invites from public,anon,authenticated;
grant select,insert,update,delete on public.october_team_direct_invites to service_role;

create function public.october_team_invite_people(p_subject text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then raise exception 'join_required';end if;
 -- Opaque IDs only. Do not expose LINE subjects, photos or progress to non-teammates.
 insert into public.tree_reading_october_team_members(line_subject) select line_subject from public.tree_reading_october_test_participants on conflict(line_subject) do nothing;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.public_id,'name',p.display_name,'teammate',m.team_id is not null and m.team_id=own.team_id) order by p.display_name),'[]'::jsonb) into result
 from public.tree_reading_october_test_participants p join public.tree_reading_october_team_members m on m.line_subject=p.line_subject
 join public.tree_reading_october_team_members own on own.line_subject=p_subject where p.line_subject<>p_subject;
 return result;
end $$;

create function public.october_team_invite_person(p_subject text,p_recipient uuid,p_request uuid,p_picture text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_team uuid;v_receiver text;v_prior public.october_team_direct_invites;v_id uuid;
begin
 if p_request is null or not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then raise exception 'join_required';end if;
 if (now() at time zone 'Asia/Taipei')::date not between date '2026-10-01' and date '2026-10-31' then raise exception 'test_closed';end if;
 if p_picture is not null and (p_picture !~ '^https://([a-z0-9-]+\.)?line-scdn\.net/' or length(p_picture)>2048) then raise exception 'avatar_unavailable';end if;
 perform pg_catalog.pg_advisory_xact_lock(20261012,3101);
 select m.line_subject into v_receiver from public.tree_reading_october_team_members m join public.tree_reading_october_test_participants p on p.line_subject=m.line_subject where m.public_id=p_recipient;
 if v_receiver is null or v_receiver=p_subject then raise exception 'care_forbidden';end if;
 select * into v_prior from public.october_team_direct_invites where inviter=p_subject and request_id=p_request;
 if found then
  if v_prior.recipient<>v_receiver then raise exception 'invalid_request';end if;
  return jsonb_build_object('sent',true,'already_sent',true,'id',v_prior.id);
 end if;
 select team_id into v_team from public.tree_reading_october_team_members where line_subject=p_subject;
 if v_team is null then
  insert into public.tree_reading_october_teams default values returning id into v_team;
  insert into public.tree_reading_october_team_members(line_subject,team_id) values(p_subject,v_team) on conflict(line_subject) do update set team_id=excluded.team_id,joined_at=now();
 end if;
 if exists(select 1 from public.tree_reading_october_team_members where line_subject=v_receiver and team_id=v_team) then raise exception 'team_already_joined';end if;
 select * into v_prior from public.october_team_direct_invites where inviter=p_subject and recipient=v_receiver and team_id=v_team and status='pending' and expires_at>now() order by created_at desc limit 1;
 if found then return jsonb_build_object('sent',true,'already_sent',true,'id',v_prior.id);end if;
 if (select count(*) from public.october_team_direct_invites where inviter=p_subject and (created_at at time zone 'Asia/Taipei')::date=(now() at time zone 'Asia/Taipei')::date)>=10 then raise exception 'invite_limit';end if;
 insert into public.october_team_direct_invites(team_id,inviter,recipient,request_id,picture_url) values(v_team,p_subject,v_receiver,p_request,p_picture) returning id into v_id;
 -- Clicking Send discloses that the inviter's verified LINE portrait is shared in this invitation/team.
 if p_picture is not null then perform public.october_team_profile(p_subject,true,p_picture);end if;
 return jsonb_build_object('sent',true,'id',v_id);
end $$;

create function public.october_team_answer_invite(p_subject text,p_invite uuid,p_accept boolean,p_picture text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_invite public.october_team_direct_invites;v_current uuid;
begin
 if p_accept is null or not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then raise exception 'join_required';end if;
 if (now() at time zone 'Asia/Taipei')::date not between date '2026-10-01' and date '2026-10-31' then raise exception 'test_closed';end if;
 perform pg_catalog.pg_advisory_xact_lock(20261012,3101);
 select * into v_invite from public.october_team_direct_invites where id=p_invite and recipient=p_subject for update;
 if not found then raise exception 'invite_unavailable';end if;
 if v_invite.status<>'pending' then return jsonb_build_object('answered',true,'accepted',v_invite.status='accepted','already_answered',true);end if;
 if not p_accept then update public.october_team_direct_invites set status='declined' where id=p_invite;return jsonb_build_object('answered',true,'accepted',false);end if;
 if v_invite.expires_at<=now() or not exists(select 1 from public.tree_reading_october_team_members where line_subject=v_invite.inviter and team_id=v_invite.team_id) then raise exception 'invite_unavailable';end if;
 select team_id into v_current from public.tree_reading_october_team_members where line_subject=p_subject;
 if v_current is not null and v_current<>v_invite.team_id then perform public.october_garden_team(p_subject,'leave',null);end if;
 insert into public.tree_reading_october_team_members(line_subject,team_id) values(p_subject,v_invite.team_id) on conflict(line_subject) do update set team_id=excluded.team_id,joined_at=case when public.tree_reading_october_team_members.team_id is distinct from excluded.team_id then now() else public.tree_reading_october_team_members.joined_at end;
 if p_picture is not null then perform public.october_team_profile(p_subject,true,p_picture);end if;
 update public.october_team_direct_invites set status='accepted' where id=p_invite;
 return jsonb_build_object('answered',true,'accepted',true);
end $$;

create function public.october_team_invitation_view(p_subject text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.tree_reading_october_test_participants where line_subject=p_subject) then raise exception 'join_required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',p.display_name,'picture',i.picture_url,'avatar',g.state->>'avatarId','switch_team',own.team_id is not null and own.team_id<>i.team_id,'expires_at',i.expires_at) order by i.created_at desc),'[]'::jsonb) into result
 from public.october_team_direct_invites i join public.tree_reading_october_test_participants p on p.line_subject=i.inviter
 join public.tree_reading_october_team_members sender on sender.line_subject=i.inviter and sender.team_id=i.team_id
 left join public.tree_reading_october_team_members own on own.line_subject=p_subject left join public.tree_reading_october_game_states g on g.line_subject=i.inviter
 where i.recipient=p_subject and i.status='pending' and i.expires_at>now();
 return result;
end $$;
revoke all on function public.october_team_invite_people(text),public.october_team_invite_person(text,uuid,uuid,text),public.october_team_answer_invite(text,uuid,boolean,text),public.october_team_invitation_view(text) from public,anon,authenticated;
grant execute on function public.october_team_invite_people(text),public.october_team_invite_person(text,uuid,uuid,text),public.october_team_answer_invite(text,uuid,boolean,text),public.october_team_invitation_view(text) to service_role;
