-- 2027 M+ devotional edits and approvals no longer enter the initial-review queue.
-- Approval remains distinct from public availability until scripture attribution is recorded.
create or replace function public.update_daily_devotional_content(
  p_id uuid, p_editor uuid, p_values jsonb
) returns public.daily_devotionals
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare result public.daily_devotionals;
begin
  if p_values is null or p_values = '{}'::jsonb then raise exception 'empty_update'; end if;
  if exists (select 1 from jsonb_object_keys(p_values) key where key not in (
    'devotional_title','selected_scripture_reference','scripture_text','scripture_version','scripture_source','scripture_license_note','context_summary',
    'key_points','reflection_questions','life_application','response_prayer'
  )) then raise exception 'invalid_field'; end if;
  update public.daily_devotionals set
    devotional_title=coalesce(nullif(btrim(p_values->>'devotional_title'),''),devotional_title),
    selected_scripture_reference=coalesce(nullif(btrim(p_values->>'selected_scripture_reference'),''),selected_scripture_reference),
    scripture_text=coalesce(nullif(btrim(p_values->>'scripture_text'),''),scripture_text),
    scripture_version=case when p_values ? 'scripture_version' then nullif(btrim(p_values->>'scripture_version'),'') else scripture_version end,
    scripture_source=case when p_values ? 'scripture_source' then nullif(btrim(p_values->>'scripture_source'),'') else scripture_source end,
    scripture_license_note=case when p_values ? 'scripture_license_note' then nullif(btrim(p_values->>'scripture_license_note'),'') else scripture_license_note end,
    context_summary=coalesce(nullif(btrim(p_values->>'context_summary'),''),context_summary),
    key_points=coalesce(nullif(btrim(p_values->>'key_points'),''),key_points),
    reflection_questions=coalesce(nullif(btrim(p_values->>'reflection_questions'),''),reflection_questions),
    life_application=coalesce(nullif(btrim(p_values->>'life_application'),''),life_application),
    response_prayer=coalesce(nullif(btrim(p_values->>'response_prayer'),''),response_prayer),
    scripture_is_excerpt=position('…' in coalesce(p_values->>'scripture_text',scripture_text))>0,
    review_status='approved',
    reviewed_by=null,reviewed_at=null,
    second_reviewed_by=null,second_reviewed_at=null,
    approved_by=p_editor,approved_at=now(),
    published_at=case when
      nullif(btrim(coalesce(p_values->>'scripture_version',scripture_version)),'') is not null and
      nullif(btrim(coalesce(p_values->>'scripture_source',scripture_source)),'') is not null and
      nullif(btrim(coalesce(p_values->>'scripture_license_note',scripture_license_note)),'') is not null
      then now() else null end,
    version=version+1,updated_at=now()
  where id=p_id and church_id='M+' and devotional_date >= date '2027-01-01' and devotional_date < date '2028-01-01'
  returning * into result;
  if result.id is null then raise exception 'not_found'; end if;
  insert into public.daily_devotional_reviews(devotional_id,reviewer_id,from_status,to_status,comment)
  values(p_id,p_editor,'content_edit','approved','依 2027 靈修直接核准流程，內容修改後立即核准；經文資料未齊時暫不公開。');
  return result;
end $$;

create or replace function public.review_daily_devotional(
  p_id uuid, p_reviewer uuid, p_to_status text, p_comment text default null
) returns public.daily_devotionals
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_row public.daily_devotionals;
  reviewers public.daily_devotional_reviewers;
  result public.daily_devotionals;
begin
  select * into current_row from public.daily_devotionals
  where id=p_id and church_id='M+' and devotional_date >= date '2027-01-01' and devotional_date < date '2028-01-01'
  for update;
  if current_row.id is null then raise exception 'not_found'; end if;
  select * into reviewers from public.daily_devotional_reviewers where church_id=current_row.church_id;
  if reviewers.church_id is null then raise exception 'reviewers_not_configured'; end if;

  if p_to_status='approved' then
    if current_row.review_status not in ('draft','initial_review','returned','spouse_review','final_review') then raise exception 'invalid_transition'; end if;
    if p_reviewer<>reviewers.final_reviewer_id then raise exception 'wrong_reviewer'; end if;
  elsif p_to_status='returned' then
    if current_row.review_status not in ('initial_review','spouse_review','final_review') then raise exception 'invalid_transition'; end if;
    if nullif(btrim(p_comment),'') is null then raise exception 'comment_required'; end if;
    if p_reviewer<>reviewers.final_reviewer_id then raise exception 'wrong_reviewer'; end if;
  else
    raise exception 'invalid_transition';
  end if;

  update public.daily_devotionals set
    review_status=p_to_status,
    reviewed_by=null,reviewed_at=null,
    second_reviewed_by=null,second_reviewed_at=null,
    approved_by=case when p_to_status='approved' then p_reviewer else null end,
    approved_at=case when p_to_status='approved' then now() else null end,
    published_at=case when p_to_status='approved' and
      nullif(btrim(current_row.scripture_version),'') is not null and
      nullif(btrim(current_row.scripture_source),'') is not null and
      nullif(btrim(current_row.scripture_license_note),'') is not null
      then now() else null end,
    updated_at=now()
  where id=p_id
  returning * into result;

  insert into public.daily_devotional_reviews(devotional_id,reviewer_id,from_status,to_status,comment)
  values(p_id,p_reviewer,current_row.review_status,p_to_status,nullif(btrim(p_comment),''));
  return result;
end $$;

revoke all on function public.update_daily_devotional_content(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.review_daily_devotional(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_daily_devotional_content(uuid,uuid,jsonb) to service_role;
grant execute on function public.review_daily_devotional(uuid,uuid,text,text) to service_role;
