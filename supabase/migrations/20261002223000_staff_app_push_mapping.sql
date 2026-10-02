create or replace function public.get_app_push_user_for_staff(p_staff_id uuid)
returns uuid language sql security definer set search_path='' as $$
 select a.user_id from public.pastoral_staff s join church_auth.accounts a
 on regexp_replace(regexp_replace(a.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
  =regexp_replace(regexp_replace(s.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
 where s.id=p_staff_id and s.is_active and a.is_active limit 1;
$$;
revoke all on function public.get_app_push_user_for_staff(uuid) from public,anon,authenticated;
grant execute on function public.get_app_push_user_for_staff(uuid) to service_role;

