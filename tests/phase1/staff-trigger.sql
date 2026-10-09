CREATE OR REPLACE FUNCTION public.sync_pastoral_staff_for_app_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
CREATE OR REPLACE FUNCTION public.sync_pastoral_staff_from_account_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.sync_pastoral_staff_for_app_user(coalesce(new.user_id,old.user_id));
  return coalesce(new,old);
end;
$function$;
CREATE TRIGGER sync_pastoral_staff_account AFTER INSERT OR DELETE OR UPDATE ON church_auth.accounts FOR EACH ROW EXECUTE FUNCTION sync_pastoral_staff_from_account_trigger();
CREATE TRIGGER sync_pastoral_staff_role AFTER INSERT OR DELETE OR UPDATE ON church_auth.account_roles FOR EACH ROW EXECUTE FUNCTION sync_pastoral_staff_from_account_trigger();
