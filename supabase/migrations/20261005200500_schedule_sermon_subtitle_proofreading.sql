do $block$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'sermon-subtitle-proofread-20260927';
  perform cron.schedule(
    'sermon-subtitle-proofread-20260927',
    '*/2 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-project-url') || '/functions/v1/youtube-oauth',
      headers := jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret')),
      body := jsonb_build_object('action','proofread_subtitle_segment','church','M+','draftId','dc0de484-2b55-47c2-9dc1-15e16a166dda','segmentIndex',(select min(segment_index) from public.sermon_subtitle_segments where draft_id='dc0de484-2b55-47c2-9dc1-15e16a166dda' and coalesce(review_status,'pending') <> 'completed')),
      timeout_milliseconds := 120000
    )
    where exists (select 1 from public.sermon_subtitle_segments where draft_id='dc0de484-2b55-47c2-9dc1-15e16a166dda' and coalesce(review_status,'pending') <> 'completed');
    $job$
  );
end
$block$;
