begin;
create temporary table test_prayers(id bigint primary key,church_id text,care_audience text,author_name text,title text,content text);
create temporary table test_settings(id boolean,enabled boolean,group_id text);
insert into test_settings values(true,true,'C00000000000000000000000000000001');
create temporary table test_deliveries(
 id uuid primary key default gen_random_uuid(),
 prayer_id bigint not null unique references pg_temp.test_prayers(id),
 audience text not null check(audience in ('church','pastoral')),
 group_id text,
 message text not null,
 status text not null default 'waiting' check(status in ('waiting','sending','retryable','accepted','failed','uncertain')),
 attempts integer not null default 0,
 lease_id uuid,lease_until timestamptz,first_attempt_at timestamptz,next_attempt_at timestamptz not null default now(),
 accepted_at timestamptz,provider_request_id text,error_code text,created_at timestamptz not null default now(),
 check(audience='church' or message ~ '^https://mscos[.]mchurch[.]online/prayers[.]html[?]church=M%2B&prayer_id=[0-9]+$')
);

create function pg_temp.queue_member_care_delivery()returns trigger language plpgsql security definer set search_path='' as $$
declare gid text; link text;
begin
 if new.church_id<>'M+'or new.care_audience is null then return new;end if;
 select group_id into gid from pg_temp.test_settings where id=true and enabled;
 link:='https://mscos.mchurch.online/prayers.html?church=M%2B&prayer_id='||new.id;
 insert into pg_temp.test_deliveries(prayer_id,audience,group_id,message)values(new.id,new.care_audience,gid,
 case when new.care_audience='pastoral' then link else '【請一起代禱】'||chr(10)||new.author_name||chr(10)||new.title||chr(10)||chr(10)||new.content||chr(10)||chr(10)||'會友代禱清單：https://mscos.mchurch.online/prayer-request.html?church=M%2B'end);
 return new;
end;$$;
create function pg_temp.member_care_claim_deliveries()returns jsonb language plpgsql set search_path='' as $$
declare jobs jsonb;
begin
 update pg_temp.test_deliveries set status='uncertain',error_code='retry_window_expired',lease_id=null,lease_until=null where status in('waiting','sending','retryable')and first_attempt_at<now()-interval '23 hours';
 with claimed as(select id from pg_temp.test_deliveries where (status in('waiting','retryable')or(status='sending'and lease_until<now()))and next_attempt_at<=now() order by created_at limit 10 for update skip locked),changed as(
 update pg_temp.test_deliveries d set status='sending',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(first_attempt_at,now())from claimed c where d.id=c.id returning d.id,d.lease_id,d.group_id,d.message,d.audience)
 select coalesce(jsonb_agg(to_jsonb(changed)),'[]'::jsonb)into jobs from changed;
 return jsonb_build_object('ok',true,'items',jobs);
end;$$;
create function pg_temp.member_care_finish_delivery(p_id uuid,p_lease uuid,p_status text,p_provider text default null,p_error text default null)returns boolean language plpgsql set search_path='' as $$begin
 if p_status not in('retryable','accepted','failed')then raise exception 'invalid_input';end if;
 update pg_temp.test_deliveries set status=p_status,provider_request_id=left(p_provider,200),error_code=left(p_error,80),accepted_at=case when p_status='accepted'then now()end,lease_id=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,(60*power(2,least(attempts,6)))::int))where id=p_id and lease_id=p_lease and status='sending';return found;
end;$$;
create trigger test_notify after insert on test_prayers for each row execute function pg_temp.queue_member_care_delivery();
insert into test_prayers values(1,'M+','pastoral','私人名字','私人主題','不可出群的私密內容'),(2,'M+','church','合成公開名字','公開主題','公開代禱內容');
do $$declare q jsonb;x record;begin
 if(select count(*)from test_deliveries)<>2 then raise exception 'queue_count';end if;
 if(select message from test_deliveries where prayer_id=1)<>'https://mscos.mchurch.online/prayers.html?church=M%2B&prayer_id=1'then raise exception 'private_payload';end if;
 if not(select message like '%公開代禱內容%'from test_deliveries where prayer_id=2)then raise exception 'public_payload';end if;
 q:=pg_temp.member_care_claim_deliveries();if jsonb_array_length(q->'items')<>2 then raise exception 'claim_failed';end if;
 select * into x from test_deliveries where prayer_id=1;
 if not pg_temp.member_care_finish_delivery(x.id,x.lease_id,'accepted','synthetic',null)then raise exception 'finish_failed';end if;
 if pg_temp.member_care_finish_delivery(x.id,x.lease_id,'retryable',null,'stale')then raise exception 'old_lease_accepted';end if;
 q:=pg_temp.member_care_claim_deliveries();if q->'items'<>'[]'::jsonb then raise exception 'duplicate_claim';end if;
 update test_deliveries set first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 minute'where prayer_id=2;
 q:=pg_temp.member_care_claim_deliveries();if q->'items'<>'[]'::jsonb or(select status from test_deliveries where prayer_id=2)<>'uncertain'then raise exception 'unsafe_expired_retry';end if;
 if(select status from test_deliveries where prayer_id=1)<>'accepted'then raise exception 'accepted_requeued';end if;
end$$;
rollback;
select 'passed' as isolated_notification_tests;
