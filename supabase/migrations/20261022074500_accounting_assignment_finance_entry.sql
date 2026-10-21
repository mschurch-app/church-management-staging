-- Accounting work assignments grant entry only; cash verification and approval remain separate.
create or replace function public.finance_user_can(p_user uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from church_auth.accounts presented
  join church_auth.accounts root on root.user_id=church_auth.canonical_account(presented.user_id) and root.is_active
  where presented.user_id=p_user and presented.is_active
   and exists(select 1 from church_auth.grants g where g.user_id=presented.user_id and g.church_id='M+')
   and exists(select 1 from church_auth.grants g where g.user_id=root.user_id and g.church_id='M+')
   and (
    exists(select 1 from public.finance_staff_roles r
     join church_auth.accounts a on a.user_id=r.user_id and a.is_active
     where r.role_key=p_role and r.user_id in(select church_auth.account_users(p_user))
      and exists(select 1 from church_auth.grants g where g.user_id=r.user_id and g.church_id='M+'))
    or (p_role='entry' and exists(
     select 1 from church_auth.work_profiles w
     cross join lateral jsonb_array_elements(w.assignments) assignment
     where w.user_id=root.user_id and w.church_id='M+'
      and assignment->>'domain'='church' and assignment->>'key'='accounting'
      and assignment->>'type' in ('primary','shared')))
   )
 );
$$;
revoke all on function public.finance_user_can(uuid,text) from public,anon,authenticated;
grant execute on function public.finance_user_can(uuid,text) to service_role;

-- Service-only listing for finance administration and counter pickers, no public member access.
create or replace function public.finance_effective_role_assignments()
returns table(user_id uuid,role_key text,source_key text)
language sql stable security definer set search_path='' as $$
 select distinct church_auth.canonical_account(r.user_id),r.role_key,'individual'::text
 from public.finance_staff_roles r where public.finance_user_can(r.user_id,r.role_key)
 union
 select distinct w.user_id,'entry'::text,'accounting_assignment'::text
 from church_auth.work_profiles w
 where w.church_id='M+' and public.finance_user_can(w.user_id,'entry')
  and exists(select 1 from jsonb_array_elements(w.assignments) assignment
   where assignment->>'domain'='church' and assignment->>'key'='accounting'
    and assignment->>'type' in ('primary','shared'));
$$;
revoke all on function public.finance_effective_role_assignments() from public,anon,authenticated;
grant execute on function public.finance_effective_role_assignments() to service_role;
