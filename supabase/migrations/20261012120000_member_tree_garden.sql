-- Formal member garden. Only the LINE-verifying Edge Function may access these APIs.
create table public.tree_garden_states (
  member_id bigint primary key references public.members(id),
  public_id uuid not null default gen_random_uuid() unique,
  state jsonb not null,
  version bigint not null default 0,
  team_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(state)='object')
);
create table public.tree_garden_invites (
  token uuid primary key default gen_random_uuid(),
  inviter bigint not null references public.members(id),
  church_id text not null,
  group_name text not null,
  expires_at timestamptz not null default now()+interval '7 days'
);
create index tree_garden_invites_owner on public.tree_garden_invites(inviter,expires_at);
create table public.tree_garden_care (
  sender bigint not null references public.members(id),
  recipient bigint not null references public.members(id),
  care_day date not null,
  request_id uuid not null,
  message text not null default '' check(length(message)<=120),
  created_at timestamptz not null default now(),
  primary key(sender,recipient,care_day),
  unique(sender,request_id),
  check(sender<>recipient)
);
create index tree_garden_care_received on public.tree_garden_care(recipient,care_day);
alter table public.tree_garden_states enable row level security;
alter table public.tree_garden_invites enable row level security;
alter table public.tree_garden_care enable row level security;
revoke all on public.tree_garden_states,public.tree_garden_invites,public.tree_garden_care from public,anon,authenticated;
grant select,insert,update on public.tree_garden_states,public.tree_garden_invites,public.tree_garden_care to service_role;

create function public.tree_garden_identity(p_channel text,p_subject text) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_ids bigint[];
begin
 if p_channel !~ '^[0-9]+$' or p_subject !~ '^U[0-9a-f]{32}$' then raise exception 'login_required'; end if;
 select array_agg(distinct m.id) into v_ids from church_auth.member_bindings b
 join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
 where b.active and b.login_channel_id=p_channel and b.line_subject=p_subject and b.church_id='M+';
 if coalesce(array_length(v_ids,1),0)<>1 then raise exception 'binding_required';end if;
 return v_ids[1];
end $$;
create function public.tree_garden_context(p_channel text,p_subject text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id bigint:=public.tree_garden_identity(p_channel,p_subject);v_today date:=(now() at time zone 'Asia/Taipei')::date;v_result jsonb;
begin
 select jsonb_build_object('member_id',m.id,'name',m.name,'group_name',m.group_name,'birthday_today',
 case when m.birthday ~ '^\d{4}-\d{2}-\d{2}$' then right(m.birthday,5)=to_char(v_today,'MM-DD') else false end,
 'state',s.state,'version',s.version,'team_enabled',coalesce(s.team_enabled,false)) into v_result
 from public.members m left join public.tree_garden_states s on s.member_id=m.id where m.id=v_id;
 return v_result;
end $$;
create function public.tree_garden_save(p_member bigint,p_version bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if octet_length(p_state::text)>4000000 then raise exception 'state_too_large';end if;
 update public.tree_garden_states set state=p_state,version=version+1,updated_at=now() where member_id=p_member and version=p_version;
 return found;
end $$;
create function public.tree_garden_team(p_channel text,p_subject text,p_action text,p_token uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id bigint:=public.tree_garden_identity(p_channel,p_subject);v_member public.members;v_invite public.tree_garden_invites;v_token uuid;v_enabled boolean;v_today date:=(now() at time zone 'Asia/Taipei')::date;
begin
 select * into v_member from public.members where id=v_id;
 if p_action='leave' then update public.tree_garden_states set team_enabled=false where member_id=v_id;end if;
 if p_action in ('invite','join') then
  if coalesce(btrim(v_member.group_name),'') in ('','未編組') then raise exception 'group_required';end if;
  if p_action='join' then
   select * into v_invite from public.tree_garden_invites where token=p_token and expires_at>now();
   if v_invite.token is null or v_invite.church_id<>v_member.church_id or v_invite.group_name<>v_member.group_name
    or not exists(select 1 from public.members m where m.id=v_invite.inviter and m.archived_at is null and m.church_id=v_member.church_id and m.group_name=v_member.group_name) then raise exception 'invite_invalid';end if;
  else
   select token into v_token from public.tree_garden_invites where inviter=v_id and church_id=v_member.church_id and group_name=v_member.group_name and expires_at>now()+interval '1 hour' order by expires_at desc limit 1;
   if v_token is null then insert into public.tree_garden_invites(inviter,church_id,group_name) values(v_id,v_member.church_id,v_member.group_name) returning token into v_token;end if;
  end if;
  update public.tree_garden_states set team_enabled=true where member_id=v_id;
 end if;
 select team_enabled into v_enabled from public.tree_garden_states where member_id=v_id;
 return jsonb_build_object('enabled',coalesce(v_enabled,false),'group_name',v_member.group_name,'invite',v_token,
 'members',case when v_enabled and coalesce(btrim(v_member.group_name),'') not in ('','未編組') then coalesce((
  select jsonb_agg(jsonb_build_object('id',s.public_id,'name',m.name,'self',m.id=v_id,
    'sent_today',exists(select 1 from public.tree_garden_care c where c.sender=v_id and c.recipient=m.id and c.care_day=v_today)))
  from public.tree_garden_states s join public.members m on m.id=s.member_id
  where s.team_enabled and m.archived_at is null and m.church_id=v_member.church_id and m.group_name=v_member.group_name
 ),'[]'::jsonb) else '[]'::jsonb end,
 'received',coalesce((select jsonb_agg(jsonb_build_object('name',m.name,'message',c.message))
 from public.tree_garden_care c join public.members m on m.id=c.sender
 where c.recipient=v_id and c.care_day=v_today and m.archived_at is null and m.church_id=v_member.church_id and m.group_name=v_member.group_name),'[]'::jsonb));
end $$;
create function public.tree_garden_send_care(p_channel text,p_subject text,p_recipient uuid,p_request uuid,p_message text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id bigint:=public.tree_garden_identity(p_channel,p_subject);v_receiver bigint;v_today date:=(now() at time zone 'Asia/Taipei')::date;v_state jsonb;v_hp int;v_mp int;v_care int;
begin
 if length(p_message)>120 then raise exception 'invalid_message';end if;
 select s.member_id into v_receiver from public.tree_garden_states s join public.members m on m.id=s.member_id
 join public.members own on own.id=v_id where s.public_id=p_recipient and s.team_enabled and m.archived_at is null
 and m.church_id=own.church_id and m.group_name=own.group_name and coalesce(btrim(own.group_name),'') not in ('','未編組');
 if v_receiver is null or v_receiver=v_id then raise exception 'care_forbidden';end if;
 -- Both directions acquire the same ordered row locks; daily limits are serialized.
 perform member_id from public.tree_garden_states where member_id in(v_id,v_receiver) order by member_id for update;
 if not exists(select 1 from public.tree_garden_states where member_id=v_id and team_enabled) then raise exception 'care_forbidden';end if;
 if exists(select 1 from public.tree_garden_care where sender=v_id and (request_id=p_request or recipient=v_receiver and care_day=v_today)) then return jsonb_build_object('already_sent',true);end if;
 if (select count(*) from public.tree_garden_care where sender=v_id and care_day=v_today)>=3 or (select count(*) from public.tree_garden_care where recipient=v_receiver and care_day=v_today)>=3 then raise exception 'care_limit';end if;
 select state into v_state from public.tree_garden_states where member_id=v_receiver;
 v_care:=coalesce((v_state#>>'{buffs,care}')::int,0);
 v_hp:=least(100,coalesce((v_state#>>'{life,hp}')::int,100)+10+case when v_care>0 then 10 else 0 end);
 v_mp:=least(100,coalesce((v_state#>>'{life,mp}')::int,100)+15+case when v_care>0 then 10 else 0 end);
 v_state:=jsonb_set(jsonb_set(jsonb_set(v_state,'{life,hp}',to_jsonb(v_hp)),'{life,mp}',to_jsonb(v_mp)),'{buffs,care}',to_jsonb(greatest(0,v_care-1)));
 update public.tree_garden_states set state=v_state,version=version+1,updated_at=now() where member_id=v_receiver;
 insert into public.tree_garden_care(sender,recipient,care_day,request_id,message) values(v_id,v_receiver,v_today,p_request,btrim(p_message));
 return jsonb_build_object('sent',true);
end $$;
revoke all on function public.tree_garden_identity(text,text),public.tree_garden_context(text,text),public.tree_garden_save(bigint,bigint,jsonb),public.tree_garden_team(text,text,text,uuid),public.tree_garden_send_care(text,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tree_garden_identity(text,text),public.tree_garden_context(text,text),public.tree_garden_save(bigint,bigint,jsonb),public.tree_garden_team(text,text,text,uuid),public.tree_garden_send_care(text,text,uuid,uuid,text) to service_role;
