-- Retain the sender's name at the time of sending, alongside the frozen recipient and message.
alter table member_messaging.deliveries add column sender_name text not null default '';
update member_messaging.deliveries d set sender_name=coalesce((select display_name from church_auth.accounts a where a.user_id=d.actor),'歷史同工') where sender_name='';
alter table member_messaging.deliveries alter column sender_name drop default;
create or replace function member_messaging.operation(p_actor uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=church_auth.canonical_account(p_actor);ch text:=p_data->>'church';own boolean;can_send boolean;
 target uuid;r member_messaging.deliveries%rowtype;m public.members%rowtype;sub text;subs text[];req uuid;txt text;v integer;v_enabled boolean;
begin
 if nullif(p_data->>'session_id','') is null or not exists(select 1 from auth.sessions where id=(p_data->>'session_id')::uuid and user_id=p_actor) then raise exception 'session_revoked';end if;
 if ch is distinct from 'M+' then raise exception 'unsupported_church';end if;
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active)
 or not exists(select 1 from church_auth.accounts where user_id=a and is_active) then raise exception 'forbidden';end if;
 own:=exists(select 1 from church_auth.owners where user_id=a);
 can_send:=exists(select 1 from member_messaging.sender_permissions where user_id=a and church_id=ch and sender_permissions.enabled)
 and (own or exists(select 1 from church_auth.grants where user_id=a and church_id=ch and permission='members'))
 and not exists(select 1 from church_auth.account_feature_permissions where user_id=a and church_id=ch and feature_key='members' and not can_view);
 if p_action='access' then return jsonb_build_object('can_send',can_send,'can_manage',own);end if;
 if p_action in ('settings','set_permission') then
  if not own then raise exception 'forbidden';end if;
  if p_action='set_permission' then
   target:=church_auth.canonical_account((p_data->>'user_id')::uuid);
   if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'version') is distinct from 'number' then raise exception 'invalid_input';end if;
   if not exists(select 1 from church_auth.accounts where user_id=target and is_active) then raise exception 'account_inactive';end if;
   v_enabled:=(p_data->>'enabled')::boolean;v:=(p_data->>'version')::integer;
   -- Missing row is version zero; subsequent edits require its exact version.
   insert into member_messaging.sender_permissions(user_id,church_id,enabled,version,updated_by)
    select target,ch,v_enabled,1,a where v=0 on conflict do nothing;
   if not found then
    update member_messaging.sender_permissions s set enabled=v_enabled,version=s.version+1,updated_by=a,updated_at=now()
    where user_id=target and church_id=ch and version=v;
    if not found then raise exception 'version_conflict';end if;
   end if;
   insert into member_messaging.permission_audit(actor,target,church_id,enabled) values(a,target,ch,v_enabled);
  end if;
  return jsonb_build_object('accounts',coalesce((select jsonb_agg(x order by x.name) from(
   select ac.user_id,ac.display_name as name,ac.job_title,ac.is_active,
    coalesce(s.enabled,false) as enabled,coalesce(s.version,0) as version,
    exists(select 1 from church_auth.grants g where g.user_id=ac.user_id and g.church_id=ch and g.permission='members') or exists(select 1 from church_auth.owners o where o.user_id=ac.user_id) as has_members_access
   from church_auth.accounts ac left join member_messaging.sender_permissions s on s.user_id=ac.user_id and s.church_id=ch
   where church_auth.canonical_account(ac.user_id)=ac.user_id
  )x),'[]'::jsonb));
 end if;
 if p_action='history' then
  if not own and not can_send then raise exception 'forbidden';end if;
  if length(coalesce(p_data->>'member_search',''))>80 or length(coalesce(p_data->>'sender_search',''))>80 or coalesce((p_data->>'page')::integer,0) not between 0 and 10000 then raise exception 'invalid_input';end if;
  if (nullif(p_data->>'from','') is not null and (p_data->>'from')!~'^\d{4}-\d{2}-\d{2}$') or (nullif(p_data->>'to','') is not null and (p_data->>'to')!~'^\d{4}-\d{2}-\d{2}$') then raise exception 'invalid_input';end if;
  if nullif(p_data->>'from','')::date>coalesce(nullif(p_data->>'to','')::date,'infinity'::date) then raise exception 'invalid_input';end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from(
   select id,sender_name,member_name,message,status,created_at,accepted_at,error_code,provider_request_id
   from member_messaging.deliveries d where church_id=ch
   and strpos(lower(d.member_name),lower(coalesce(p_data->>'member_search','')))>0
   and strpos(lower(d.sender_name),lower(coalesce(p_data->>'sender_search','')))>0
   and (nullif(p_data->>'from','') is null or d.created_at>=((p_data->>'from')::date::timestamp at time zone 'Asia/Taipei'))
   and (nullif(p_data->>'to','') is null or d.created_at<(((p_data->>'to')::date+1)::timestamp at time zone 'Asia/Taipei'))
   order by created_at desc,id desc limit 26 offset(coalesce((p_data->>'page')::integer,0)*25)
  )x),'[]'::jsonb));
 end if;
 if not can_send then raise exception 'forbidden';end if;
 if p_action in ('finish','status') then
  select * into r from member_messaging.deliveries where id=(p_data->>'request_id')::uuid and actor=a and church_id=ch for update;
  if not found then raise exception 'not_found';end if;
  if p_action='finish' and r.status<>'accepted' then
   if r.attempt_token is distinct from (p_data->>'attempt_token')::uuid then raise exception 'attempt_changed';end if;
   if p_data->>'status' not in ('accepted','retryable','failed') then raise exception 'invalid_input';end if;
   update member_messaging.deliveries set status=p_data->>'status',provider_request_id=left(p_data->>'provider_request_id',100),error_code=left(p_data->>'error_code',80),
    accepted_at=case when p_data->>'status'='accepted' then now() else null end
    where id=r.id returning * into r;
  end if;
  return to_jsonb(r)-'line_subject'-'attempt_token';
 end if;
 select * into m from public.members where id=(p_data->>'member_id')::bigint and church_id=ch and archived_at is null;
 if not found then raise exception 'member_unavailable';end if;
 select array_agg(distinct b.line_subject) into subs from church_auth.member_bindings b
 where b.member_id=m.id and b.church_id=ch and b.login_channel_id='2011645391' and b.active and b.line_subject ~ '^U[0-9a-f]{32}$';
 if p_action='context' then
  return jsonb_build_object('member',jsonb_build_object('id',m.id,'name',m.name,'line_ready',coalesce(cardinality(subs),0)=1),
   'history',coalesce((select jsonb_agg(x) from(select id,sender_name,member_name,message,status,created_at,accepted_at,error_code from member_messaging.deliveries where church_id=ch and member_id=m.id order by created_at desc limit 10)x),'[]'::jsonb));
 end if;
 if p_action<>'prepare' then raise exception 'invalid_action';end if;
 req:=(p_data->>'request_id')::uuid;txt:=p_data->>'message';
 if req is null or txt is null or length(btrim(txt)) not between 1 and 5000 then raise exception 'invalid_input';end if;
 -- Serialize even requests with different IDs for the same sender and member.
 perform pg_advisory_xact_lock(hashtextextended(a::text||':'||m.id::text,0));
 select * into r from member_messaging.deliveries where id=req for update;
 if found then
  if r.actor<>a or r.member_id<>m.id or r.church_id<>ch or r.message<>txt then raise exception 'request_reused';end if;
  if r.status='accepted' then return (to_jsonb(r)-'line_subject'-'attempt_token')||jsonb_build_object('duplicate',true);end if;
  if now()-r.created_at>interval '23 hours' then raise exception 'retry_expired';end if;
  if r.status='failed' then raise exception 'delivery_failed';end if;
  if r.status='sending' and r.attempt_at>now()-interval '45 seconds' then raise exception 'delivery_busy';end if;
  if coalesce(cardinality(subs),0)<>1 or r.line_subject is distinct from subs[1] then raise exception 'binding_changed';end if;
 else
  if coalesce(cardinality(subs),0)<>1 then raise exception 'line_unavailable';end if;
  -- A fresh UUID must not bypass accidental double-click / refresh protection.
  if exists(select 1 from member_messaging.deliveries where actor=a and member_id=m.id and message=txt and created_at>now()-interval '23 hours' and status<>'failed') then raise exception 'duplicate_message';end if;
  insert into member_messaging.deliveries(id,actor,sender_name,church_id,member_id,member_name,line_subject,message) values(req,a,(select display_name from church_auth.accounts where user_id=a),ch,m.id,m.name,subs[1],txt) returning * into r;
 end if;
 update member_messaging.deliveries set status='sending',attempt_at=now(),attempt_token=gen_random_uuid(),error_code=null where id=req returning * into r;
 return to_jsonb(r);
end $$;
