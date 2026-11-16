-- Dedicated private drafts. Existing association_news and church publication flows are retained.
create table public.association_story_settings (
 id boolean primary key default true check(id),
 reviewer_id uuid references auth.users(id),
 page_id text, page_name text, page_url text,
 token_ciphertext text, token_iv text,
 connected_at timestamptz, connected_by uuid references auth.users(id),
 news_widget_verified_at timestamptz,
 updated_at timestamptz not null default now()
);
insert into public.association_story_settings(id,reviewer_id)
select true,case when count(*)=1 then (array_agg(user_id))[1] else null end
from church_auth.accounts where is_active and job_title='師母';
create table public.association_stories (
 id uuid primary key,
 created_by uuid not null references auth.users(id),
 description text not null default '' check(length(description)<=4000),
 title text not null default '' check(length(title)<=120),
 body text not null default '' check(length(body)<=6000),
 include_donation boolean not null default false,
 include_website boolean not null default false,
 sync_news boolean not null default false,
 consent_confirmed boolean not null default false,
 layout_key text not null default 'balanced' check(layout_key in ('balanced','focus','strip')),
 theme_key text not null default 'forest' check(theme_key in ('forest','charcoal','earth')),
 layout_notes text not null default '' check(length(layout_notes)<=1000),
 cover jsonb,
 images jsonb not null default '[]' check(jsonb_typeof(images)='array' and jsonb_array_length(images)<=5),
 status text not null default 'draft' check(status in ('draft','changes_requested','pending_review','approved','publishing','published','failed','uncertain')),
 version integer not null default 1,
 review_comment text, submitted_at timestamptz, approved_at timestamptz,
 approved_by uuid references auth.users(id), approved_snapshot jsonb,
 attempt_id uuid, lease_expires_at timestamptz,
 facebook_photo_ids jsonb not null default '[]', facebook_started_at timestamptz,
 facebook_post_id text, facebook_permalink text, published_at timestamptz,
 news_status text not null default 'not_requested' check(news_status in ('not_requested','pending','published','failed')),
 news_id uuid references public.association_news(id),
 error_code text, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index association_stories_queue on public.association_stories(status,updated_at);
alter table public.association_story_settings enable row level security;
alter table public.association_stories enable row level security;
revoke all on public.association_story_settings,public.association_stories from public,anon,authenticated;
grant all on public.association_story_settings,public.association_stories to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('association-story-private','association-story-private',false,8388608,array['image/jpeg']) on conflict(id) do nothing;

create function public.association_story_access(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 with actor as (select church_auth.canonical_account(p_actor) as id)
 select jsonb_build_object('actor_id',(select id from actor),
 'reviewer',exists(select 1 from public.association_story_settings s join church_auth.accounts a on a.user_id=s.reviewer_id where s.id and s.reviewer_id=(select id from actor) and a.is_active),
 'writer',exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
 where a.user_id=(select id from actor) and a.is_active and g.church_id='M+' and g.permission='website_group_resources'
 and not exists(select 1 from church_auth.account_feature_permissions f where f.user_id=(select id from actor) and f.church_id='M+' and f.feature_key='website_group_resources' and (not f.can_view or (not f.can_create and not f.can_edit)))),
 'reader',exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id where a.user_id=(select id from actor) and a.is_active and g.church_id='M+' and g.permission='website_group_resources' and not exists(select 1 from church_auth.account_feature_permissions f where f.user_id=(select id from actor) and f.church_id='M+' and f.feature_key='website_group_resources' and not f.can_view)),
 'reviewer_ready',exists(select 1 from public.association_story_settings s join church_auth.accounts a on a.user_id=s.reviewer_id where s.id and a.is_active)
 );
$$;

-- Transition and its in-app review invitation commit together; repeated submits do not duplicate notices.
create function public.association_story_transition(p_actor uuid,p_id uuid,p_version integer,p_action text,p_comment text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.association_stories; rights jsonb; reviewer uuid;
begin
 rights:=public.association_story_access(p_actor);
 select * into r from public.association_stories where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if r.version<>p_version then raise exception 'version_conflict'; end if;
 if p_action='submit' then
  if not coalesce((rights->>'writer')::boolean,false) or r.created_by<>p_actor or r.status not in ('draft','changes_requested') then raise exception 'forbidden'; end if;
  if not (rights->>'reviewer_ready')::boolean then raise exception 'reviewer_unavailable'; end if;
  if length(btrim(r.title))=0 or length(btrim(r.body))=0 or length(btrim(r.description))=0 or not r.consent_confirmed or r.cover is null or r.cover->>'title'<>r.title or jsonb_array_length(r.images) not between 1 and 5 then raise exception 'content_required'; end if;
  select reviewer_id into reviewer from public.association_story_settings where id;
  update public.association_stories set status='pending_review',version=version+1,submitted_at=now(),review_comment=null,updated_at=now() where id=p_id returning * into r;
  insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key)
  values(reviewer,'M+','association_story_review','協會照片故事等待審核',r.title,'/association-stories.html?church=M%2B&story='||r.id,'association-story:'||r.id||':'||r.version)
  on conflict(user_id,event_key,source_key) where source_key is not null do nothing;
 elsif p_action in ('approve','return') then
  if not (rights->>'reviewer')::boolean then raise exception 'forbidden'; end if;
  if r.status<>'pending_review' then raise exception 'invalid_state'; end if;
  if p_action='return' then
   if length(btrim(p_comment)) not between 1 and 2000 then raise exception 'comment_required'; end if;
   update public.association_stories set status='changes_requested',review_comment=p_comment,version=version+1,updated_at=now() where id=p_id returning * into r;
   insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key)
   values(r.created_by,'M+','association_story_return','協會照片故事需要補充',r.title,'/association-stories.html?church=M%2B&story='||r.id,'association-story-return:'||r.id||':'||r.version)
   on conflict(user_id,event_key,source_key) where source_key is not null do nothing;
  else
   update public.association_stories set status='approved',approved_by=p_actor,approved_at=now(),approved_snapshot=jsonb_build_object('title',r.title,'body',r.body,'description',r.description,'include_donation',r.include_donation,'include_website',r.include_website,'sync_news',r.sync_news,'images',r.images,'cover',r.cover,'layout_key',r.layout_key,'theme_key',r.theme_key,'consent_confirmed',r.consent_confirmed),version=version+1,news_status=case when sync_news then 'pending' else 'not_requested' end,updated_at=now() where id=p_id returning * into r;
  end if;
 else raise exception 'invalid_action'; end if;
 return to_jsonb(r);
end $$;
revoke all on function public.association_story_access(uuid),public.association_story_transition(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.association_story_access(uuid),public.association_story_transition(uuid,uuid,integer,text,text) to service_role;
