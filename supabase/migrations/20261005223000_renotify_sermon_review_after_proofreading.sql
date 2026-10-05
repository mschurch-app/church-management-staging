do $block$
begin
  perform cron.unschedule(jobid) from cron.job where jobname='sermon-review-renotify-gnh4bxcsira';
  perform cron.schedule(
    'sermon-review-renotify-gnh4bxcsira',
    '*/2 * * * *',
    $job$
    insert into public.sermon_social_notification_queue
      (draft_id,staff_id,stage,source_key,title,body,target_url,deliver_after,status,attempt_count,error_code,sent_at,updated_at)
    select d.id,'d066ac92-9801-46cc-9293-2932399b4e11'::uuid,'initial_review',
      'sermon-social-review:'||d.id||':proofread-complete',
      '講道字幕校稿完成，請重新初審',
      d.service_date||'｜'||d.sermon_title||'｜字幕已完成第二次校稿，請重新開啟並核對。',
      '/sermon-social-review.html?draft='||d.id,
      now()+interval '3 minutes','pending',0,null,null,now()
    from public.sermon_social_drafts d
    where d.youtube_video_id='GNh4bxcsirA' and d.status='pending_review' and d.review_stage='initial_review'
      and exists (select 1 from public.sermon_subtitle_segments s where s.draft_id=d.id)
      and not exists (select 1 from public.sermon_subtitle_segments s where s.draft_id=d.id and coalesce(s.review_status,'pending')<>'completed')
    on conflict (source_key) do nothing;
    $job$
  );
end
$block$;
