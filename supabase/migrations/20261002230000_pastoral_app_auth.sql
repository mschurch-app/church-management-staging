create or replace function public.get_pastoral_staff_for_app_user(p_user uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'name',s.display_name,'role',s.role,'entityKeys',coalesce((select jsonb_agg(sa.entity_key order by sa.entity_key) from public.pastoral_staff_access sa where sa.staff_id=s.id),'[]'::jsonb))
 from church_auth.accounts a join public.pastoral_staff s
 on regexp_replace(regexp_replace(a.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
  =regexp_replace(regexp_replace(s.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
 where a.user_id=p_user and a.is_active and s.is_active limit 1;
$$;
revoke all on function public.get_pastoral_staff_for_app_user(uuid) from public,anon,authenticated;
grant execute on function public.get_pastoral_staff_for_app_user(uuid) to service_role;

create or replace function public.get_my_pastoral_staff()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 select public.get_pastoral_staff_for_app_user(auth.uid()) into result;
 if result is null then raise exception 'staff_forbidden'; end if;
 return result;
end $$;
revoke all on function public.get_my_pastoral_staff() from public,anon;
grant execute on function public.get_my_pastoral_staff() to authenticated,service_role;

