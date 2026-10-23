-- Private configuration is populated separately with the authorized reviewers.
create table testimony_store.review_settings(
 church_id text primary key check(church_id='M+'),
 initial_staff_id uuid not null references public.pastoral_staff(id),
 final_staff_ids uuid[] not null check(cardinality(final_staff_ids) between 1 and 5),check(not(initial_staff_id=any(final_staff_ids))),
 receipt_staff_ids uuid[] not null default '{}' check(cardinality(receipt_staff_ids)<=5)
);
alter table testimony_store.submissions add column initial_reviewed_by uuid,
 add column initial_reviewed_at timestamptz,add column initial_review_note text not null default '';
create table testimony_store.notification_queue(
 id uuid primary key default gen_random_uuid(),submission_id uuid not null references testimony_store.submissions(id),
 stage text not null check(stage in ('receipt','initial','final')),staff_id uuid not null references public.pastoral_staff(id),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),
 attempt_count integer not null default 0,deliver_after timestamptz not null default now(),
 lease_id uuid,lease_until timestamptz,line_subject text,first_attempt_at timestamptz,sent_at timestamptz,error_code text,created_at timestamptz not null default now(),
 unique(submission_id,stage,staff_id)
);
create index testimony_notification_due on testimony_store.notification_queue(status,deliver_after);
alter table testimony_store.review_settings enable row level security;
alter table testimony_store.notification_queue enable row level security;
create policy testimony_settings_clients_denied on testimony_store.review_settings as restrictive for all to anon,authenticated using(false) with check(false);
create policy testimony_queue_clients_denied on testimony_store.notification_queue as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on testimony_store.review_settings,testimony_store.notification_queue from public,anon,authenticated;
grant select,insert,update on testimony_store.review_settings,testimony_store.notification_queue to service_role;

create function testimony_store.initial_reviewer(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(
  select 1 from testimony_store.review_settings c join public.pastoral_staff s on s.id=c.initial_staff_id
  join church_auth.accounts a on a.user_id=church_auth.canonical_account(s.app_user_id)
  where c.church_id='M+' and s.is_active and a.is_active
   and a.user_id=church_auth.canonical_account(p_user)
 )
$$;
create or replace function testimony_store.reviewer(p_user uuid,p_approve boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select (not p_approve and testimony_store.initial_reviewer(p_user)) or
 (p_user is not null and exists(select 1 from church_auth.accounts a
 join church_auth.grants g on g.user_id=a.user_id and g.church_id='M+' and g.permission='website_weekly'
 left join church_auth.account_feature_permissions f on f.user_id=a.user_id and f.church_id='M+' and f.feature_key='website_weekly'
 where a.user_id=church_auth.canonical_account(p_user) and a.is_active and coalesce(f.can_view,true)
 and exists(select 1 from church_auth.grants g2 where g2.user_id=a.user_id and g2.church_id='M+' and g2.permission='pastoral_chats')
 and (not p_approve or coalesce(f.can_approve,true))))
$$;
alter function testimony_store.call(text,jsonb) rename to call_before_initial_review;
create function testimony_store.call(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;s testimony_store.submissions;v jsonb;result jsonb;
begin
 if p_input is null or octet_length(p_input::text)>50000 then raise exception 'invalid_input';end if;
 if p_action='initial_review' then
  actor:=(p_input->>'actor')::uuid;
  if not testimony_store.initial_reviewer(actor) then raise exception 'forbidden';end if;
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'not_found';end if;
  if s.version is distinct from (p_input->>'version')::integer then raise exception 'version_conflict';end if;
  if s.status<>'pending' or s.initial_reviewed_at is not null then raise exception 'invalid_state';end if;
  v:=p_input->'review';
  if length(coalesce(v->>'note',''))>1000 then raise exception 'invalid_input';end if;
  if v->>'action'='approve' then
   if coalesce(v->>'confirmed','false')<>'true' or s.payload->>'consent' is distinct from 'true'
    or (jsonb_array_length(s.payload->'media')>0 and s.payload->>'media_consent' is distinct from 'true') then raise exception 'consent_required';end if;
   update testimony_store.submissions set initial_reviewed_by=actor,initial_reviewed_at=now(),initial_review_note=coalesce(v->>'note',''),version=version+1 where id=s.id returning * into s;
  elsif v->>'action'='return' then
   if length(trim(coalesce(v->>'note','')))=0 then raise exception 'note_required';end if;
   update testimony_store.submissions set status='needs_changes',initial_review_note=v->>'note',review_note=v->>'note',version=version+1 where id=s.id returning * into s;
  else raise exception 'invalid_state';end if;
  insert into testimony_store.audit(submission_id,actor,action,version,note) values(s.id,actor,'initial_'||(v->>'action'),s.version,s.initial_review_note);
  return jsonb_build_object('id',s.id,'status',s.status,'version',s.version);
 end if;
 if p_action='review' and p_input->'review'->>'action'='approve' and exists(select 1 from testimony_store.review_settings) then
  actor:=(p_input->>'actor')::uuid;
  if not testimony_store.reviewer(actor,true) then raise exception 'forbidden';end if;
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'not_found';end if;
  if s.initial_reviewed_at is null and not exists(select 1 from testimony_store.audit a where a.submission_id=s.id and a.action='approve') then raise exception 'initial_review_required';end if;
 end if;
 result:=testimony_store.call_before_initial_review(p_action,p_input);
 if p_action='list' then
  actor:=(p_input->>'actor')::uuid;
  result:=result||jsonb_build_object('can_initial_review',testimony_store.initial_reviewer(actor),'initial_review_enabled',exists(select 1 from testimony_store.review_settings),
   'items',coalesce((select jsonb_agg(item||jsonb_build_object('initial_reviewed_at',story.initial_reviewed_at,'initial_review_note',story.initial_review_note,'initial_review_satisfied',story.initial_reviewed_at is not null or exists(select 1 from testimony_store.audit a where a.submission_id=story.id and a.action='approve')))
   from jsonb_array_elements(result->'items') item join testimony_store.submissions story on story.id=(item->>'id')::uuid),'[]'::jsonb));
 end if;
 return result;
end $$;
create function testimony_store.queue_review_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare c testimony_store.review_settings;
begin
 select * into c from testimony_store.review_settings where church_id='M+';
 if not found then return new;end if;
 if old.status='uploading' and new.status='pending' then
  insert into testimony_store.notification_queue(submission_id,stage,staff_id) values(new.id,'initial',c.initial_staff_id) on conflict do nothing;
  insert into testimony_store.notification_queue(submission_id,stage,staff_id) select new.id,'receipt',staff_id from unnest(c.receipt_staff_ids) staff_id on conflict do nothing;
 elsif old.initial_reviewed_at is null and new.initial_reviewed_at is not null and new.status='pending' then
  insert into testimony_store.notification_queue(submission_id,stage,staff_id) select new.id,'final',staff_id from unnest(c.final_staff_ids) staff_id on conflict do nothing;
 end if;
 return new;
end $$;
create trigger testimony_review_notification after update of status,initial_reviewed_at on testimony_store.submissions for each row execute function testimony_store.queue_review_notification();

create function testimony_store.notification_jobs(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_action='claim' then
  update testimony_store.notification_queue q set status='cancelled',error_code='superseded_or_expired'
  from testimony_store.submissions s where q.submission_id=s.id and q.status in ('pending','processing')
   and (s.status<>'pending' or q.created_at<=now()-interval '7 days' or (q.stage='initial' and s.initial_reviewed_at is not null));
  update testimony_store.notification_queue set status='failed',error_code='attempt_limit' where status='processing' and lease_until<now() and attempt_count>=8;
  update testimony_store.notification_queue set status='failed',error_code='retry_window_elapsed' where status in ('pending','processing') and first_attempt_at<=now()-interval '24 hours';
  with due as (
   select id from testimony_store.notification_queue where attempt_count<8 and
    ((status='pending' and deliver_after<=now()) or (status='processing' and lease_until<now()))
   order by deliver_after,id for update skip locked limit 5
  ),claimed as (
   update testimony_store.notification_queue q set status='processing',attempt_count=attempt_count+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(q.first_attempt_at,now()),line_subject=coalesce(q.line_subject,(select s.line_subject from public.pastoral_staff s where s.id=q.staff_id))
   from due where q.id=due.id returning q.id,q.submission_id,q.stage,q.staff_id,q.lease_id,q.line_subject
  )select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
 elsif p_action='finish' then
  if coalesce(p_input->>'result','') not in ('sent','failed') then raise exception 'invalid_input';end if;
  update testimony_store.notification_queue set
   status=case when p_input->>'result'='sent' then 'sent' when attempt_count>=8 then 'failed' else 'pending' end,
   sent_at=case when p_input->>'result'='sent' then coalesce(sent_at,now()) else sent_at end,
   deliver_after=now()+least(5*power(2::double precision,greatest(attempt_count-1,0)),60)*interval '1 minute',lease_until=null,
   error_code=case when p_input->>'result'='sent' then null else left(coalesce(p_input->>'error','delivery_unconfirmed'),120) end
  where id=(p_input->>'id')::uuid and lease_id=(p_input->>'lease_id')::uuid and status='processing';
  return jsonb_build_object('saved',found);
 end if;
 raise exception 'invalid_action';
end $$;
create function public.testimony_notification_jobs(p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select testimony_store.notification_jobs(p_action,p_input)$$;
revoke all on all functions in schema testimony_store from public,anon,authenticated;
grant execute on function testimony_store.call(text,jsonb),testimony_store.notification_jobs(text,jsonb) to service_role;
revoke all on function public.testimony_notification_jobs(text,jsonb) from public,anon,authenticated;
grant execute on function public.testimony_notification_jobs(text,jsonb) to service_role;
notify pgrst,'reload schema';

-- Run the private outbox worker. The credential remains in Vault.
do $cron$ declare v_job bigint;begin
 if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
  v_job:=cron.schedule('testimony-review-line-every-minute','* * * * *',$job$
   select net.http_post(url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/testimony-review-notifications',
    headers:=jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' order by created_at desc limit 1)),body:='{}'::jsonb,timeout_milliseconds:=50000);
  $job$);
  perform cron.alter_job(v_job,active:=false);
 end if;
end $cron$;
