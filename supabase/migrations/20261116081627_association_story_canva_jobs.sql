create table public.association_story_canva_jobs(
 id uuid primary key,story_id uuid references public.association_stories(id) on delete restrict,actor_id uuid not null references auth.users(id) on delete restrict,
 snapshot_hash text not null,input jsonb not null,status text not null default 'working' check(status in ('working','ready','blocked','outdated')),
 stage text not null default 'queued',generation_id text,source_design_id text,design_id text,resize_id text,export_id text,output_path text,output_sha256 text,output_bytes integer,
 error_code text,lease uuid,lease_until timestamptz,next_poll_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),is_test boolean not null default false,
 check ((story_id is not null and not is_test) or (story_id is null and is_test))
);
alter table public.association_story_canva_jobs enable row level security;
revoke all on public.association_story_canva_jobs from public,anon,authenticated;
grant select,insert,update on public.association_story_canva_jobs to service_role;
create unique index association_canva_one_working_story on public.association_story_canva_jobs(story_id) where status='working';
create index association_canva_story_history on public.association_story_canva_jobs(story_id,created_at desc);
create function public.claim_association_canva_job(p_id uuid,p_actor uuid,p_lease uuid) returns boolean
language sql security invoker set search_path='' as $$
 with claimed as(update public.association_story_canva_jobs set lease=p_lease,lease_until=now()+interval '90 seconds' where id=p_id and actor_id=p_actor and status='working' and (lease is null or lease_until<now()) returning id) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_association_canva_job(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_association_canva_job(uuid,uuid,uuid) to service_role;
-- Serialize starting a paid generation and submitting the same original story.
create function public.guard_association_canva_start() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r public.association_stories;begin
 if new.is_test then return new;end if;
 select * into r from public.association_stories where id=new.story_id for update;
 if not found or r.created_by<>new.actor_id or r.deleted_at is not null or r.status not in ('draft','changes_requested') or not coalesce((public.association_story_access(new.actor_id)->>'writer')::boolean,false) then raise exception 'forbidden';end if;
 return new;
end $$;
revoke all on function public.guard_association_canva_start() from public,anon,authenticated;
grant execute on function public.guard_association_canva_start() to service_role;
create trigger association_canva_start_guard before insert on public.association_story_canva_jobs for each row execute function public.guard_association_canva_start();
create function public.guard_association_canva_submit() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if new.status='pending_review' and old.status in ('draft','changes_requested') and exists(select 1 from public.association_story_canva_jobs where story_id=new.id and status='working') then raise exception 'design_in_progress';end if;
 return new;
end $$;
revoke all on function public.guard_association_canva_submit() from public,anon,authenticated;
grant execute on function public.guard_association_canva_submit() to service_role;
create trigger association_canva_submit_guard before update of status on public.association_stories for each row execute function public.guard_association_canva_submit();
