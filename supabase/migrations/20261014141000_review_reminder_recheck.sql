create or replace function public.review_reminder_batch_still_pending(p_batch_id uuid)
returns boolean language plpgsql security definer set search_path='' as $function$
begin
  if current_setting('request.jwt.claim.role',true) <> 'service_role' then raise exception 'forbidden'; end if;
  return exists (
    select 1 from public.review_reminder_items i where i.batch_id=p_batch_id and (
      (i.workflow_key='sermon_social' and exists (
        select 1 from public.sermon_social_drafts d where d.id::text=i.item_id
          and d.status='pending_review' and d.review_stage=case when i.stage='initial' then 'initial_review' else 'pastoral_confirmation' end
      )) or
      (i.workflow_key='daily_devotional' and exists (
        select 1 from public.daily_devotionals d where d.id::text=i.item_id
          and d.review_status=case when i.stage='initial' then 'initial_review' else 'spouse_review' end
      )) or
      (i.workflow_key like 'service_change_%' and exists (
        select 1 from public.service_signup_change_requests q where q.id::text=i.item_id
          and q.status=case when i.stage='initial' then 'leader_review' else 'admin_review' end
      ))
    )
  );
end $function$;
revoke all on function public.review_reminder_batch_still_pending(uuid) from public,anon,authenticated;
grant execute on function public.review_reminder_batch_still_pending(uuid) to service_role;
