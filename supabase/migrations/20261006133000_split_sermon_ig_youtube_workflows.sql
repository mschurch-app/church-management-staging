create table if not exists public.sermon_youtube_workflows (
  draft_id uuid primary key references public.sermon_social_drafts(id) on delete cascade,
  status text not null default 'waiting_edit'
    check (status in ('waiting_edit','proofreading','review_ready','approved','published','failed')),
  edit_mode text check (edit_mode is null or edit_mode in ('full_replay','trimmed_replay')),
  caption_offset_seconds numeric(10,3) not null default 0 check (caption_offset_seconds >= 0),
  edit_confirmed_at timestamptz,
  review_requested_at timestamptz,
  reviewed_by uuid references public.pastoral_staff(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sermon_youtube_workflows enable row level security;
revoke all on public.sermon_youtube_workflows from anon, authenticated;
grant all on public.sermon_youtube_workflows to service_role;

alter table public.sermon_social_notification_queue
  drop constraint if exists sermon_social_notification_queue_stage_check;
alter table public.sermon_social_notification_queue
  add constraint sermon_social_notification_queue_stage_check
  check (stage in ('initial_review','pastoral_confirmation','youtube_caption_review'));

insert into public.sermon_youtube_workflows
  (draft_id,status,edit_mode,caption_offset_seconds,edit_confirmed_at,review_requested_at,reviewed_at,published_at,updated_at)
select p.draft_id,'published','full_replay',0,p.approved_at,p.approved_at,p.approved_at,p.published_at,now()
from public.youtube_caption_publications p
where p.status='published'
on conflict (draft_id) do nothing;

create or replace function public.queue_sermon_instagram_initial_review()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  reviewer constant uuid := 'd066ac92-9801-46cc-9293-2932399b4e11';
  source_key text;
  target_url text;
begin
  if new.church_id <> 'M+'
     or new.status <> 'pending_review'
     or new.review_stage <> 'initial_review'
     or jsonb_typeof(new.social_image_options) <> 'array'
     or jsonb_array_length(new.social_image_options) <> 3 then
    return new;
  end if;

  source_key := 'sermon-social-review:' || new.id || ':' || reviewer;
  target_url := '/sermon-social-review.html?draft=' || new.id;

  insert into public.pastoral_tasks
    (entity_key,title,description,task_type,status,assigned_to,idempotency_key,payload)
  values
    ('mplus','初審 ' || new.service_date || ' 講道 IG 內容',
     '請核對大綱、重點與貼文，並從 1080p 原始影片截取的兩張膝蓋以上、一張半身講員圖中選擇一張。',
     'document','pending',reviewer,source_key,
     jsonb_build_object(
       'workflow','sermon_social_initial_review','draft_id',new.id,
       'review_stage','initial_review','action_url',target_url,
       'required_image_selection',true,'required_image_count',3,
       'required_image_shots',jsonb_build_array('knees_up','knees_up','half_body'),
       'image_source','youtube_1080p_frame','image_template','mplus_sermon_card_v1',
       'composition_labels_embedded',false))
  on conflict (idempotency_key) do nothing;

  insert into public.sermon_social_notification_queue
    (draft_id,staff_id,stage,source_key,title,body,target_url,deliver_after,status,attempt_count,updated_at)
  values
    (new.id,reviewer,'initial_review',source_key,'講道 IG 內容等待初審',
     new.service_date || '｜' || coalesce(new.sermon_title,'主日信息'),target_url,
     now()+interval '3 minutes','pending',0,now())
  on conflict (source_key) do nothing;

  return new;
end
$function$;

revoke all on function public.queue_sermon_instagram_initial_review() from public, anon, authenticated;

drop trigger if exists sermon_instagram_initial_review_ready on public.sermon_social_drafts;
create trigger sermon_instagram_initial_review_ready
after insert or update of status, review_stage, social_image_options
on public.sermon_social_drafts
for each row execute function public.queue_sermon_instagram_initial_review();

do $block$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in (
    'sermon-full-pipeline-test-gnh4bxcsira',
    'sermon-review-renotify-gnh4bxcsira'
  );
end
$block$;
