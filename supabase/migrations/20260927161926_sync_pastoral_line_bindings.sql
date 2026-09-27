do $$
declare
  matched_count integer;
  system_approver uuid;
begin
  select o.user_id into system_approver
  from church_auth.owners o
  join church_auth.accounts a on a.user_id=o.user_id
  where a.is_active
  order by a.updated_at desc
  limit 1;

  if system_approver is null then
    raise exception 'An active church owner is required to approve imported bindings';
  end if;

  with matched as (
    select distinct on (s.id)
      'M+'::text as church_id,
      '2011645391'::text as login_channel_id,
      s.line_subject,
      m.id as member_id
    from public.pastoral_staff s
    join public.pastoral_staff_access a
      on a.staff_id=s.id and a.entity_key='mplus'
    join public.members m
      on m.church_id='M+'
     and regexp_replace(regexp_replace(m.name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
       = regexp_replace(regexp_replace(s.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
    where s.is_active
      and s.line_subject ~ '^U[0-9a-f]{32}$'
  )
  select count(*) into matched_count from matched;

  if matched_count <> 4 then
    raise exception 'Expected 4 unique M+ pastoral LINE/member matches, found %', matched_count;
  end if;

  insert into church_auth.member_bindings(
    church_id,login_channel_id,line_subject,member_id,active,approved_by,approved_at
  )
  select
    'M+','2011645391',s.line_subject,m.id,true,system_approver,now()
  from public.pastoral_staff s
  join public.pastoral_staff_access a
    on a.staff_id=s.id and a.entity_key='mplus'
  join public.members m
    on m.church_id='M+'
   and regexp_replace(regexp_replace(m.name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
     = regexp_replace(regexp_replace(s.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
  where s.is_active
    and s.line_subject ~ '^U[0-9a-f]{32}$'
  on conflict(church_id,login_channel_id,line_subject) do update
    set member_id=excluded.member_id,
        active=true,
        approved_by=system_approver,
        approved_at=excluded.approved_at;
end $$;
