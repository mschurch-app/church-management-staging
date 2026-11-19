begin;
alter table public.members add column if not exists profile_confirmation_id uuid,
 add column if not exists profile_confirmation_requested_at timestamptz,
 add column if not exists profile_confirmation_requested_by uuid,
 add column if not exists profile_confirmation_completed_at timestamptz;
create or replace function public.request_member_profile_confirmation(p_church text,p_member_id bigint,p_cancel boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.members%rowtype;
begin
 if church_auth.allowed(p_church,'members') is not true then raise exception 'permission_denied' using errcode='42501';end if;
 select * into m from public.members where church_id=p_church and id=p_member_id and archived_at is null for update;
 if not found then raise exception 'member_unavailable' using errcode='22023';end if;
 if p_cancel then
  update public.members set profile_confirmation_completed_at=now() where id=m.id and church_id=p_church and profile_confirmation_id is not null and profile_confirmation_completed_at is null;
 elsif m.profile_confirmation_id is null or m.profile_confirmation_completed_at is not null then
  update public.members set profile_confirmation_id=pg_catalog.gen_random_uuid(),profile_confirmation_requested_at=now(),profile_confirmation_requested_by=auth.uid(),profile_confirmation_completed_at=null where id=m.id and church_id=p_church;
 end if;
 return jsonb_build_object('ok',true,'pending',not p_cancel);
end $$;
revoke all on function public.request_member_profile_confirmation(text,bigint,boolean) from public,anon;
grant execute on function public.request_member_profile_confirmation(text,bigint,boolean) to authenticated;
CREATE OR REPLACE FUNCTION public.get_verified_member_status(p_church text, p_channel text, p_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare binding church_auth.member_bindings%rowtype; member_data jsonb; request_status text;
begin
  if p_church is null or p_church not in ('M+','SHiNE') or p_channel is distinct from '2011645391'
    or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('state','unbound'); end if;
  select * into binding from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and active for share;
  if found then
    select jsonb_build_object(
      'name',name,
      'phone',phone,
      'district',district,
      'birthday',birthday,
      'gender',gender,
      'group_name',group_name,
      'baptism_date',baptism_date,
      'faith_status',faith_status,
      'age_group',age_group,
      'growth_progress',growth_progress,
      'reconfirmation_id',case when profile_confirmation_completed_at is null then profile_confirmation_id else null end
    ) into member_data
      from public.members where id=binding.member_id and church_id=p_church for share;
    if found then return jsonb_build_object('state','approved','member',member_data); end if;
  end if;
  select status into request_status from church_auth.binding_requests where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject order by created_at desc,id desc limit 1;
  return jsonb_build_object('state',case when request_status='approved' then 'revoked' else coalesce(request_status,'unbound') end);
end $function$;

CREATE OR REPLACE FUNCTION public.update_verified_member(p_church text, p_channel text, p_subject text, p_patch jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare target_id bigint; item record; birthday_text text;
begin
  if p_church is null or p_church not in ('M+','SHiNE') or
    p_channel is distinct from '2011645391' or p_subject is null or
    p_subject !~ '^U[0-9a-f]{32}$' then
    return false;
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then
    raise exception 'invalid_patch' using errcode='22023';
  end if;
  for item in select key,value from jsonb_each(p_patch) loop
    if item.key not in ('phone','district','birthday','gender') or
      (jsonb_typeof(item.value)<>'string' and not(item.key='birthday' and item.value='null'::jsonb)) then
      raise exception 'invalid_patch' using errcode='22023';
    end if;
    if length(item.value #>> '{}') > (case item.key when 'phone' then 40 when 'district' then 100 when 'birthday' then 10 else 40 end) then
      raise exception 'invalid_patch' using errcode='22023';
    end if;
  end loop;
  birthday_text=p_patch->>'birthday';
  if birthday_text is not null and birthday_text<>'' then
    if birthday_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid_patch' using errcode='22023';
    end if;
    begin
      if to_char(birthday_text::date,'YYYY-MM-DD')<>birthday_text then
        raise exception 'invalid_patch';
      end if;
    exception when others then raise exception 'invalid_patch' using errcode='22023'; end;
  end if;
  -- Share lock serializes with revocation/rebinding until this transaction ends.
  select b.member_id into target_id from church_auth.member_bindings b
    where b.church_id=p_church and b.login_channel_id=p_channel
      and b.line_subject=p_subject and b.active
    for share;
  if not found then return false; end if;
  -- Predicate is rechecked under the member update lock; no target ID from client.
  update public.members m set
    phone=case when p_patch ? 'phone' then btrim(p_patch->>'phone') else m.phone end,
    district=case when p_patch ? 'district' then btrim(p_patch->>'district') else m.district end,
    birthday=case when p_patch ? 'birthday' then nullif(birthday_text,'') else m.birthday end,
    gender=case when p_patch ? 'gender' then btrim(p_patch->>'gender') else m.gender end
    where m.id=target_id and m.church_id=p_church;
  return found;
end $function$;

create or replace function public.confirm_verified_member_profile(p_church text,p_channel text,p_subject text,p_patch jsonb,p_confirmation_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare target_id bigint; m public.members%rowtype;
begin
 if p_confirmation_id is null or p_channel is distinct from '2011645391' or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' then return false;end if;
 select b.member_id into target_id from church_auth.member_bindings b where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active for share;
 if not found then return false;end if;
 select * into m from public.members where id=target_id and church_id=p_church and archived_at is null for update;
 if not found or m.profile_confirmation_id is distinct from p_confirmation_id then return false;end if;
 if m.profile_confirmation_completed_at is not null then return true;end if;
 if p_patch is null or not(p_patch ?& array['phone','district','birthday','gender']) then raise exception 'incomplete_confirmation' using errcode='22023';end if;
 if not public.update_verified_member(p_church,p_channel,p_subject,p_patch) then return false;end if;
 update public.members set profile_confirmation_completed_at=now() where id=target_id and church_id=p_church and profile_confirmation_id=p_confirmation_id;
 return true;
end $$;
revoke all on function public.confirm_verified_member_profile(text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.confirm_verified_member_profile(text,text,text,jsonb,uuid) to service_role;
commit;
