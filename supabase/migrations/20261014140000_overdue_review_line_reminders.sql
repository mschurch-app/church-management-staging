-- One LINE reminder after two hours in an active initial/second review stage.
-- Existing overdue work is grouped into one message per reviewer and stage.
create table if not exists public.review_reminder_batches (
  id uuid primary key default gen_random_uuid(),
  church_id text not null,
  recipient_user_id uuid not null,
  line_subject text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed_permanent')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);
create table if not exists public.review_reminder_items (
  batch_id uuid not null references public.review_reminder_batches(id),
  workflow_key text not null,
  item_id text not null,
  stage text not null check (stage in ('initial','second')),
  stage_started_at timestamptz not null,
  recipient_user_id uuid not null,
  primary key (workflow_key,item_id,stage,stage_started_at,recipient_user_id)
);
create index if not exists review_reminder_batches_pending_idx on public.review_reminder_batches(status,created_at);
alter table public.review_reminder_batches enable row level security;
alter table public.review_reminder_items enable row level security;
revoke all on public.review_reminder_batches,public.review_reminder_items from public,anon,authenticated;
grant all on public.review_reminder_batches,public.review_reminder_items to service_role;

create or replace function public.claim_overdue_review_reminders(p_limit integer default 300)
returns table(batch_id uuid,church_id text,line_subject text,message text)
language plpgsql security definer set search_path = '' as $function$
declare v_row record; v_batch uuid; v_message text;
begin
  if current_setting('request.jwt.claim.role',true) <> 'service_role' then raise exception 'forbidden'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('claim_overdue_review_reminders'));
  for v_row in
    with configured as (
      select * from public.review_workflow_settings
      where initial_reviewer_id is not null and final_reviewer_id is not null
    ), candidates as (
      select 'sermon_social'::text workflow_key,d.id::text item_id,
        case when d.review_stage='initial_review' then 'initial' else 'second' end stage,
        t.created_at stage_started_at,ps.app_user_id recipient_user_id,
        '講道 IG：'||left(d.sermon_title,60) item_label,
        '/sermon-social-review.html?draft='||d.id::text action_url,d.church_id
      from public.sermon_social_drafts d
      join configured w on w.church_id=d.church_id and w.workflow_key='sermon_social'
      join public.pastoral_tasks t on t.payload->>'draft_id'=d.id::text
        and t.payload->>'workflow'=case when d.review_stage='initial_review' then 'sermon_social_initial_review' else 'sermon_social_final_review' end
        and t.status='pending'
      join public.pastoral_staff ps on ps.id=t.assigned_to and ps.is_active and ps.app_user_id is not null
      where d.status='pending_review' and d.review_stage in ('initial_review','pastoral_confirmation')
      union all
      select 'daily_devotional',d.id::text,
        case when d.review_status='initial_review' then 'initial' else 'second' end,
        coalesce((select max(r.created_at) from public.daily_devotional_reviews r
          where r.devotional_id=d.id and r.to_status=d.review_status),d.updated_at),
        case when d.review_status='initial_review' then reviewers.initial_reviewer_id else reviewers.second_reviewer_id end,
        '每日經文：'||d.devotional_date::text||' '||left(d.devotional_title,45),
        '/daily-devotional-admin.html?church=M%2B',d.church_id
      from public.daily_devotionals d
      join configured w on w.church_id=d.church_id and w.workflow_key='daily_devotional'
      join public.daily_devotional_reviewers reviewers on reviewers.church_id=d.church_id
      where d.review_status in ('initial_review','spouse_review')
      union all
      select 'service_change_'||q.ministry_key,q.id::text,
        case when q.status='leader_review' then 'initial' else 'second' end,
        case when q.status='leader_review' then q.created_at else q.leader_reviewed_at end,
        recipient.user_id,'服事調整：'||q.ministry_key||' #'||q.id::text,
        '/service-signup-admin.html?church=M%2B',q.church_id
      from public.service_signup_change_requests q
      join configured w on w.church_id=q.church_id and w.workflow_key='service_change_'||q.ministry_key
      join lateral (
        select s.user_id from church_auth.service_ministry_scopes s
          where q.status='leader_review' and s.church_id=q.church_id and s.ministry_key in ('all',q.ministry_key)
        union
        select f.user_id from church_auth.service_signup_final_reviewers f
          where q.status='admin_review' and f.church_id=q.church_id
      ) recipient on true
      where q.status in ('leader_review','admin_review')
    ), due as (
      select distinct c.*,i.provider_id line_id from candidates c
      join lateral (
        select i.provider_id from auth.identities i
        where i.user_id in (select church_auth.account_users(c.recipient_user_id))
          and i.provider='custom:line-web' and i.provider_id ~ '^U[0-9a-fA-F]{32}$'
        order by i.created_at desc limit 1
      ) i on true
      where c.recipient_user_id is not null and c.stage_started_at <= now()-interval '2 hours'
        and not exists (select 1 from public.review_reminder_items ri
          where ri.workflow_key=c.workflow_key and ri.item_id=c.item_id and ri.stage=c.stage
            and ri.stage_started_at=c.stage_started_at and ri.recipient_user_id=c.recipient_user_id)
      order by c.stage_started_at limit greatest(1,least(p_limit,300))
    )
    select d.church_id,d.recipient_user_id,d.line_id,d.stage,d.workflow_key,count(*) item_count,
      string_agg(d.item_label,E'\n' order by d.stage_started_at) item_list,
      min(d.action_url) action_url,
      jsonb_agg(jsonb_build_object('workflow_key',d.workflow_key,'item_id',d.item_id,
        'stage',d.stage,'stage_started_at',d.stage_started_at,'recipient_user_id',d.recipient_user_id)) items
    from due d group by d.church_id,d.recipient_user_id,d.line_id,d.stage,d.workflow_key
  loop
    v_message := '【審核逾時提醒】'||case when v_row.stage='initial' then '初審' else '複審' end
      ||'已等待超過 2 小時，尚有 '||v_row.item_count||' 件待處理。'||E'\n'
      ||left(v_row.item_list,800)||E'\n'||'開啟審核：https://mscos.mchurch.online'||v_row.action_url;
    insert into public.review_reminder_batches(church_id,recipient_user_id,line_subject,message)
      values(v_row.church_id,v_row.recipient_user_id,v_row.line_id,v_message) returning id into v_batch;
    insert into public.review_reminder_items(batch_id,workflow_key,item_id,stage,stage_started_at,recipient_user_id)
      select v_batch,x->>'workflow_key',x->>'item_id',x->>'stage',(x->>'stage_started_at')::timestamptz,(x->>'recipient_user_id')::uuid
      from jsonb_array_elements(v_row.items) x on conflict do nothing;
  end loop;
  return query select b.id,b.church_id,b.line_subject,b.message
    from public.review_reminder_batches b where b.status='pending' and b.created_at>now()-interval '24 hours'
    order by b.created_at limit 30;
end $function$;
revoke all on function public.claim_overdue_review_reminders(integer) from public,anon,authenticated;
grant execute on function public.claim_overdue_review_reminders(integer) to service_role;
