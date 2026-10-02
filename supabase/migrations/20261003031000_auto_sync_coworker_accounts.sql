create or replace function public.sync_pastoral_staff_for_app_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  account_record church_auth.accounts%rowtype;
  v_staff_id uuid;
  staff_role text;
begin
  select * into account_record
  from church_auth.accounts
  where user_id=p_user;

  if not found then
    update public.pastoral_staff
    set is_active=false,updated_at=now()
    where app_user_id=p_user;
    return;
  end if;

  staff_role := case
    when account_record.job_title like '%牧師%' then 'pastor'
    when exists (
      select 1 from church_auth.account_roles r
      where r.user_id=p_user and r.role_key='administrator'
    ) then 'admin'
    else 'secretary'
  end;

  insert into public.pastoral_staff(app_user_id,line_subject,display_name,role,is_active)
  values(p_user,null,account_record.display_name,staff_role,account_record.is_active)
  on conflict (app_user_id) where app_user_id is not null
  do update set
    display_name=excluded.display_name,
    role=excluded.role,
    is_active=excluded.is_active,
    updated_at=now()
  returning id into v_staff_id;

  delete from public.pastoral_staff_access
  where pastoral_staff_access.staff_id=v_staff_id
    and entity_key in ('mplus','shine','tcsc');

  insert into public.pastoral_staff_access(staff_id,entity_key)
  select v_staff_id,
    case r.church_id when 'M+' then 'mplus' when 'SHiNE' then 'shine' else 'tcsc' end
  from church_auth.account_roles r
  where r.user_id=p_user
    and r.church_id in ('M+','SHiNE','TCSC')
  group by r.church_id
  on conflict (staff_id,entity_key) do nothing;
end;
$function$;

create or replace function public.sync_pastoral_staff_from_account_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform public.sync_pastoral_staff_for_app_user(coalesce(new.user_id,old.user_id));
  return coalesce(new,old);
end;
$function$;

drop trigger if exists sync_pastoral_staff_account on church_auth.accounts;
create trigger sync_pastoral_staff_account
after insert or update or delete on church_auth.accounts
for each row execute function public.sync_pastoral_staff_from_account_trigger();

drop trigger if exists sync_pastoral_staff_role on church_auth.account_roles;
create trigger sync_pastoral_staff_role
after insert or update or delete on church_auth.account_roles
for each row execute function public.sync_pastoral_staff_from_account_trigger();

do $block$
declare
  account_row record;
begin
  for account_row in select user_id from church_auth.accounts loop
    perform public.sync_pastoral_staff_for_app_user(account_row.user_id);
  end loop;
end;
$block$;

comment on function public.sync_pastoral_staff_for_app_user(uuid) is
  'Keeps coworker workspace identity and church access aligned with Church OS accounts.';
