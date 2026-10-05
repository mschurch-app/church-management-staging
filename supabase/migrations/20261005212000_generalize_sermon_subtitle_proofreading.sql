do $block$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('sermon-subtitle-proofread-20260927','sermon-subtitle-proofreading');
  perform cron.schedule(
    'sermon-subtitle-proofreading',
    '*/2 * * * *',
    $job$
    with candidate as (
      select draft_id,segment_index
      from public.sermon_subtitle_segments
      where status='completed' and coalesce(review_status,'pending') <> 'completed'
      order by updated_at,segment_index
      limit 1
    )
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-project-url') || '/functions/v1/youtube-oauth',
      headers := jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret')),
      body := jsonb_build_object('action','proofread_subtitle_segment','church','M+','draftId',candidate.draft_id,'segmentIndex',candidate.segment_index),
      timeout_milliseconds := 120000
    )
    from candidate;
    $job$
  );
end
$block$;
