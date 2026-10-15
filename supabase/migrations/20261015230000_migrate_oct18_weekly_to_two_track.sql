begin;

do $$
declare
  v_id uuid := '17eeed07-c089-45ff-9a08-0f99c644dacf';
  v_video text := 'M+/weekly/17eeed07-c089-45ff-9a08-0f99c644dacf/reel-1792069427211.mp4';
  v_base uuid := '07749b05-6455-4e75-950e-b5562d6780a8';
  v_row public.website_weekly_bulletins%rowtype;
  v_initial uuid;
  v_initial_staff uuid;
  v_submitter_staff uuid;
  v_now timestamptz := now();
begin
  select * into v_row from public.website_weekly_bulletins
  where id=v_id and church_id='M+' and service_date='2026-10-18'
  for update;
  if not found or v_row.status<>'pending_review' or v_row.version<>49 then
    raise exception 'The October 18 bulletin changed; migration stopped';
  end if;
  if exists(select 1 from public.website_weekly_promos where bulletin_id=v_id) then
    raise exception 'The October 18 promo already exists';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='church-website-public-media'
    and name=v_video and metadata->>'mimetype'='video/mp4') then
    raise exception 'The previously generated Reel is missing';
  end if;
  if not exists(select 1 from public.weekly_canva_jobs where id=v_base
    and bulletin_id=v_id and church_id='M+' and status='ready') then
    raise exception 'The existing Canva options are missing';
  end if;
  select initial_reviewer_id into v_initial from public.review_workflow_settings
  where church_id='M+' and workflow_key='weekly_promo';
  select id into v_initial_staff from public.pastoral_staff
  where app_user_id=v_initial and is_active=true;
  select id into v_submitter_staff from public.pastoral_staff
  where app_user_id=v_row.submitted_by and is_active=true;
  if v_initial_staff is null then raise exception 'Initial reviewer is not configured'; end if;

  update public.pastoral_tasks
  set status='cancelled',updated_at=v_now,
      payload=payload||jsonb_build_object('migration_reason','Transferred to two-stage Sunday review')
  where status='pending' and payload->>'workflow'='weekly_bulletin_review'
    and payload->>'bulletin_id'=v_id::text;

  update public.website_weekly_bulletins
  set status='draft',version=version+1,reel_enabled=true,reel_video_path=v_video,
      submitted_at=null,reviewed_by=null,reviewed_at=null,
      review_comment='沿用已輸入主日資訊與已產生的預告圖、Reel；週報內文待社群預告複審後編輯。',
      updated_at=v_now
  where id=v_id;

  insert into public.website_weekly_promos
    (bulletin_id,church_id,status,version,snapshot,submitted_by,submitted_at,updated_at)
  values
    (v_id,'M+','pending_initial',1,jsonb_build_object(
      'service_date',v_row.service_date,'title',v_row.title,
      'sermon_topic',v_row.sermon_topic,'sermon_scripture',v_row.sermon_scripture,
      'sermon_speaker',v_row.sermon_speaker,'speaker_photo_path',v_row.speaker_photo_path,
      'subtitle',v_row.subtitle,'service_time',v_row.service_time,
      'hero_image_path',v_row.hero_image_path,'reel_cover_image_path',v_row.reel_cover_image_path,
      'reel_enabled',true,'reel_video_path',v_video,'reel_caption',v_row.reel_caption,
      'youtube_sync_enabled',v_row.youtube_sync_enabled,'youtube_video_id',v_row.youtube_video_id,
      'youtube_title',v_row.youtube_title,'youtube_description',v_row.youtube_description,
      'youtube_tags',v_row.youtube_tags,'canva_base_job_id',v_base,
      'migration_note','沿用既有圖卡與已產生的 Reel，轉入新版社群預告初審。'
    ),v_row.submitted_by,v_now,v_now);

  insert into public.website_weekly_bulletin_review_events
    (bulletin_id,church_id,bulletin_version,track,action,actor_user_id,comment)
  values (v_id,'M+',1,'promo','submitted',v_row.submitted_by,
    '既有主日預告轉入兩段式社群初審；原圖片與 Reel 保留。');

  insert into public.pastoral_tasks
    (entity_key,title,description,task_type,status,assigned_to,created_by,idempotency_key,payload)
  values
    ('mplus','2026-10-18 主日社群預告初審',
     '既有主日資訊、預告圖及 Reel 已沿用，請依新版第一段流程初審。',
     'document','pending',v_initial_staff,v_submitter_staff,
     'weekly-promo:'||v_id::text||':1:initial:'||v_initial_staff::text,
     jsonb_build_object('workflow','weekly_promo_review','bulletin_id',v_id,
       'version',1,'stage','initial','action_url',
       '/weekly-bulletin-review.html?church=M%2B&bulletin='||v_id::text||'&track=promo'))
  on conflict (idempotency_key) do nothing;
end;
$$;

commit;
