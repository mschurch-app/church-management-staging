alter table public.pastoral_staff
  add column if not exists app_user_id uuid;

alter table public.pastoral_staff
  alter column line_subject drop not null;

create unique index if not exists pastoral_staff_app_user_id_key
  on public.pastoral_staff(app_user_id)
  where app_user_id is not null;

update public.pastoral_staff s
set app_user_id = a.user_id,
    updated_at = now()
from church_auth.accounts a
where a.is_active
  and s.app_user_id is null
  and regexp_replace(regexp_replace(a.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
      = regexp_replace(regexp_replace(s.display_name,'(牧師|師母|傳道|弟兄|姊妹)$','','g'),'\s+','','g')
  and not exists (
    select 1 from public.pastoral_staff linked where linked.app_user_id = a.user_id
  );

insert into public.pastoral_staff(app_user_id,line_subject,display_name,role,is_active)
select a.user_id,null,a.display_name,
  case
    when a.job_title like '%牧師%' then 'pastor'
    when exists (
      select 1 from church_auth.account_roles r
      where r.user_id=a.user_id and r.role_key='administrator'
    ) then 'admin'
    else 'secretary'
  end,
  true
from church_auth.accounts a
where a.is_active
  and not exists (
    select 1 from public.pastoral_staff s where s.app_user_id=a.user_id
  );

insert into public.pastoral_staff_access(staff_id,entity_key)
select distinct s.id,
  case r.church_id when 'M+' then 'mplus' when 'SHiNE' then 'shine' else 'tcsc' end
from church_auth.accounts a
join church_auth.account_roles r on r.user_id=a.user_id
join public.pastoral_staff s on s.app_user_id=a.user_id
where a.is_active
  and r.church_id in ('M+','SHiNE','TCSC')
on conflict (staff_id,entity_key) do nothing;

create or replace function public.get_pastoral_staff_for_app_user(p_user uuid)
returns jsonb
language sql
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'id',s.id,
    'name',s.display_name,
    'role',s.role,
    'entityKeys',coalesce((
      select jsonb_agg(sa.entity_key order by sa.entity_key)
      from public.pastoral_staff_access sa
      where sa.staff_id=s.id
    ),'[]'::jsonb)
  )
  from church_auth.accounts a
  join public.pastoral_staff s on s.app_user_id=a.user_id
  where a.user_id=p_user and a.is_active and s.is_active
  limit 1;
$function$;

comment on column public.pastoral_staff.app_user_id is
  'Explicit Church OS account link used by the coworker workspace single sign-on.';
