-- Preserve all draft/media data; deletion is reversible and never deletes Facebook posts.
alter table public.association_stories
 add column key_points text not null default '' check(length(key_points)<=300),
 add column subject_mode text not null default 'auto' check(subject_mode in ('auto','keep_scene','cutout')),
 add column deleted_at timestamptz,add column deleted_by uuid references auth.users(id),
 add column cover_history jsonb not null default '[]' check(jsonb_typeof(cover_history)='array'),
 add column design_art jsonb,add column design_lock uuid,add column design_lock_at timestamptz;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('association-story-art','association-story-art',false,12582912,array['image/png','image/jpeg']);
create function public.association_story_design_claim(p_actor uuid,p_id uuid,p_version integer,p_job uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.association_stories;begin
 if p_job is null then raise exception 'invalid_input';end if;
 select * into r from public.association_stories where id=p_id for update;
 if not found then raise exception 'not_found';end if;
 if r.version<>p_version then raise exception 'version_conflict';end if;
 if r.created_by<>p_actor or r.deleted_at is not null or r.status not in ('draft','changes_requested') or not coalesce((public.association_story_access(p_actor)->>'writer')::boolean,false) then raise exception 'forbidden';end if;
 if r.design_lock is not null and r.design_lock_at>now()-interval '3 minutes' then raise exception 'design_in_progress';end if;
 update public.association_stories set design_lock=p_job,design_lock_at=now() where id=p_id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.association_story_design_claim(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.association_story_design_claim(uuid,uuid,integer,uuid) to service_role;
-- The immutable review snapshot includes every piece of visible art text and design direction.
do $$ declare d text;begin
 d:=pg_get_functiondef('public.association_story_transition(uuid,uuid,integer,text,text)'::regprocedure);
 if position('''key_points''' in d)=0 then
  d:=replace(d,'''consent_confirmed'', r.consent_confirmed','''consent_confirmed'', r.consent_confirmed, ''key_points'', r.key_points, ''subject_mode'', r.subject_mode, ''layout_notes'', r.layout_notes');
  -- Older source formatting has no spaces after commas.
  d:=replace(d,'''consent_confirmed'',r.consent_confirmed','''consent_confirmed'',r.consent_confirmed,''key_points'',r.key_points,''subject_mode'',r.subject_mode,''layout_notes'',r.layout_notes');
  if position('''key_points''' in d)=0 then raise exception 'snapshot_definition_changed';end if;
  execute d;
 end if;
end $$;
