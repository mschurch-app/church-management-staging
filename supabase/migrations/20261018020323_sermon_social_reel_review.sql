alter table public.sermon_social_drafts
  add column social_media_type text not null default 'image',
  add column social_video_path text;

alter table public.sermon_social_drafts
  add constraint sermon_social_drafts_media_type_check
  check (social_media_type in ('image', 'reel'));

alter table public.sermon_social_publication_jobs
  add column media_type text not null default 'image',
  add column video_path text;

alter table public.sermon_social_publication_jobs
  add constraint sermon_social_publication_jobs_media_type_check
  check (media_type in ('image', 'reel'));

create or replace function public.sermon_social_enforce_review_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.review_stage = 'pastoral_confirmation'
     and (old.review_stage is distinct from new.review_stage) then
    if new.social_media_type = 'reel' then
      if new.social_video_path is null
         or new.social_video_path not like 'M+/sermons/' || new.id || '/%.mp4'
         or new.social_image_url is null then
        raise exception 'sermon_social_requires_reel_and_cover';
      end if;
    else
      if jsonb_typeof(new.social_image_options) <> 'array'
         or jsonb_array_length(new.social_image_options) <> 3 then
        raise exception 'sermon_social_requires_three_images';
      end if;
      if new.social_image_url is null
         or not (new.social_image_options ? new.social_image_url) then
        raise exception 'sermon_social_requires_selected_image';
      end if;
    end if;
  end if;
  if new.transcript is not null then
    new.transcript := null;
  end if;
  return new;
end;
$$;

create or replace function public.queue_sermon_instagram_initial_review()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  reviewer constant uuid := 'd066ac92-9801-46cc-9293-2932399b4e11';
  v_source_key text;
  target_url text;
  is_reel boolean;
begin
  if new.church_id <> 'M+'
     or new.status <> 'pending_review'
     or new.review_stage <> 'initial_review' then
    return new;
  end if;

  is_reel := new.social_media_type = 'reel';
  if is_reel then
    if new.social_video_path is null
       or new.social_video_path not like 'M+/sermons/' || new.id || '/%.mp4'
       or new.social_image_url is null then
      return new;
    end if;
  elsif jsonb_typeof(new.social_image_options) <> 'array'
     or jsonb_array_length(new.social_image_options) <> 3 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'pending_review'
     and old.review_stage = 'initial_review'
     and old.social_media_type = new.social_media_type
     and old.social_video_path is not distinct from new.social_video_path
     and old.social_image_url is not distinct from new.social_image_url
     and old.social_image_options is not distinct from new.social_image_options then
    return new;
  end if;

  v_source_key := 'sermon-social-review:' || new.id || ':' || reviewer;
  target_url := '/sermon-social-review.html?draft=' || new.id;

  insert into public.pastoral_tasks
    (entity_key,title,description,task_type,status,assigned_to,idempotency_key,payload)
  values
    ('mplus','初審 ' || new.service_date || ' 講道 IG 內容',
     case when is_reel then '請觀看繁體中文字幕 Reel，核對封面、講道重點與貼文。'
          else '請核對大綱、重點與貼文，並從 1080p 原始影片擷取的三張講員圖卡中選擇一張。' end,
     'document','pending',reviewer,v_source_key,
     case when is_reel then jsonb_build_object(
       'workflow','sermon_social_initial_review','draft_id',new.id,
       'review_stage','initial_review','action_url',target_url,
       'media_type','reel','required_video_preview',true)
     else jsonb_build_object(
       'workflow','sermon_social_initial_review','draft_id',new.id,
       'review_stage','initial_review','action_url',target_url,
       'required_image_selection',true,'required_image_count',3,
       'required_image_shots',jsonb_build_array('knees_up','knees_up','half_body'),
       'image_source','youtube_1080p_frame','image_template','mplus_sermon_card_v1',
       'composition_labels_embedded',false) end)
  on conflict (idempotency_key) do update set
    status = 'pending', completed_at = null, updated_at = now(),
    description = excluded.description, payload = excluded.payload;

  insert into public.sermon_social_notification_queue
    (draft_id,staff_id,stage,source_key,title,body,target_url,deliver_after,status,attempt_count,updated_at)
  values
    (new.id,reviewer,'initial_review',v_source_key,'講道 IG 內容等待初審',
     new.service_date || '｜' || coalesce(new.sermon_title,'主日信息'),target_url,
     now()+interval '3 minutes','pending',0,now())
  on conflict (source_key) do update set
    status = 'pending', attempt_count = 0, sent_at = null,
    deliver_after = excluded.deliver_after, updated_at = now();

  return new;
end;
$$;

drop trigger if exists sermon_instagram_initial_review_ready on public.sermon_social_drafts;
create trigger sermon_instagram_initial_review_ready
after insert or update of status, review_stage, social_image_options,
  social_media_type, social_video_path, social_image_url
on public.sermon_social_drafts
for each row execute function public.queue_sermon_instagram_initial_review();

revoke execute on function public.queue_sermon_instagram_initial_review()
  from public, anon, authenticated;
