-- Self-enrollment is restricted to a new record and a server-verified LINE subject.
-- It never grants staff privileges or attaches an identity by name/phone alone.
alter table church_auth.member_bindings add column binding_source text not null default 'staff_review'
  check (binding_source in ('staff_review','line_newcomer'));
alter table church_auth.member_bindings drop constraint member_bindings_check;
alter table church_auth.member_bindings add constraint member_bindings_check
  check (not active or (approved_at is not null and (approved_by is not null or binding_source='line_newcomer')));
create table church_auth.line_newcomer_registrations (
 request_id uuid primary key references church_auth.newcomer_receipts(request_id),
 church_id text not null check(church_id in ('M+','SHiNE')),
 login_channel_id text not null check(login_channel_id='2011645391'),
 line_subject text not null check(line_subject ~ '^U[0-9a-f]{32}$'),
 member_id bigint not null references public.members(id),
 created_at timestamptz not null default now(),
 unique(church_id,login_channel_id,line_subject)
);
create index line_newcomer_registrations_member_idx on church_auth.line_newcomer_registrations(member_id);
alter table church_auth.line_newcomer_registrations enable row level security;
revoke all on church_auth.line_newcomer_registrations from public,anon,authenticated;
grant select,insert on church_auth.line_newcomer_registrations to service_role;

create function public.register_verified_line_newcomer(p_id uuid,p_church text,p_channel text,p_subject text,p_payload jsonb)
returns text language plpgsql set search_path='' as $fn$
declare prior church_auth.line_newcomer_registrations%rowtype; receipt church_auth.newcomer_receipts%rowtype;
 binding church_auth.member_bindings%rowtype; result text; new_member bigint; fingerprint text;
begin
 if p_id is null or p_church is null or p_church not in ('M+','SHiNE') or p_channel is distinct from '2011645391'
 or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended('newcomer-global',0));
 perform pg_advisory_xact_lock(hashtextextended(p_church||':'||p_channel||':'||p_subject,0));
 fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into prior from church_auth.line_newcomer_registrations where request_id=p_id;
 if found then
  select * into receipt from church_auth.newcomer_receipts where request_id=p_id;
  if prior.church_id<>p_church or prior.login_channel_id<>p_channel or prior.line_subject<>p_subject or receipt.payload_hash<>fingerprint then return 'conflict';end if;
  if not exists(select 1 from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and member_id=prior.member_id and active)then return 'review_required';end if;
  return 'accepted';
 end if;
 select * into binding from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject for update;
 if found then return case when binding.active then 'already_bound' else 'review_required' end;end if;
 if exists(select 1 from church_auth.line_newcomer_registrations where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject)
 or exists(select 1 from church_auth.binding_requests where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and status in ('revoked','rejected','approved')) then return 'review_required';end if;
 if exists(select 1 from church_auth.newcomer_receipts where request_id=p_id)then return 'conflict';end if;
 -- Potential existing family member: ask staff to verify rather than duplicate or disclose the matching record.
 if nullif(btrim(p_payload->>'phone'),'') is not null and exists(select 1 from public.members m where m.church_id=p_church and m.archived_at is null
 and btrim(m.name)=btrim(p_payload->>'name') and regexp_replace(coalesce(m.phone,''),'[^0-9]','','g')=regexp_replace(p_payload->>'phone','[^0-9]','','g'))then return 'review_required';end if;
 result:=public.register_staging_newcomer(p_id,p_church,p_payload);
 if result<>'accepted' then return result;end if;
 select member_id into strict new_member from church_auth.newcomer_receipts where request_id=p_id and church_id=p_church;
 insert into church_auth.member_bindings(church_id,login_channel_id,line_subject,member_id,active,approved_at,binding_source)
 values(p_church,p_channel,p_subject,new_member,true,now(),'line_newcomer');
 insert into church_auth.line_newcomer_registrations(request_id,church_id,login_channel_id,line_subject,member_id)
 values(p_id,p_church,p_channel,p_subject,new_member);
 update church_auth.binding_requests set status='approved',member_id=new_member where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and status='pending';
 if not found then
  insert into church_auth.binding_requests(id,church_id,login_channel_id,line_subject,applicant_name,applicant_phone,status,member_id)
  values(gen_random_uuid(),p_church,p_channel,p_subject,btrim(p_payload->>'name'),coalesce(nullif(btrim(p_payload->>'phone'),''),'未提供'),'approved',new_member);
 end if;
 return 'accepted';
end $fn$;
revoke all on function public.register_verified_line_newcomer(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_verified_line_newcomer(uuid,text,text,text,jsonb) to service_role;
