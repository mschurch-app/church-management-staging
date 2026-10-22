-- Real submissions only. All records and media stay private until explicit approval.
create schema testimony_store;
revoke all on schema testimony_store from public,anon,authenticated;
create table testimony_store.submissions(
 id uuid primary key, capability_hash text not null check(length(capability_hash)=64),
 ip_hash text not null check(length(ip_hash)=64), payload jsonb not null check(octet_length(payload::text)<40000),
 status text not null default 'uploading' check(status in ('uploading','pending','published','needs_changes','unpublished')),
 version integer not null default 1, review_note text not null default '',reviewed_by uuid,
 created_at timestamptz not null default now(), submitted_at timestamptz,reviewed_at timestamptz,
 expires_at timestamptz not null default now()+interval '2 hours'
);
create index testimony_status_date on testimony_store.submissions(status,created_at desc);
create index testimony_rate_window on testimony_store.submissions(created_at,ip_hash);
create table testimony_store.audit(
 id bigint generated always as identity primary key,submission_id uuid not null references testimony_store.submissions(id),
 actor uuid not null,action text not null,version integer not null,note text not null,created_at timestamptz not null default now()
);
create index testimony_audit_submission on testimony_store.audit(submission_id);
alter table testimony_store.submissions enable row level security;
alter table testimony_store.audit enable row level security;
create policy testimony_clients_denied on testimony_store.submissions as restrictive for all to anon,authenticated using (false) with check (false);
create policy testimony_clients_denied on testimony_store.audit as restrictive for all to anon,authenticated using (false) with check (false);
revoke all on all tables in schema testimony_store from public,anon,authenticated;
revoke all on all sequences in schema testimony_store from public,anon,authenticated;

create function testimony_store.reviewer(p_user uuid,p_approve boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user is not null and exists(select 1 from church_auth.accounts a
 join church_auth.grants g on g.user_id=a.user_id and g.church_id='M+' and g.permission='website_weekly'
 left join church_auth.account_feature_permissions f on f.user_id=a.user_id and f.church_id='M+' and f.feature_key='website_weekly'
 where a.user_id=church_auth.canonical_account(p_user) and a.is_active and coalesce(f.can_view,true)
 and exists(select 1 from church_auth.grants g2 where g2.user_id=a.user_id and g2.church_id='M+' and g2.permission='pastoral_chats')
 and (not p_approve or coalesce(f.can_approve,true)))
$$;

create function testimony_store.call(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s testimony_store.submissions; v jsonb; a jsonb; actor uuid; result jsonb;
begin
 if p_input is null or octet_length(p_input::text)>50000 then raise exception 'invalid_input';end if;
 if p_action='public' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.d desc) from (
   select jsonb_build_object('id',id,'title',payload->>'title','body',payload->>'body','category',payload->>'category',
    'display_name',payload->>'display_name','published_at',reviewed_at,'media',payload->'media') item,reviewed_at d
   from testimony_store.submissions where status='published' and payload->>'consent'='true'
    and (jsonb_array_length(payload->'media')=0 or payload->>'media_consent'='true')
   order by reviewed_at desc limit 100)x),'[]'::jsonb));
 elsif p_action in ('list','review','admin_media') then
  actor:=(p_input->>'actor')::uuid;
  if not testimony_store.reviewer(actor,p_action='review') then raise exception 'forbidden';end if;
  if p_action='list' then
   return jsonb_build_object('can_approve',testimony_store.reviewer(actor,true),'items',coalesce((select jsonb_agg(x.item order by x.d desc) from(
    select jsonb_build_object('id',id,'status',status,'version',version,'created_at',created_at,'submitted_at',submitted_at,
     'review_note',review_note,'reviewed_at',reviewed_at,'payload',payload) item,created_at d
    from testimony_store.submissions where status<>'uploading' order by created_at desc limit 200)x),'[]'::jsonb));
  end if;
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid and status<>'uploading' for update;
  if not found then raise exception 'not_found';end if;
  if p_action='admin_media' then return s.payload->'media';end if;
  if s.version is distinct from (p_input->>'version')::integer then raise exception 'version_conflict';end if;
  v:=p_input->'review';
  if v->>'action'='approve' then
   if coalesce(v->>'confirmed','false')<>'true' or s.payload->>'consent' is distinct from 'true' or
    (jsonb_array_length(s.payload->'media')>0 and s.payload->>'media_consent' is distinct from 'true') then raise exception 'consent_required';end if;
   if s.status not in ('pending','needs_changes','unpublished') then raise exception 'invalid_state';end if;
   s.status:='published';
  elsif v->>'action'='return' then
   if length(trim(coalesce(v->>'note','')))=0 then raise exception 'note_required';end if;s.status:='needs_changes';
  elsif v->>'action'='unpublish' and s.status='published' then s.status:='unpublished';
  else raise exception 'invalid_state';end if;
  if length(coalesce(v->>'note',''))>1000 then raise exception 'invalid_input';end if;
  update testimony_store.submissions set status=s.status,version=version+1,review_note=coalesce(v->>'note',''),reviewed_by=actor,reviewed_at=now()
   where id=s.id returning * into s;
  insert into testimony_store.audit(submission_id,actor,action,version,note) values(s.id,actor,v->>'action',s.version,s.review_note);
  return jsonb_build_object('id',s.id,'status',s.status,'version',s.version);
 elsif p_action='prepare' then
  perform pg_catalog.pg_advisory_xact_lock(728312,1);
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid;
  if found then
   if s.capability_hash<>p_input->>'capability_hash' or s.payload<>p_input->'payload' then raise exception 'request_conflict';end if;
   if s.status='uploading' and s.expires_at<now() then raise exception 'expired';end if;
   return jsonb_build_object('id',s.id,'status',s.status,'media',s.payload->'media');
  end if;
  if (select count(*) from testimony_store.submissions where ip_hash=p_input->>'ip_hash' and created_at>now()-interval '1 hour')>=5
   or (select count(*) from testimony_store.submissions where created_at>now()-interval '1 day')>=100 then raise exception 'rate_limited';end if;
  v:=p_input->'payload';
  if v->>'consent' is distinct from 'true' or length(trim(coalesce(v->>'title','')))=0 or length(trim(coalesce(v->>'name','')))=0
   or length(trim(coalesce(v->>'contact','')))=0 or jsonb_typeof(v->'media')<>'array' or jsonb_array_length(v->'media')>9
   or (length(trim(coalesce(v->>'body','')))=0 and jsonb_array_length(v->'media')=0)
   or (jsonb_array_length(v->'media')>0 and v->>'media_consent' is distinct from 'true') then raise exception 'invalid_input';end if;
  insert into testimony_store.submissions(id,capability_hash,ip_hash,payload) values((p_input->>'id')::uuid,p_input->>'capability_hash',p_input->>'ip_hash',v) returning * into s;
  return jsonb_build_object('id',s.id,'status',s.status,'media',v->'media');
 elsif p_action in ('status','submit') then
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid and capability_hash=p_input->>'capability_hash' for update;
  if not found then raise exception 'not_found';end if;
  if s.status='uploading' and s.expires_at<now() then raise exception 'expired';end if;
  if p_action='submit' and s.status='uploading' then
   for a in select value from jsonb_array_elements(s.payload->'media') loop
    if not exists(select 1 from storage.objects o where o.bucket_id='testimony-private' and o.name=a->>'path'
     and (o.metadata->>'size')::bigint=(a->>'size')::bigint and o.metadata->>'mimetype'=a->>'type') then raise exception 'upload_incomplete';end if;
   end loop;
   update testimony_store.submissions set status='pending',submitted_at=now() where id=s.id returning * into s;
  end if;
  return jsonb_build_object('id',s.id,'status',s.status,'media',s.payload->'media','review_note',s.review_note);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on all functions in schema testimony_store from public,anon,authenticated;
grant usage on schema testimony_store to service_role;
grant execute on function testimony_store.call(text,jsonb) to service_role;
create function public.testimony_service(p_action text,p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select testimony_store.call(p_action,p_input)
$$;
revoke all on function public.testimony_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.testimony_service(text,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('testimony-private','testimony-private',false,52428800,array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']);
-- No Storage client policies: only scoped signed uploads and short-lived read URLs from the checked Edge endpoint.
