create table public.testimony_instagram_jobs (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null unique references testimony_store.submissions(id),
 source_version integer not null, plan jsonb not null,
 images jsonb not null check(jsonb_array_length(images) between 3 and 8),
 status text not null default 'draft' check(status in ('draft','scheduled','processing','published','failed','uncertain','cancelled')),
 scheduled_at timestamptz, consent_confirmed_at timestamptz, consent_confirmed_by uuid,
 approved_at timestamptz, approved_by uuid, created_by uuid not null,
 attempt_id uuid, lease_expires_at timestamptz,
 child_ids jsonb not null default '[]', container_id text,
 publish_started_at timestamptz, instagram_media_id text, permalink text,
 error_code text, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),published_at timestamptz,
 check(octet_length(plan::text)<16000)
);
alter table public.testimony_instagram_jobs enable row level security;
revoke all on public.testimony_instagram_jobs from public,anon,authenticated;
grant all on public.testimony_instagram_jobs to service_role;
create index testimony_instagram_due on public.testimony_instagram_jobs(status,scheduled_at);

create function public.testimony_instagram_source(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'version',s.version,'status',s.status,'payload',
 jsonb_build_object('title',s.payload->>'title','body',s.payload->>'body','display_name',s.payload->>'display_name',
 'consent',s.payload->'consent','media_consent',s.payload->'media_consent','media',s.payload->'media'))
 from testimony_store.submissions s where s.id=p_id
$$;
revoke all on function public.testimony_instagram_source(uuid) from public,anon,authenticated;
grant execute on function public.testimony_instagram_source(uuid) to service_role;

-- Only this new queue is processed. Existing Instagram/LINE/website jobs are untouched.
select cron.schedule('testimony-instagram-publish','* * * * *',$job$
 select net.http_post(
 url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/testimony-instagram',
 headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',
 (select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret' limit 1)),
 body:='{"action":"run_due"}'::jsonb,timeout_milliseconds:=60000);
$job$);
