create or replace function public.mark_my_app_notifications_for_target(p_target_url text)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if p_target_url is null or p_target_url not like '/%' or p_target_url like '//%' then
    raise exception 'invalid_target';
  end if;
  update public.app_notifications
  set read_at=coalesce(read_at,now())
  where user_id=auth.uid() and target_url=p_target_url and read_at is null;
  get diagnostics changed=row_count;
  return changed;
end
$$;

revoke all on function public.mark_my_app_notifications_for_target(text) from public,anon;
grant execute on function public.mark_my_app_notifications_for_target(text) to authenticated,service_role;

update public.app_notifications n
set read_at=coalesce(n.read_at,now())
from public.sermon_social_drafts d
where n.event_key='sermon_social_review'
  and n.read_at is null
  and n.target_url='/sermon-social-review.html?draft='||d.id::text
  and ((n.source_key like 'sermon-social-review:%' and d.review_stage<>'initial_review')
    or (n.source_key like 'sermon-social-final:%' and d.review_stage='completed'));

update public.app_notifications n
set read_at=coalesce(n.read_at,now())
from public.website_weekly_bulletins b
where n.event_key='weekly_bulletin_review'
  and n.read_at is null
  and n.target_url like '/weekly-bulletin-review.html%bulletin='||b.id::text
  and b.status<>'pending_review';
