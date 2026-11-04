do $patch$
declare src text;
begin
 src:=pg_get_functiondef('church_auth.get_my_permission_navigation(text)'::regprocedure);
 if src like '%''schoolScheduleAccess''%' then raise exception 'school_schedule_navigation_already_present';end if;
 if strpos(src,'''payrollAccess'',p_church=''M+'' and public.school_payroll_dashboard_access(),')=0 then raise exception 'unexpected_navigation_definition';end if;
 src:=replace(src,'''payrollAccess'',p_church=''M+'' and public.school_payroll_dashboard_access(),',
 '''schoolScheduleAccess'',p_church=''M+'' and public.school_payroll_dashboard_access() and exists(select 1 from mschool.payroll_reviewer_accounts r where r.auth_user_id=a and mschool.can_manage_schedules(r.user_id)),''payrollAccess'',p_church=''M+'' and public.school_payroll_dashboard_access(),');
 execute src;
end $patch$;
