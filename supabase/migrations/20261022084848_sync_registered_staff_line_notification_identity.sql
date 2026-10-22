-- Notification senders and the settings page both read pastoral_staff.line_subject.
-- Project a directly linked LINE login into that field using the protected account UUID.
-- Never match names, approve an identity, change recipients or start a notification.
create function church_auth.sync_registered_staff_line_subject(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare subject text; subjects integer;
begin
  if p_user is null or not exists(select 1 from church_auth.accounts where user_id=p_user and is_active and invitation_state='active') then return; end if;
  select min(provider_id),count(distinct provider_id) into subject,subjects
    from auth.identities where user_id=p_user and provider='custom:line-web';
  if subjects>1 then
    update public.pastoral_staff s set line_subject=null,updated_at=now()
      where s.app_user_id=p_user and exists(select 1 from auth.identities i
        where i.user_id=p_user and i.provider='custom:line-web' and i.provider_id=s.line_subject);
    return;
  end if;
  if subjects<>1 or subject is null or subject !~ '^U[0-9a-fA-F]{32}$' then return; end if;
  -- The unique subject constraint remains authoritative. An existing recipient is never displaced.
  begin
    update public.pastoral_staff s set line_subject=subject,updated_at=now()
      where s.app_user_id=p_user and s.is_active and s.line_subject is null
      and not exists(select 1 from public.pastoral_staff other where other.line_subject=subject and other.id<>s.id);
  exception when unique_violation then
    -- Do not break account registration if a concurrent, explicit LINE binding won the race.
    return;
  end;
end $$;
revoke all on function church_auth.sync_registered_staff_line_subject(uuid) from public,anon,authenticated;

create function church_auth.sync_registered_staff_line_account_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform church_auth.sync_registered_staff_line_subject(new.user_id);
  return new;
end $$;
revoke all on function church_auth.sync_registered_staff_line_account_trigger() from public,anon,authenticated;
-- AFTER triggers run by name: existing sync_pastoral_staff_account must create the staff row first.
create trigger zz_sync_registered_staff_line_account after insert or update on church_auth.accounts
  for each row execute function church_auth.sync_registered_staff_line_account_trigger();

create function church_auth.sync_registered_staff_line_identity_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.provider='custom:line-web' then
      update public.pastoral_staff set line_subject=null,updated_at=now()
        where app_user_id=old.user_id and line_subject=old.provider_id;
      perform church_auth.sync_registered_staff_line_subject(old.user_id);
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if old.provider='custom:line-web' and (old.user_id,old.provider,old.provider_id) is distinct from (new.user_id,new.provider,new.provider_id) then
      update public.pastoral_staff set line_subject=null,updated_at=now()
        where app_user_id=old.user_id and line_subject=old.provider_id;
    end if;
  end if;
  if new.provider='custom:line-web' then perform church_auth.sync_registered_staff_line_subject(new.user_id); end if;
  return new;
end $$;
revoke all on function church_auth.sync_registered_staff_line_identity_trigger() from public,anon,authenticated;
create trigger sync_registered_staff_line_identity after insert or update or delete on auth.identities
  for each row execute function church_auth.sync_registered_staff_line_identity_trigger();

do $$ declare account_row record; begin
  for account_row in select user_id from church_auth.accounts where is_active and invitation_state='active' loop
    perform church_auth.sync_registered_staff_line_subject(account_row.user_id);
  end loop;
end $$;
