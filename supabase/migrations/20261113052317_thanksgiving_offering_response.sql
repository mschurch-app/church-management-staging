-- Isolated campaign intake. Public clients have no table or RPC access.
create schema if not exists offering_response;
revoke all on schema offering_response from public,anon,authenticated;
create table offering_response.settings(
 id boolean primary key default true check(id),enabled boolean not null default false,
 recipient_staff_id uuid references public.pastoral_staff(id),
 worker_hash text check(worker_hash is null or worker_hash ~ '^[0-9a-f]{64}$'),
 updated_at timestamptz not null default now()
);
insert into offering_response.settings(id)values(true);
create table offering_response.responses(
 id uuid primary key default gen_random_uuid(),idempotency_key uuid not null unique,
 reference_no text not null unique default 'TG26-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
 payload jsonb not null,fingerprint text not null,ip_hash text not null,
 status text not null default 'pending' check(status in ('pending','verified','manual')),
 version integer not null default 1,is_test boolean not null default false,created_at timestamptz not null default now(),
 reconciled_at timestamptz,reconciled_by uuid,reconciliation_note text not null default '',
 confirmed_amount bigint,confirmed_date date,bank_reference text,
 check(jsonb_typeof(payload)='object' and payload ?& array['donor_name','method','donation_date','amount_ntd','remitter_account_last5','contact_email','contact_phone','note','source','consent']),
 check(octet_length(payload::text)<=6000),check(payload->>'source'='thanksgiving_2026'),
 check(payload->>'consent'='true'),check(length(btrim(payload->>'donor_name'))between 1 and 60),
 check(payload->>'method' in ('bank_transfer','online')),
 check((payload->>'amount_ntd')::numeric between 1 and 100000000 and (payload->>'amount_ntd')::numeric=trunc((payload->>'amount_ntd')::numeric)),
 check(coalesce(payload->>'remitter_account_last5','') ~ '^([0-9]{5})?$'),
 check(payload->>'method'<>'bank_transfer' or payload->>'remitter_account_last5' ~ '^[0-9]{5}$'),
 check(nullif(payload->>'contact_email','') is not null or nullif(payload->>'contact_phone','')is not null),
 check(length(coalesce(payload->>'note',''))<=300),check(confirmed_amount is null or confirmed_amount>0)
);
create index offering_response_created_idx on offering_response.responses(created_at desc);
create index offering_response_rate_idx on offering_response.responses(ip_hash,created_at);
create unique index offering_response_verified_bank_ref_idx on offering_response.responses(bank_reference)where status='verified' and bank_reference is not null;
create table offering_response.deliveries(
 id uuid primary key default gen_random_uuid(),response_id uuid not null references offering_response.responses(id),
 channel text not null check(channel='line'),recipient text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','retry','failed','unknown')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_token uuid,leased_until timestamptz,
 provider_id text,error_code text,accepted_at timestamptz,created_at timestamptz not null default now(),unique(response_id,channel)
);
create index offering_response_due_idx on offering_response.deliveries(next_attempt_at)where status in ('queued','retry','sending');
create table offering_response.audit(id bigint generated always as identity primary key,response_id uuid references offering_response.responses(id),actor uuid,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table offering_response.rate_windows(ip_hash text not null,bucket timestamptz not null,hits integer not null,primary key(ip_hash,bucket));
alter table offering_response.settings enable row level security;
alter table offering_response.responses enable row level security;
alter table offering_response.deliveries enable row level security;
alter table offering_response.audit enable row level security;
alter table offering_response.rate_windows enable row level security;
revoke all on all tables in schema offering_response from public,anon,authenticated;
grant usage on schema offering_response to service_role;
grant select,insert,update on all tables in schema offering_response to service_role;
grant usage,select on all sequences in schema offering_response to service_role;

-- Narrow identity helpers read private Auth data; service-only EXECUTE, no arbitrary SQL.
create function offering_response.owner(p_actor uuid)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from church_auth.accounts a join church_auth.owners o on o.user_id=a.user_id join church_auth.accounts presented on presented.user_id=p_actor and presented.is_active where a.user_id=church_auth.canonical_account(p_actor) and a.is_active)
$$;
create function offering_response.can_manage(p_actor uuid)returns boolean language sql stable security invoker set search_path='' as $$
 select offering_response.owner(p_actor) or public.finance_user_can(p_actor,'approve')
$$;
create function offering_response.can_read(p_actor uuid)returns boolean language sql stable security invoker set search_path='' as $$
 select offering_response.can_manage(p_actor) or public.finance_user_can(p_actor,'entry') or public.finance_user_can(p_actor,'cash_verify')
$$;
revoke all on function offering_response.owner(uuid),offering_response.can_manage(uuid),offering_response.can_read(uuid) from public,anon,authenticated;
grant execute on function offering_response.owner(uuid),offering_response.can_manage(uuid),offering_response.can_read(uuid) to service_role;

create function offering_response.recipient()returns table(line_id text) language sql stable security definer set search_path='' as $$
 select s.line_subject from offering_response.settings c
 join public.pastoral_staff s on s.id=c.recipient_staff_id and s.is_active
 join church_auth.accounts a on a.user_id=church_auth.canonical_account(s.app_user_id) and a.is_active
 where c.id and s.line_subject ~ '^U[0-9a-f]{32}$'
 and exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web' and i.identity_data->>'sub'=s.line_subject)
$$;
revoke all on function offering_response.recipient() from public,anon,authenticated;
grant execute on function offering_response.recipient() to service_role;

create function public.thanksgiving_offering_service(p_action text,p_input jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg offering_response.settings%rowtype;r offering_response.responses%rowtype;job offering_response.deliveries%rowtype;
 actor uuid;owner boolean;can_manage boolean;fingerprint text;v_payload jsonb;line_id text;canonical uuid;result jsonb;changed integer;
begin
 if jsonb_typeof(p_input)is distinct from 'object' or octet_length(p_input::text)>18000 then raise exception 'invalid_input';end if;
 select * into strict cfg from offering_response.settings where id;
 if p_action='rate' then
  if p_input->>'ip_hash' !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input';end if;
  insert into offering_response.rate_windows as w values(p_input->>'ip_hash',date_trunc('hour',now()),1)
   on conflict(ip_hash,bucket)do update set hits=w.hits+1 where w.hits<12 returning hits into changed;
  return jsonb_build_object('allowed',found);
 end if;
 if p_action='submit' then
  if not cfg.enabled and coalesce(p_input->>'is_test','false')<>'true' then raise exception 'unavailable';end if;
  v_payload:=p_input->'payload';fingerprint:=encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('offering:'||(p_input->>'key'),0));
  select * into r from offering_response.responses where idempotency_key=(p_input->>'key')::uuid;
  if found then
   if r.fingerprint<>fingerprint then raise exception 'idempotency_conflict';end if;
   if (select count(*)from offering_response.deliveries where response_id=r.id and channel='line')<>1 then raise exception 'queue_incomplete';end if;
   return jsonb_build_object('status','accepted','reference_no',r.reference_no,'notifications_queued',true);
  end if;
  select target.line_id into line_id from offering_response.recipient() target;
  if not found then raise exception 'recipient_unavailable';end if;
  insert into offering_response.responses(idempotency_key,payload,fingerprint,ip_hash,is_test)values((p_input->>'key')::uuid,v_payload,fingerprint,p_input->>'ip_hash',coalesce((p_input->>'is_test')::boolean,false))returning * into r;
  insert into offering_response.deliveries(response_id,channel,recipient)values(r.id,'line',line_id);
  insert into offering_response.audit(response_id,action)values(r.id,'received');
  return jsonb_build_object('status','accepted','reference_no',r.reference_no,'notifications_queued',true);
 end if;
 if p_action in ('claim_jobs','finish_job') then
  if cfg.worker_hash is null or length(coalesce(p_input->>'worker_key',''))<>64 or cfg.worker_hash<>encode(sha256(convert_to(p_input->>'worker_key','UTF8')),'hex')then raise exception 'forbidden';end if;
  if p_action='claim_jobs' then
   -- Reuse the stable LINE retry key only within the provider's deduplication window.
   update offering_response.deliveries set status=case when created_at<now()-interval '23 hours' then 'unknown' else 'retry' end,error_code='lease_expired',lease_token=null,leased_until=null
    where status='sending' and leased_until<now();
   with due as(select d.id from offering_response.deliveries d join offering_response.responses rsp on rsp.id=d.response_id
    where d.status in ('queued','retry') and d.attempts<6 and d.next_attempt_at<=now() and (cfg.enabled or rsp.is_test)
    order by d.next_attempt_at for update of d skip locked limit 6),claimed as(
    update offering_response.deliveries d set status='sending',attempts=attempts+1,lease_token=gen_random_uuid(),leased_until=now()+interval '5 minutes'
    from due where d.id=due.id returning d.*)
   select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('payload',rsp.payload,'reference_no',rsp.reference_no,'is_test',rsp.is_test)),'[]')into result from claimed c join offering_response.responses rsp on rsp.id=c.response_id;
   return jsonb_build_object('jobs',result);
  end if;
  select * into job from offering_response.deliveries where id=(p_input->>'id')::uuid for update;
  if job.id is null or job.status<>'sending' or job.lease_token is distinct from (p_input->>'lease_token')::uuid then raise exception 'lease_conflict';end if;
  if p_input->>'status' not in ('sent','retry','failed','unknown') or length(coalesce(p_input->>'error_code',''))>60 or length(coalesce(p_input->>'provider_id',''))>200 then raise exception 'invalid_input';end if;
  update offering_response.deliveries set status=case when p_input->>'status'='retry' and attempts>=6 then 'failed' else p_input->>'status' end,
   provider_id=nullif(p_input->>'provider_id',''),error_code=nullif(p_input->>'error_code',''),accepted_at=case when p_input->>'status'='sent' then now()else null end,
   next_attempt_at=now()+least(3600,power(2,attempts)::integer*60)*interval '1 second',lease_token=null,leased_until=null where id=job.id;
  insert into offering_response.audit(response_id,action,details)values(job.response_id,'notification_result',jsonb_build_object('channel',job.channel,'status',p_input->>'status','attempt',job.attempts));
  return jsonb_build_object('ok',true);
 end if;
 actor:=(p_input->>'actor')::uuid;
 if actor is null or not offering_response.can_read(actor) then raise exception 'forbidden';end if;
 owner:=offering_response.owner(actor);can_manage:=offering_response.can_manage(actor);
 if p_action='admin_list' then
  select coalesce(jsonb_agg(to_jsonb(listing)||jsonb_build_object('deliveries',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'channel',d.channel,'status',d.status,'attempts',d.attempts,'error_code',d.error_code,'accepted_at',d.accepted_at,'provider_id',d.provider_id)),'[]')from offering_response.deliveries d where d.response_id=listing.id))order by listing.created_at desc),'[]')into result
   from(select id,reference_no,payload,status,version,created_at,is_test,reconciled_at,reconciliation_note,confirmed_amount,confirmed_date,bank_reference from offering_response.responses where is_test=coalesce((p_input->>'tests')::boolean,false)order by created_at desc limit 200) listing;
  return jsonb_build_object('items',result,'can_manage',can_manage,'owner',owner,'settings',case when owner then jsonb_build_object('enabled',cfg.enabled,'recipient_staff_id',cfg.recipient_staff_id,'worker_configured',cfg.worker_hash is not null)else null end);
 end if;
 if not can_manage then raise exception 'forbidden';end if;
 if p_action='reconcile' then
  select * into strict r from offering_response.responses where id=(p_input->>'id')::uuid for update;
  if r.version<>(p_input->>'version')::integer then raise exception 'version_conflict';end if;
  if p_input->>'status' not in ('pending','manual','verified') or length(btrim(coalesce(p_input->>'note','')))=0 or length(p_input->>'note')>500 then raise exception 'reason_required';end if;
  if p_input->>'status'='verified' and ((p_input->>'confirmed_amount')::bigint is distinct from (r.payload->>'amount_ntd')::bigint or nullif(p_input->>'confirmed_date','') is null or nullif(btrim(p_input->>'bank_reference'),'') is null)then raise exception 'reconciliation_required';end if;
  update offering_response.responses set status=p_input->>'status',version=version+1,reconciled_at=now(),reconciled_by=actor,reconciliation_note=p_input->>'note',confirmed_amount=case when p_input->>'status'='verified'then(p_input->>'confirmed_amount')::bigint else null end,confirmed_date=case when p_input->>'status'='verified'then(p_input->>'confirmed_date')::date else null end,bank_reference=case when p_input->>'status'='verified'then btrim(p_input->>'bank_reference')else null end where id=r.id;
  insert into offering_response.audit(response_id,actor,action,details)values(r.id,actor,'reconcile',jsonb_build_object('from',r.status,'to',p_input->>'status','note',p_input->>'note'));
  return jsonb_build_object('ok',true);
 end if;
 if p_action='retry' then
  select * into strict job from offering_response.deliveries where id=(p_input->>'id')::uuid for update;
  if job.status not in ('failed','retry') or (job.channel='line' and job.created_at<now()-interval '23 hours' and job.attempts>0)then raise exception 'manual_review_required';end if;
  update offering_response.deliveries set status='queued',attempts=0,next_attempt_at=now(),error_code=null where id=job.id;
  insert into offering_response.audit(response_id,actor,action,details)values(job.response_id,actor,'manual_retry',jsonb_build_object('channel',job.channel));return jsonb_build_object('ok',true);
 end if;
 if p_action='settings' then
  if not owner then raise exception 'forbidden';end if;
  if jsonb_typeof(p_input->'enabled')is distinct from 'boolean' then raise exception 'invalid_input';end if;
  if p_input->>'enabled'='true' and (cfg.worker_hash is null or not exists(select 1 from offering_response.recipient()) or not exists(select 1 from offering_response.responses test where test.is_test and exists(select 1 from offering_response.deliveries d join offering_response.recipient() current_target on current_target.line_id=d.recipient where d.response_id=test.id and d.channel='line' and d.status='sent'))) then raise exception 'acceptance_required';end if;
  update offering_response.settings set enabled=(p_input->>'enabled')::boolean,updated_at=now()where id;
  insert into offering_response.audit(actor,action,details)values(actor,'set_enabled',jsonb_build_object('enabled',p_input->'enabled'));return jsonb_build_object('ok',true);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.thanksgiving_offering_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.thanksgiving_offering_service(text,jsonb) to service_role;
notify pgrst,'reload schema';
