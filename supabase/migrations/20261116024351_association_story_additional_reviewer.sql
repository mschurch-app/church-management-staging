-- Explicitly configured second reviewer; ordinary authors and unconfigured owners cannot approve.
alter table public.association_story_settings add column additional_reviewer_id uuid references auth.users(id);
create or replace function public.association_story_access(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 with actor as (select church_auth.canonical_account(p_actor) as id)
 select jsonb_build_object('actor_id',(select id from actor),
 'reviewer',exists(select 1 from public.association_story_settings s join church_auth.accounts a on a.user_id in (s.reviewer_id,s.additional_reviewer_id) where s.id and a.user_id=(select id from actor) and a.is_active),
 'writer',exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
 where a.user_id=(select id from actor) and a.is_active and g.church_id='M+' and g.permission in ('website_group_resources','association_content')
 and not exists(select 1 from church_auth.account_feature_permissions f where f.user_id=(select id from actor) and f.church_id='M+' and f.feature_key=g.permission and (not f.can_view or (not f.can_create and not f.can_edit)))),
 'reader',exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id where a.user_id=(select id from actor) and a.is_active and g.church_id='M+' and g.permission in ('website_group_resources','association_content') and not exists(select 1 from church_auth.account_feature_permissions f where f.user_id=(select id from actor) and f.church_id='M+' and f.feature_key=g.permission and not f.can_view)),
 'reviewer_ready',exists(select 1 from public.association_story_settings s join church_auth.accounts a on a.user_id in (s.reviewer_id,s.additional_reviewer_id) where s.id and a.is_active)
 );
$$;

create or replace function public.association_story_transition(p_actor uuid,p_id uuid,p_version integer,p_action text,p_comment text default '')
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
  update public.association_stories set status='pending_review',version=version+1,submitted_at=now(),review_comment=null,updated_at=now() where id=p_id returning * into r;
  insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url,source_key)
  select distinct a.user_id,'M+','association_story_review','協會照片故事等待審核',r.title,'/association-stories.html?church=M%2B&story='||r.id,'association-story:'||r.id||':'||r.version from public.association_story_settings s join church_auth.accounts a on a.user_id in (s.reviewer_id,s.additional_reviewer_id) where s.id and a.is_active
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
