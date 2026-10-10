-- Formal church OS only. Reuse the same rows that the LINE prayer wall reads.
-- General care summaries and pastoral_notes are never copied to public content.
create or replace function public.create_care_prayer(p_church text,p_input jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_author text := btrim(p_input->>'author_name');
  v_title text := btrim(p_input->>'title');
  v_content text := btrim(p_input->>'content');
  v_group text := coalesce(nullif(btrim(p_input->>'group_name'),''),'未編組');
  v_category text := coalesce(btrim(p_input->>'category'),'');
  v_private boolean;
  v_row public.prayers%rowtype;
begin
  if p_church is null or p_church not in ('M+','SHiNE') or not church_auth.allowed(p_church,'private_prayers') then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object'
    or jsonb_typeof(p_input->'is_private') is distinct from 'boolean'
    or coalesce(char_length(v_author),0) not between 1 and 60
    or coalesce(char_length(v_title),0) not between 1 and 80
    or coalesce(char_length(v_content),0) not between 1 and 1000
    or char_length(v_group)>100 or char_length(v_category)>100 then
    raise exception 'invalid_prayer_input' using errcode='22023';
  end if;
  v_private := (p_input->>'is_private')::boolean;
  -- Serialise retries for this request before checking or inserting.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into v_row from public.prayers where wall_request_id=p_request_id;
  if found then
    if v_row.church_id is distinct from p_church or v_row.line_user_id is not null
      or v_row.author_name is distinct from v_author or v_row.title is distinct from v_title
      or v_row.content is distinct from v_content or v_row.is_private is distinct from v_private
      or v_row.group_name is distinct from v_group or coalesce(v_row.category,'') is distinct from v_category then
      raise exception 'request_conflict' using errcode='22023';
    end if;
    return jsonb_build_object('id',v_row.id,'is_private',v_row.is_private);
  end if;
  insert into public.prayers(church_id,author_name,group_name,title,content,is_private,status,hands_count,wall_request_id,category)
  values(p_church,v_author,v_group,v_title,v_content,v_private,'pending',0,p_request_id,v_category)
  returning * into v_row;
  if not v_private then
    insert into public.prayer_activity(prayer_id,church_id,activity_type) values(v_row.id,p_church,'created');
  end if;
  return jsonb_build_object('id',v_row.id,'is_private',v_private);
end;
$$;
revoke all on function public.create_care_prayer(text,jsonb,uuid) from public,anon;
grant execute on function public.create_care_prayer(text,jsonb,uuid) to authenticated;

-- Refresh already-open walls when public prayer text or visibility changes.
alter table public.prayer_activity drop constraint prayer_activity_activity_type_check;
alter table public.prayer_activity add constraint prayer_activity_activity_type_check
  check(activity_type in ('prayed','watched','created','updated'));
create or replace function church_auth.care_prayer_wall_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (old.is_private is false or new.is_private is false)
    and (old.title,old.content,old.author_name,old.group_name,old.is_private,old.expires_at,old.is_answered)
      is distinct from (new.title,new.content,new.author_name,new.group_name,new.is_private,new.expires_at,new.is_answered) then
    insert into public.prayer_activity(prayer_id,church_id,activity_type) values(new.id,new.church_id,'updated');
  end if;
  return new;
end;
$$;
revoke all on function church_auth.care_prayer_wall_changed() from public,anon,authenticated;
create trigger care_prayer_wall_changed after update on public.prayers
  for each row execute function church_auth.care_prayer_wall_changed();
