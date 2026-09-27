begin;

create or replace function church_auth.review_member_binding(p_id uuid,p_action text,p_member bigint)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  request church_auth.binding_requests%rowtype;
  target_church text;
begin
  if auth.uid() is null then raise exception 'review_denied' using errcode='42501'; end if;
  select church_id into target_church from church_auth.binding_requests where id=p_id;
  if not found then raise exception 'review_denied' using errcode='42501'; end if;
  perform church_auth.lock_binding_reviewer(target_church);
  select * into request from church_auth.binding_requests where id=p_id for update;
  if not found or request.church_id<>target_church then return false; end if;
  if p_action is null or p_action not in ('approve','reject','revoke') then return false; end if;
  if p_action='approve' and p_member is null then return false; end if;
  if p_action<>'approve' and p_member is not null then return false; end if;
  if request.status<>'pending' and p_action<>'revoke' then return false; end if;

  if p_action='approve' then
    if nullif(btrim(request.applicant_phone),'') is null then return false; end if;
    perform 1 from public.members where id=p_member and church_id=request.church_id for update;
    if not found then return false; end if;

    insert into church_auth.member_bindings(church_id,login_channel_id,line_subject,member_id,active,approved_by,approved_at)
      values(request.church_id,request.login_channel_id,request.line_subject,p_member,true,auth.uid(),now())
      on conflict(church_id,login_channel_id,line_subject) do update
        set active=true,approved_by=auth.uid(),approved_at=now()
        where not church_auth.member_bindings.active and church_auth.member_bindings.member_id=excluded.member_id;
    if not found then return false; end if;

    update public.members
      set phone=btrim(request.applicant_phone)
      where id=p_member and church_id=request.church_id;
    update church_auth.binding_requests set status='approved',member_id=p_member where id=p_id;
  elsif p_action='reject' then
    update church_auth.binding_requests set status='rejected' where id=p_id;
  else
    if request.status<>'approved' then return false; end if;
    update church_auth.member_bindings set active=false
      where church_id=request.church_id and login_channel_id=request.login_channel_id
        and line_subject=request.line_subject and member_id=request.member_id and active;
    if not found then return false; end if;
    update church_auth.binding_requests set status='revoked' where id=p_id;
  end if;

  insert into church_auth.binding_reviews(request_id,actor,action,member_id)
    values(p_id,auth.uid(),p_action,coalesce(p_member,request.member_id));
  return true;
exception when unique_violation then return false;
end
$$;

commit;
