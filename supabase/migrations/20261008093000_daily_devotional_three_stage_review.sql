alter table public.daily_devotionals
  drop constraint if exists daily_devotionals_review_status_check;

alter table public.daily_devotionals
  add constraint daily_devotionals_review_status_check
  check (review_status in ('draft','initial_review','spouse_review','final_review','approved','returned','archived'));

alter table public.daily_devotionals
  add column if not exists second_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists second_reviewed_at timestamptz;

create table if not exists public.daily_devotional_reviewers (
  church_id text primary key check (church_id in ('M+', 'SHiNE')),
  initial_reviewer_id uuid not null references auth.users(id) on delete restrict,
  second_reviewer_id uuid not null references auth.users(id) on delete restrict,
  final_reviewer_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (initial_reviewer_id <> second_reviewer_id),
  check (initial_reviewer_id <> final_reviewer_id),
  check (second_reviewer_id <> final_reviewer_id)
);

alter table public.daily_devotional_reviewers enable row level security;
revoke all on public.daily_devotional_reviewers from anon, authenticated;
grant select, insert, update, delete on public.daily_devotional_reviewers to service_role;
create policy "Service role manages daily devotional reviewers"
  on public.daily_devotional_reviewers for all to service_role using (true) with check (true);

insert into public.daily_devotional_reviewers (
  church_id,
  initial_reviewer_id,
  second_reviewer_id,
  final_reviewer_id
) values (
  'M+',
  '1fa2d63e-fc75-42a4-b624-5e1d45a60377',
  'c7fd5c8d-94c1-4736-b7b6-9175fd2986b9',
  'b7d6ba5d-8e0a-4921-8813-e9f0071b7566'
) on conflict (church_id) do update set
  initial_reviewer_id=excluded.initial_reviewer_id,
  second_reviewer_id=excluded.second_reviewer_id,
  final_reviewer_id=excluded.final_reviewer_id,
  updated_at=now();

create index if not exists daily_devotionals_reviewed_by_idx on public.daily_devotionals(reviewed_by);
create index if not exists daily_devotionals_second_reviewed_by_idx on public.daily_devotionals(second_reviewed_by);
create index if not exists daily_devotionals_approved_by_idx on public.daily_devotionals(approved_by);
create index if not exists daily_devotional_reviews_reviewer_idx on public.daily_devotional_reviews(reviewer_id);

create or replace function public.update_daily_devotional_content(
  p_id uuid,
  p_editor uuid,
  p_values jsonb
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
    scripture_version=coalesce(nullif(btrim(p_values->>'scripture_version'),''),scripture_version),
    scripture_source=coalesce(nullif(btrim(p_values->>'scripture_source'),''),scripture_source),
    scripture_license_note=coalesce(nullif(btrim(p_values->>'scripture_license_note'),''),scripture_license_note),
    context_summary=coalesce(nullif(btrim(p_values->>'context_summary'),''),context_summary),
    key_points=coalesce(nullif(btrim(p_values->>'key_points'),''),key_points),
    reflection_questions=coalesce(nullif(btrim(p_values->>'reflection_questions'),''),reflection_questions),
    life_application=coalesce(nullif(btrim(p_values->>'life_application'),''),life_application),
    response_prayer=coalesce(nullif(btrim(p_values->>'response_prayer'),''),response_prayer),
    scripture_is_excerpt=position('…' in coalesce(p_values->>'scripture_text',scripture_text))>0,
    review_status='initial_review',
    reviewed_by=null,reviewed_at=null,
    second_reviewed_by=null,second_reviewed_at=null,
    approved_by=null,approved_at=null,published_at=null,
    version=version+1,updated_at=now()
  where id=p_id and church_id='M+'
  returning * into result;
  if result.id is null then raise exception 'not_found'; end if;
  insert into public.daily_devotional_reviews(devotional_id,reviewer_id,from_status,to_status,comment)
  values(p_id,p_editor,'content_edit','initial_review','內容修改後自動退回鈺庭初審');
  return result;
end $$;

create or replace function public.review_daily_devotional(
  p_id uuid,
  p_reviewer uuid,
  p_to_status text,
  p_comment text default null
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
  select * into current_row
  from public.daily_devotionals
  where id=p_id and church_id='M+'
  for update;
  if current_row.id is null then raise exception 'not_found'; end if;

  select * into reviewers
  from public.daily_devotional_reviewers
  where church_id=current_row.church_id;
  if reviewers.church_id is null then raise exception 'reviewers_not_configured'; end if;

  if p_to_status='spouse_review' then
    if current_row.review_status not in ('draft','initial_review','returned') then raise exception 'invalid_transition'; end if;
    if p_reviewer<>reviewers.initial_reviewer_id then raise exception 'wrong_reviewer'; end if;
  elsif p_to_status='final_review' then
    if current_row.review_status<>'spouse_review' then raise exception 'invalid_transition'; end if;
    if p_reviewer<>reviewers.second_reviewer_id then raise exception 'wrong_reviewer'; end if;
  elsif p_to_status='approved' then
    if current_row.review_status<>'final_review' then raise exception 'invalid_transition'; end if;
    if p_reviewer<>reviewers.final_reviewer_id then raise exception 'wrong_reviewer'; end if;
    if current_row.scripture_version is null or current_row.scripture_source is null or current_row.scripture_license_note is null then
      raise exception 'licensing_required';
    end if;
  elsif p_to_status='returned' then
    if current_row.review_status not in ('initial_review','spouse_review','final_review') then raise exception 'invalid_transition'; end if;
    if nullif(btrim(p_comment),'') is null then raise exception 'comment_required'; end if;
    if current_row.review_status='initial_review' and p_reviewer<>reviewers.initial_reviewer_id then raise exception 'wrong_reviewer'; end if;
    if current_row.review_status='spouse_review' and p_reviewer<>reviewers.second_reviewer_id then raise exception 'wrong_reviewer'; end if;
    if current_row.review_status='final_review' and p_reviewer<>reviewers.final_reviewer_id then raise exception 'wrong_reviewer'; end if;
  else
    raise exception 'invalid_transition';
  end if;

  update public.daily_devotionals set
    review_status=p_to_status,
    reviewed_by=case when p_to_status='spouse_review' then p_reviewer when p_to_status='returned' then null else reviewed_by end,
    reviewed_at=case when p_to_status='spouse_review' then now() when p_to_status='returned' then null else reviewed_at end,
    second_reviewed_by=case when p_to_status='final_review' then p_reviewer when p_to_status='returned' then null else second_reviewed_by end,
    second_reviewed_at=case when p_to_status='final_review' then now() when p_to_status='returned' then null else second_reviewed_at end,
    approved_by=case when p_to_status='approved' then p_reviewer else null end,
    approved_at=case when p_to_status='approved' then now() else null end,
    published_at=case when p_to_status='approved' then now() else null end,
    updated_at=now()
  where id=p_id
  returning * into result;

  insert into public.daily_devotional_reviews(devotional_id,reviewer_id,from_status,to_status,comment)
  values(p_id,p_reviewer,current_row.review_status,p_to_status,nullif(btrim(p_comment),''));
  return result;
end $$;

revoke all on function public.review_daily_devotional(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_daily_devotional(uuid,uuid,text,text) to service_role;

comment on table public.daily_devotional_reviewers is
  'Fixed three-stage daily devotional review order: initial reviewer, pastor spouse, then pastor final approval.';
