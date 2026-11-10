-- All entrypoints are server-only. The Edge service supplies verified LINE identity.
alter table church_auth.member_bindings drop constraint member_bindings_binding_source_check;
alter table church_auth.member_bindings add constraint member_bindings_binding_source_check
 check(binding_source in ('staff_review','line_newcomer','line_verified_existing'));
alter table church_auth.member_bindings drop constraint member_bindings_check;
alter table church_auth.member_bindings add constraint member_bindings_check
 check(not active or (approved_at is not null and (approved_by is not null or binding_source in ('line_newcomer','line_verified_existing'))));

create table church_auth.member_claim_candidates(
 token uuid primary key default gen_random_uuid(), church_id text not null, login_channel_id text not null,
 line_subject text not null, member_id bigint not null references public.members(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
 verified_at timestamptz, verified_fingerprint text, verification_method text
);
create index member_claim_candidate_owner on church_auth.member_claim_candidates(church_id,login_channel_id,line_subject,created_at);
create index member_claim_candidate_member on church_auth.member_claim_candidates(member_id);
create table church_auth.member_claim_limits(
 church_id text not null,login_channel_id text not null,line_subject text not null,bucket date not null,
 searches integer not null default 0, attempts integer not null default 0,
 primary key(church_id,login_channel_id,line_subject,bucket)
);
create table church_auth.member_claim_receipts(
 request_id uuid primary key,church_id text not null,login_channel_id text not null,line_subject text not null,
 member_id bigint not null references public.members(id),candidate_token uuid not null references church_auth.member_claim_candidates(token),
 payload_hash text not null,verification_method text not null,created_at timestamptz not null default now()
);
create index member_claim_receipt_candidate on church_auth.member_claim_receipts(candidate_token);
create index member_claim_receipt_member on church_auth.member_claim_receipts(member_id);
alter table church_auth.member_claim_candidates enable row level security;
alter table church_auth.member_claim_limits enable row level security;
alter table church_auth.member_claim_receipts enable row level security;
revoke all on church_auth.member_claim_candidates,church_auth.member_claim_limits,church_auth.member_claim_receipts from public,anon,authenticated;
grant select,insert,update on church_auth.member_claim_candidates,church_auth.member_claim_limits to service_role;
grant select,insert on church_auth.member_claim_receipts to service_role;

create function church_auth.claim_phone(value text) returns text language sql immutable set search_path='' as $$
 select case when regexp_replace(coalesce(value,''),'[^0-9]','','g') ~ '^8869[0-9]{8}$'
 then '0'||substr(regexp_replace(value,'[^0-9]','','g'),4)
 else regexp_replace(coalesce(value,''),'[^0-9]','','g') end;
$$;
create function church_auth.claim_birthday(value text) returns text language plpgsql immutable set search_path='' as $$
declare parsed date; cleaned text:=replace(btrim(coalesce(value,'')),'/','-');
begin
 if cleaned !~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' then return null;end if;
 begin parsed:=cleaned::date;exception when others then return null;end;
 return to_char(parsed,'YYYY-MM-DD');
end $$;

create function public.verified_member_claim(p_church text,p_channel text,p_subject text,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate church_auth.member_claim_candidates%rowtype; person public.members%rowtype;
 query_text text; answer text; expected text; method text; answer_count integer; search_count integer; choices jsonb;
begin
 if p_church is null or p_church not in ('M+','SHiNE') or p_channel is distinct from '2011645391'
 or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' or jsonb_typeof(p_input) is distinct from 'object'
 or p_action is null or p_action not in ('search','select','verify') then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_church||':'||p_channel||':'||p_subject,0));
 if exists(select 1 from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject)
 or exists(select 1 from church_auth.binding_requests where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and status in ('revoked','rejected','approved'))
 then return jsonb_build_object('state','review_required');end if;
 insert into church_auth.member_claim_limits(church_id,login_channel_id,line_subject,bucket)
 values(p_church,p_channel,p_subject,current_date)on conflict do nothing;
 if p_action='search' then
  query_text:=btrim(p_input->>'query');
  if query_text is null or char_length(query_text) not between 1 and 80 then raise exception 'invalid_input';end if;
  update church_auth.member_claim_limits set searches=searches+1 where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and bucket=current_date returning searches into search_count;
  if search_count>120 then return jsonb_build_object('state','limited');end if;
  -- Names only. No roster ID, phone fragments, birthdays, church group or pastoral information.
  with matched as (select id,name from public.members where church_id=p_church and archived_at is null and starts_with(btrim(name),query_text) order by name,id limit 8),
  issued as (insert into church_auth.member_claim_candidates(church_id,login_channel_id,line_subject,member_id)
   select p_church,p_channel,p_subject,id from matched returning token,member_id)
  select coalesce(jsonb_agg(jsonb_build_object('token',i.token,'name',m.name) order by m.name,m.id),'[]'::jsonb) into choices from issued i join matched m on m.id=i.member_id;
  return jsonb_build_object('state','candidates','candidates',choices);
 end if;
 begin select * into candidate from church_auth.member_claim_candidates where token=(p_input->>'candidate')::uuid and church_id=p_church and login_channel_id=p_channel and line_subject=p_subject for update;
 exception when invalid_text_representation then return jsonb_build_object('state','expired');end;
 if not found or candidate.expires_at<=now() then return jsonb_build_object('state','expired');end if;
 select * into person from public.members where id=candidate.member_id and church_id=p_church and archived_at is null for share;
 if not found then return jsonb_build_object('state','expired');end if;
 if exists(select 1 from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and member_id=person.id)
 then return jsonb_build_object('state','review_required');end if;
 expected:=church_auth.claim_phone(person.phone);
 if expected ~ '^[0-9]{8,15}$' then method:='phone';
 else expected:=church_auth.claim_birthday(person.birthday);method:=case when expected is not null then 'birthday' else 'review' end;end if;
 if method='review' then return jsonb_build_object('state','review_required');end if;
 if p_action='select' then return jsonb_build_object('state','challenge','method',method);end if;
 update church_auth.member_claim_limits set attempts=attempts+1 where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and bucket=current_date returning attempts into answer_count;
 if answer_count>5 then return jsonb_build_object('state','limited');end if;
 answer:=case when method='phone' then church_auth.claim_phone(p_input->>'answer') else church_auth.claim_birthday(p_input->>'answer') end;
 if answer is null or answer<>expected then return jsonb_build_object('state','mismatch');end if;
 update church_auth.member_claim_candidates set verified_at=now(),verification_method=method,
 verified_fingerprint=encode(sha256(convert_to(jsonb_build_array(person.name,person.phone,person.birthday)::text,'UTF8')),'hex') where token=candidate.token;
 -- Only self-editable registration fields are returned after verification.
 return jsonb_build_object('state','verified','claimToken',candidate.token,'member',jsonb_build_object(
 'name',person.name,'phone',person.phone,'birthday',coalesce(church_auth.claim_birthday(person.birthday),''),
 'gender',person.gender,'district',person.district,'age_group',person.age_group,
 'faith_status',person.faith_status,'know_us_from',person.know_us_from,
 'desired_feelings',coalesce(person.desired_feelings,'{}'::text[]),'interest_tags',coalesce(person.interest_tags,'{}'::text[]))); 
end $$;
revoke all on function public.verified_member_claim(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.verified_member_claim(text,text,text,text,jsonb) to service_role;
revoke all on function church_auth.claim_phone(text),church_auth.claim_birthday(text) from public,anon,authenticated;
grant execute on function church_auth.claim_phone(text),church_auth.claim_birthday(text) to service_role;

create function church_auth.fill_missing_member_registration(p_member bigint,p_church text,p_payload jsonb)
returns void language plpgsql security invoker set search_path='' as $$begin
 update public.members set
 phone=case when church_auth.claim_phone(phone) !~ '^[0-9]{8,15}$' then coalesce(p_payload->>'phone','') else phone end,
 birthday=case when church_auth.claim_birthday(birthday) is null then nullif(p_payload->>'birthday','') else birthday end,
 gender=case when nullif(btrim(gender),'') is null then coalesce(p_payload->>'gender','') else gender end,
 district=case when nullif(btrim(district),'') is null then coalesce(p_payload->>'district','') else district end,
 age_group=case when nullif(btrim(age_group),'') is null then coalesce(p_payload->>'age_group','') else age_group end,
 know_us_from=case when nullif(btrim(know_us_from),'') is null then coalesce(p_payload->>'know_us_from','') else know_us_from end,
 desired_feelings=case when coalesce(cardinality(desired_feelings),0)=0 then array(select jsonb_array_elements_text(coalesce(p_payload->'desired_feelings','[]')))else desired_feelings end,
 interest_tags=case when coalesce(cardinality(interest_tags),0)=0 then array(select jsonb_array_elements_text(coalesce(p_payload->'interest_tags','[]')))else interest_tags end,
 photo_url=case when nullif(btrim(photo_url),'') is null then p_payload->>'photo_url' else photo_url end
 where id=p_member and church_id=p_church;

end $$;
revoke all on function church_auth.fill_missing_member_registration(bigint,text,jsonb) from public,anon,authenticated;
grant execute on function church_auth.fill_missing_member_registration(bigint,text,jsonb) to service_role;

create function public.complete_verified_member_claim(p_id uuid,p_church text,p_channel text,p_subject text,p_claim uuid,p_payload jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare candidate church_auth.member_claim_candidates%rowtype; person public.members%rowtype; previous church_auth.member_claim_receipts%rowtype; fingerprint text;
begin
 if p_id is null or p_claim is null or p_church is null or p_church not in ('M+','SHiNE') or p_channel is distinct from '2011645391'
 or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input';end if;
 -- Same lock order as newcomer registration, then member row: prevents competing enrollment/claim.
 perform pg_advisory_xact_lock(hashtextextended('newcomer-global',0));
 perform pg_advisory_xact_lock(hashtextextended(p_church||':'||p_channel||':'||p_subject,0));
 fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into previous from church_auth.member_claim_receipts where request_id=p_id;
 if found then
  if previous.church_id<>p_church or previous.login_channel_id<>p_channel or previous.line_subject<>p_subject or previous.candidate_token<>p_claim or previous.payload_hash<>fingerprint then return 'conflict';end if;
  if exists(select 1 from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and member_id=previous.member_id and active) then return 'accepted';end if;
  return 'review_required';
 end if;
 select * into candidate from church_auth.member_claim_candidates where token=p_claim and church_id=p_church and login_channel_id=p_channel and line_subject=p_subject for update;
 if not found or candidate.verified_at is null or candidate.expires_at<=now() then return 'claim_expired';end if;
 perform 1 from church_auth.binding_requests where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and status='pending' order by id for update;
 select * into person from public.members where id=candidate.member_id and church_id=p_church and archived_at is null for update;
 if not found then return 'review_required';end if;
 if candidate.verified_fingerprint<>encode(sha256(convert_to(jsonb_build_array(person.name,person.phone,person.birthday)::text,'UTF8')),'hex') then return 'claim_expired';end if;
 if btrim(p_payload->>'name') is distinct from btrim(person.name) then return 'claim_expired';end if;
 if exists(select 1 from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and (line_subject=p_subject or member_id=person.id))
 or exists(select 1 from church_auth.binding_requests where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and status in ('revoked','rejected','approved')) then return 'review_required';end if;
 if exists(select 1 from church_auth.newcomer_receipts where request_id=p_id)then return 'conflict';end if;
 -- Fill missing fields only; roster name, group, faith, pastoral notes and staff permissions remain untouched.
 perform church_auth.fill_missing_member_registration(person.id,p_church,p_payload);
 insert into church_auth.member_bindings(church_id,login_channel_id,line_subject,member_id,active,approved_at,binding_source)
 values(p_church,p_channel,p_subject,person.id,true,now(),'line_verified_existing');
 update church_auth.binding_requests set status='approved',member_id=person.id where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and status='pending';
 if not found then insert into church_auth.binding_requests(id,church_id,login_channel_id,line_subject,applicant_name,applicant_phone,status,member_id)
 values(gen_random_uuid(),p_church,p_channel,p_subject,person.name,coalesce(nullif(person.phone,''),p_payload->>'phone','未提供'),'approved',person.id);end if;
 insert into church_auth.member_claim_receipts(request_id,church_id,login_channel_id,line_subject,member_id,candidate_token,payload_hash,verification_method)
 values(p_id,p_church,p_channel,p_subject,person.id,p_claim,fingerprint,candidate.verification_method);
 return 'accepted';
end $$;
revoke all on function public.complete_verified_member_claim(uuid,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_verified_member_claim(uuid,text,text,text,uuid,jsonb) to service_role;

-- Unverifiable existing members can submit their own proposed details for staff review.
-- No roster data or binding is released until the normal staff approval succeeds.
create table church_auth.member_claim_reviews(
 request_id uuid primary key,binding_request_id uuid not null references church_auth.binding_requests(id),church_id text not null,
 login_channel_id text not null,line_subject text not null,member_id bigint not null references public.members(id),
 candidate_token uuid not null references church_auth.member_claim_candidates(token),payload jsonb not null,
 payload_hash text not null,created_at timestamptz not null default now()
);
create index member_claim_review_request on church_auth.member_claim_reviews(binding_request_id);
create index member_claim_review_member on church_auth.member_claim_reviews(member_id);
create index member_claim_review_candidate on church_auth.member_claim_reviews(candidate_token);
alter table church_auth.member_claim_reviews enable row level security;
revoke all on church_auth.member_claim_reviews from public,anon,authenticated;
grant select,insert on church_auth.member_claim_reviews to service_role;
create function public.submit_member_claim_review(p_id uuid,p_church text,p_channel text,p_subject text,p_claim uuid,p_payload jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare candidate church_auth.member_claim_candidates%rowtype; person public.members%rowtype;
 previous church_auth.member_claim_reviews%rowtype; fingerprint text; pending_id uuid;
begin
 if p_id is null or p_claim is null or p_church is null or p_church not in ('M+','SHiNE') or p_channel is distinct from '2011645391'
 or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_church||':'||p_channel||':'||p_subject,0));
 fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into previous from church_auth.member_claim_reviews where request_id=p_id;
 if found then
  if previous.church_id<>p_church or previous.login_channel_id<>p_channel or previous.line_subject<>p_subject or previous.candidate_token<>p_claim or previous.payload_hash<>fingerprint then return 'conflict';end if;
  return 'pending_review';
 end if;
 select id into pending_id from church_auth.binding_requests where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and status='pending' order by created_at desc,id desc limit 1 for update;
 select * into candidate from church_auth.member_claim_candidates where token=p_claim and church_id=p_church and login_channel_id=p_channel and line_subject=p_subject for update;
 if not found or candidate.expires_at<=now()then return 'claim_expired';end if;
 select * into person from public.members where id=candidate.member_id and church_id=p_church and archived_at is null for share;
 if not found or btrim(p_payload->>'name') is distinct from btrim(person.name)then return 'claim_expired';end if;
 if exists(select 1 from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and active)
 then return 'already_bound';end if;
 if (select count(*) from church_auth.member_claim_reviews where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and created_at>=now()-interval '1 day')>=3 then return 'limited';end if;
 if pending_id is null then
  pending_id:=p_id;
  insert into church_auth.binding_requests(id,church_id,login_channel_id,line_subject,applicant_name,applicant_phone,status)
  values(pending_id,p_church,p_channel,p_subject,person.name,coalesce(nullif(btrim(p_payload->>'phone'),''),'未提供'),'pending');
 else
  update church_auth.binding_requests set applicant_name=person.name,applicant_phone=coalesce(nullif(btrim(p_payload->>'phone'),''),'未提供')where id=pending_id;
 end if;
 insert into church_auth.member_claim_reviews(request_id,binding_request_id,church_id,login_channel_id,line_subject,member_id,candidate_token,payload,payload_hash)
 values(p_id,pending_id,p_church,p_channel,p_subject,person.id,p_claim,p_payload,fingerprint);
 return 'pending_review';
end $$;
revoke all on function public.submit_member_claim_review(uuid,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_member_claim_review(uuid,text,text,text,uuid,jsonb) to service_role;

create function church_auth.apply_approved_member_claim_review()returns trigger language plpgsql security invoker set search_path='' as $$
declare proposed jsonb;
begin
 if new.status='approved' and old.status='pending' and new.member_id is not null then
  select payload into proposed from church_auth.member_claim_reviews
  where binding_request_id=new.id and church_id=new.church_id and login_channel_id=new.login_channel_id and line_subject=new.line_subject and member_id=new.member_id order by created_at desc,request_id desc limit 1;
  if found then perform church_auth.fill_missing_member_registration(new.member_id,new.church_id,proposed);end if;
 end if;
 return new;
end $$;
revoke all on function church_auth.apply_approved_member_claim_review() from public,anon,authenticated;
create trigger apply_approved_member_claim_review after update of status on church_auth.binding_requests
for each row execute function church_auth.apply_approved_member_claim_review();
