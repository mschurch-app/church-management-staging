-- Add a work assignment only. No finance role is granted by this catalog change.
CREATE OR REPLACE FUNCTION church_auth.save_work_profile(p_user uuid, p_church text, p_profile jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare root uuid; prior church_auth.work_profiles; item jsonb; catalog jsonb:='{"church":{"administration":"行政","accounting":"財務會計","general_affairs":"總務","worship":"敬拜","welcome":"接待關懷","youth_junior":"學生牧區 · 青少","youth":"學生牧區 · 青年","college":"學生牧區 · 大專","children":"兒童主日學","av_sound":"影音 · 音控","av_lighting":"影音 · 燈控","av_subtitles":"影音 · 字幕"},"school":{"director":"主任","teacher":"老師","assistant":"工讀生","volunteer":"志工"},"team":{"manager":"經理"},"camp":{"manager":"營隊管理者","coworker":"營隊同工"}}'::jsonb; scopes text[]; nextrow jsonb;
begin
 perform church_auth.assert_account_owner();root:=church_auth.canonical_account(p_user);
 if p_church not in ('M+','SHiNE') or p_profile is null or jsonb_typeof(p_profile)<>'object' or coalesce(p_profile->>'church_role','') not in ('主任牧師','牧師','師母','傳道','輔導','事工領袖','小組長') or jsonb_typeof(p_profile->'assignments') is distinct from 'array' or jsonb_typeof(p_profile->'oversight_domains') is distinct from 'array' then raise exception 'invalid_work_profile';end if;
 if coalesce(p_profile->>'reminder_route','') not in ('group','personal') then raise exception 'invalid_reminder_route';end if;
 if jsonb_array_length(p_profile->'assignments')>40 or jsonb_array_length(p_profile->'oversight_domains')>4 then raise exception 'invalid_work_profile';end if;
 perform pg_advisory_xact_lock(hashtextextended('work-profile:'||root::text||':'||p_church,0));
 select * into prior from church_auth.work_profiles where user_id=root and church_id=p_church for update;
 if coalesce((p_profile->>'expected_version')::integer,-1)<>coalesce(prior.version,0) then raise exception 'work_profile_changed';end if;
 for item in select value from jsonb_array_elements(p_profile->'assignments') loop
  if not coalesce(catalog ? (item->>'domain'),false) or not coalesce((catalog->(item->>'domain')) ? (item->>'key'),false) or coalesce(item->>'type','') not in ('primary','shared') then raise exception 'invalid_work_assignment';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_profile->'assignments') x group by x->>'domain',x->>'key' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_profile->'assignments') x where x->>'type'='primary' group by x->>'domain' having count(*)>1) then raise exception 'duplicate_work_assignment';end if;
 select coalesce(array_agg(distinct value),'{}') into scopes from jsonb_array_elements_text(p_profile->'oversight_domains');
 if exists(select 1 from unnest(scopes) d where d not in ('church','school','team','camp')) then raise exception 'invalid_oversight';end if;
 insert into church_auth.work_profiles(user_id,church_id,church_role,assignments,oversight_domains,version,source,updated_by,reminder_route) values(root,p_church,p_profile->>'church_role',p_profile->'assignments',scopes,coalesce(prior.version,0)+1,'administrator',auth.uid(),p_profile->>'reminder_route') on conflict(user_id,church_id) do update set church_role=excluded.church_role,assignments=excluded.assignments,oversight_domains=excluded.oversight_domains,version=excluded.version,source=excluded.source,reminder_route=excluded.reminder_route,updated_by=excluded.updated_by,updated_at=now();
 select to_jsonb(p) into nextrow from church_auth.work_profiles p where p.user_id=root and p.church_id=p_church;
 insert into church_auth.work_profile_audit(actor_user_id,subject_user_id,church_id,before_state,after_state) values(auth.uid(),root,p_church,case when prior.user_id is not null then to_jsonb(prior) else null end,nextrow);
end $function$

