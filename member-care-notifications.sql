begin;
create table church_auth.member_care_deliveries(
 id uuid primary key default gen_random_uuid(),
 prayer_id bigint not null unique references public.prayers(id),
 audience text not null check(audience in ('church','pastoral')),
 group_id text,
 message text not null,
 status text not null default 'waiting' check(status in ('waiting','sending','retryable','accepted','failed','uncertain')),
 attempts integer not null default 0,
 lease_id uuid,lease_until timestamptz,first_attempt_at timestamptz,next_attempt_at timestamptz not null default now(),
 accepted_at timestamptz,provider_request_id text,error_code text,created_at timestamptz not null default now(),
 check(audience='church' or message ~ '^https://mscos[.]mchurch[.]online/prayers[.]html[?]church=M%2B&prayer_id=[0-9]+$')
);
alter table church_auth.member_care_deliveries enable row level security;
revoke all on church_auth.member_care_deliveries from public,anon,authenticated;
grant all on church_auth.member_care_deliveries to service_role;
create index member_care_deliveries_pending on church_auth.member_care_deliveries(next_attempt_at)where status in('waiting','sending','retryable');
create function church_auth.queue_member_care_delivery()returns trigger language plpgsql security definer set search_path='' as $$
declare gid text; link text;
begin
 if new.church_id<>'M+'or new.care_audience is null then return new;end if;
 select group_id into gid from public.line_group_summary_settings where id=true and enabled;
 link:='https://mscos.mchurch.online/prayers.html?church=M%2B&prayer_id='||new.id;
 insert into church_auth.member_care_deliveries(prayer_id,audience,group_id,message)values(new.id,new.care_audience,gid,
 case when new.care_audience='pastoral' then link else '【請一起代禱】'||chr(10)||new.author_name||chr(10)||new.title||chr(10)||chr(10)||new.content||chr(10)||chr(10)||'會友代禱清單：https://mscos.mchurch.online/prayer-request.html?church=M%2B'end);
 return new;
end;$$;
revoke all on function church_auth.queue_member_care_delivery()from public,anon,authenticated;
create trigger queue_member_care_delivery after insert on public.prayers for each row execute function church_auth.queue_member_care_delivery();
create function public.member_care_claim_deliveries()returns jsonb language plpgsql set search_path='' as $$
declare jobs jsonb;
begin
 update church_auth.member_care_deliveries set status='uncertain',error_code='retry_window_expired',lease_id=null,lease_until=null where status in('waiting','sending','retryable')and first_attempt_at<now()-interval '23 hours';
 with claimed as(select id from church_auth.member_care_deliveries where (status in('waiting','retryable')or(status='sending'and lease_until<now()))and next_attempt_at<=now() order by created_at limit 10 for update skip locked),changed as(
 update church_auth.member_care_deliveries d set status='sending',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(first_attempt_at,now())from claimed c where d.id=c.id returning d.id,d.lease_id,d.group_id,d.message,d.audience)
 select coalesce(jsonb_agg(to_jsonb(changed)),'[]'::jsonb)into jobs from changed;
 return jsonb_build_object('ok',true,'items',jobs);
end;$$;
create function public.member_care_finish_delivery(p_id uuid,p_lease uuid,p_status text,p_provider text default null,p_error text default null)returns boolean language plpgsql set search_path='' as $$begin
 if p_status not in('retryable','accepted','failed')then raise exception 'invalid_input';end if;
 update church_auth.member_care_deliveries set status=p_status,provider_request_id=left(p_provider,200),error_code=left(p_error,80),accepted_at=case when p_status='accepted'then now()end,lease_id=null,lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,(60*power(2,least(attempts,6)))::int))where id=p_id and lease_id=p_lease and status='sending';return found;
end;$$;
revoke all on function public.member_care_claim_deliveries()from public,anon,authenticated;
revoke all on function public.member_care_finish_delivery(uuid,uuid,text,text,text)from public,anon,authenticated;
grant execute on function public.member_care_claim_deliveries()to service_role;
grant execute on function public.member_care_finish_delivery(uuid,uuid,text,text,text)to service_role;
select cron.schedule('member-care-line-notifications','* * * * *',$job$
 select net.http_post(url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/member-care',headers:=jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' order by created_at desc limit 1)),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=50000);
$job$);
commit;
