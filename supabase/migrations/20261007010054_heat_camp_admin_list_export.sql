-- Grant-gated, audited, masked access for the 2027 Heat Basketball Camp admin list.
-- No registration or payment records are modified by this migration.

alter table church_auth.grants drop constraint if exists grants_permission_check;
alter table church_auth.grants add constraint grants_permission_check check (permission in (
  'attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces',
  'newcomer_care','tree_reading_admin','binding_review','notification_settings',
  'website_weekly','website_group_resources','inventory','heat_camp'
));

create or replace function church_auth.role_permissions(target_role text)
returns text[] language sql immutable set search_path='' as $$
  select case target_role
    when 'pastor' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory']::text[]
    when 'pastor_spouse' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory']::text[]
    when 'administrator' then array['attendance','groups','members','schedules','spaces','newcomer_care','binding_review','notification_settings','inventory']::text[]
    when 'group_leader' then array['attendance','groups','members']::text[]
    when 'care' then array['members','pastoral_chats','private_prayers','newcomer_care']::text[]
    when 'facilities' then array['spaces','inventory']::text[]
    when 'custom' then array[]::text[]
    else null::text[] end;
$$;

create or replace function public.set_admin_account_access_v3(p_user uuid,p_active boolean,p_grants jsonb,p_roles jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item jsonb; target_church text; target_role text; expected text[]; church_count integer;
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if exists(select 1 from church_auth.owners o where o.user_id=p_user) then raise exception 'owner_immutable'; end if;
  if jsonb_typeof(p_grants)<>'array' or jsonb_array_length(p_grants)>24 or jsonb_typeof(p_roles)<>'array' or jsonb_array_length(p_roles)>1 then raise exception 'invalid_access'; end if;
  select count(distinct church_id) into church_count from (
    select value->>'church_id' church_id from jsonb_array_elements(p_grants)
    union all select value->>'church_id' from jsonb_array_elements(p_roles)
  ) selected where church_id is not null;
  if church_count>1 then raise exception 'one_church_only'; end if;
  for item in select value from jsonb_array_elements(p_grants) loop
    if item->>'church_id' not in ('M+','SHiNE') or item->>'permission' not in (
      'members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces',
      'newcomer_care','tree_reading_admin','binding_review','notification_settings',
      'website_weekly','website_group_resources','inventory','heat_camp'
    ) then raise exception 'invalid_grant'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_roles) loop
    target_church:=item->>'church_id'; target_role:=item->>'role_key';
    if target_church not in ('M+','SHiNE') or church_auth.role_permissions(target_role) is null then raise exception 'invalid_role'; end if;
    if not exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church) then raise exception 'role_without_grants'; end if;
    if target_role<>'custom' then
      expected:=church_auth.role_permissions(target_role);
      if exists(select 1 from unnest(expected) permission where not exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church and g->>'permission'=permission))
         or exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church and not(g->>'permission'=any(expected))) then raise exception 'role_grants_mismatch'; end if;
    end if;
  end loop;
  if exists(select 1 from (select distinct g->>'church_id' church_id from jsonb_array_elements(p_grants) g) x where not exists(select 1 from jsonb_array_elements(p_roles) r where r->>'church_id'=x.church_id)) then raise exception 'missing_role'; end if;
  update church_auth.accounts set is_active=p_active,updated_at=now() where user_id=p_user;
  if not found then raise exception 'account_not_found'; end if;
  delete from church_auth.grants where user_id=p_user;
  insert into church_auth.grants(user_id,church_id,permission) select distinct p_user,x.value->>'church_id',x.value->>'permission' from jsonb_array_elements(p_grants) x(value);
  delete from church_auth.account_roles where user_id=p_user;
  insert into church_auth.account_roles(user_id,church_id,role_key) select p_user,x.value->>'church_id',x.value->>'role_key' from jsonb_array_elements(p_roles) x(value);
  return true;
end $$;

create or replace function public.set_admin_feature_permissions(p_user uuid,p_church text,p_permissions jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item jsonb; allowed_features constant text[]:=array['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp'];
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_church not in ('M+','SHiNE') or jsonb_typeof(p_permissions)<>'array' or jsonb_array_length(p_permissions)>20 then raise exception 'invalid_permissions'; end if;
  for item in select value from jsonb_array_elements(p_permissions) loop
    if not(item->>'feature_key'=any(allowed_features)) then raise exception 'invalid_feature'; end if;
  end loop;
  delete from church_auth.account_feature_permissions where user_id=p_user and church_id=p_church;
  insert into church_auth.account_feature_permissions(user_id,church_id,feature_key,can_view,can_create,can_edit,can_delete,can_export,can_approve,can_manage)
  select p_user,p_church,x->>'feature_key',coalesce((x->>'view')::boolean,false),coalesce((x->>'create')::boolean,false),coalesce((x->>'edit')::boolean,false),coalesce((x->>'delete')::boolean,false),coalesce((x->>'export')::boolean,false),coalesce((x->>'approve')::boolean,false),coalesce((x->>'manage')::boolean,false)
  from jsonb_array_elements(p_permissions) x;
  return true;
end $$;

create or replace function public.set_admin_home_preferences(p_user uuid,p_church text,p_home_modules text[],p_notification_topics text[] default '{}')
returns boolean language plpgsql security definer set search_path='' as $$
declare
  allowed_modules constant text[]:=array[
    'members','newcomer_care','pastoral_workspace','private_prayers','pastoral_chats','attendance','groups','schedules','spaces','inventory','heat_camp',
    'website_weekly','website_group_resources','tree_reading_admin','binding_review','notification_settings',
    'school','school_checkin','school_schedules','school_rollcall','school_students','school_counseling','school_reports',
    'basketball','basketball_gamecenter','basketball_tactics','basketball_assignments','basketball_schedule','basketball_daily',
    'system_monitor','church_settings'
  ];
  allowed_topics constant text[]:=array['newcomer','newcomer_care','tasks','calendar','prayers','schedules','school','system'];
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_church not in ('M+','SHiNE')
     or cardinality(coalesce(p_home_modules,'{}'))>40 or cardinality(coalesce(p_notification_topics,'{}'))>24
     or exists(select 1 from unnest(coalesce(p_home_modules,'{}')) x where not(x=any(allowed_modules)))
     or exists(select 1 from unnest(coalesce(p_notification_topics,'{}')) x where not(x=any(allowed_topics))) then raise exception 'invalid_preferences'; end if;
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user) then raise exception 'account_not_found'; end if;
  insert into church_auth.account_home_preferences(user_id,church_id,home_modules,notification_topics,updated_at)
  values(p_user,p_church,coalesce(p_home_modules,'{}'),coalesce(p_notification_topics,'{}'),now())
  on conflict(user_id,church_id) do update set home_modules=excluded.home_modules,notification_topics=excluded.notification_topics,updated_at=now();
  return true;
end $$;

-- Owners can administer the module; other users receive access only when explicitly assigned.
insert into church_auth.grants(user_id,church_id,permission)
select o.user_id,'M+','heat_camp' from church_auth.owners o on conflict do nothing;

create or replace function public.heat_camp_2027_admin_list(
  p_user uuid,p_action text,p_search text default '',p_status text default '',p_payment text default '',p_limit integer default 50,p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event uuid; v_total integer; v_items jsonb; v_summary jsonb; v_limit integer:=least(greatest(coalesce(p_limit,50),1),100); v_offset integer:=greatest(coalesce(p_offset,0),0); v_search text:=left(trim(coalesce(p_search,'')),100);
begin
  if p_action not in ('view','export') then raise exception 'invalid_action'; end if;
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
     or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
         and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id='M+' and g.permission='heat_camp')) then raise exception 'forbidden'; end if;
  if coalesce((select case when p_action='export' then f.can_export else f.can_view end
      from church_auth.account_feature_permissions f where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),true)=false then raise exception 'forbidden'; end if;

  select id into v_event from camp_registration.events where slug='heat-basketball-camp-2027' limit 1;
  if v_event is null then raise exception 'event_not_found'; end if;
  with rows as (
    select r.id,r.registration_no,r.status,r.player_name,r.guardian_name,r.guardian_phone,r.email,r.school_stage,r.school_name,
      r.jersey_size,r.jersey_number,r.jersey_name,r.amount,r.created_at,r.paid_at,
      p.merchant_order_no,p.status payment_order_status,p.bank_code,p.virtual_account_masked,p.account_expires_at,p.paid_at order_paid_at,
      case when p.status='paid' or r.status='paid' then 'paid'
           when p.status in ('created','account_issued') and p.account_expires_at<=now() then 'expired'
           when p.status in ('created','account_issued') then 'awaiting_payment'
           when p.status='failed' then 'failed'
           when p.status='refunded' or r.status='refunded' then 'refunded'
           when p.status='cancelled' or r.status='cancelled' then 'cancelled'
           else 'unpaid' end payment_status,
      case when coalesce(p.provider_result->>'PaymentType','') ilike 'CREDIT%' then '信用卡'
           when coalesce(p.provider_result->>'PaymentType','')='VACC' then 'ATM 虛擬帳號'
           when coalesce(p.provider_result->>'PaymentType','')<>'' then left(p.provider_result->>'PaymentType',30)
           else '' end payment_method
    from camp_registration.registrations r
    left join lateral(select o.* from camp_registration.payment_orders o where o.registration_id=r.id order by o.created_at desc limit 1) p on true
    where r.event_id=v_event
  ), filtered as (
    select * from rows x
    where (p_status='' or x.status=p_status)
      and (p_payment='' or x.payment_status=p_payment)
      and (v_search='' or x.registration_no ilike '%'||v_search||'%' or x.player_name ilike '%'||v_search||'%' or x.guardian_name ilike '%'||v_search||'%' or x.guardian_phone ilike '%'||v_search||'%' or x.email ilike '%'||v_search||'%')
  )
  select count(*) into v_total from filtered;
  if p_action='export' and v_total>2000 then raise exception 'filter_required'; end if;
  with rows as (
    select r.id,r.registration_no,r.status,r.player_name,r.guardian_name,r.guardian_phone,r.email,r.school_stage,r.school_name,
      r.jersey_size,r.jersey_number,r.jersey_name,r.amount,r.created_at,r.paid_at,
      p.merchant_order_no,p.status payment_order_status,p.bank_code,p.virtual_account_masked,p.account_expires_at,p.paid_at order_paid_at,
      case when p.status='paid' or r.status='paid' then 'paid'
           when p.status in ('created','account_issued') and p.account_expires_at<=now() then 'expired'
           when p.status in ('created','account_issued') then 'awaiting_payment'
           when p.status='failed' then 'failed'
           when p.status='refunded' or r.status='refunded' then 'refunded'
           when p.status='cancelled' or r.status='cancelled' then 'cancelled'
           else 'unpaid' end payment_status,
      case when coalesce(p.provider_result->>'PaymentType','') ilike 'CREDIT%' then '信用卡'
           when coalesce(p.provider_result->>'PaymentType','')='VACC' then 'ATM 虛擬帳號'
           when coalesce(p.provider_result->>'PaymentType','')<>'' then left(p.provider_result->>'PaymentType',30)
           else '' end payment_method
    from camp_registration.registrations r
    left join lateral(select o.* from camp_registration.payment_orders o where o.registration_id=r.id order by o.created_at desc limit 1) p on true
    where r.event_id=v_event
  ), filtered as (
    select * from rows x
    where (p_status='' or x.status=p_status)
      and (p_payment='' or x.payment_status=p_payment)
      and (v_search='' or x.registration_no ilike '%'||v_search||'%' or x.player_name ilike '%'||v_search||'%' or x.guardian_name ilike '%'||v_search||'%' or x.guardian_phone ilike '%'||v_search||'%' or x.email ilike '%'||v_search||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'registration_no',registration_no,'registration_status',status,'player_name',player_name,'guardian_name',guardian_name,
    'guardian_phone',guardian_phone,'email',email,'school_stage',school_stage,'school_name',school_name,
    'jersey_size',jersey_size,'jersey_number',jersey_number,'jersey_name',jersey_name,'amount',amount,
    'created_at',created_at,'paid_at',coalesce(order_paid_at,paid_at),'merchant_order_no',merchant_order_no,
    'payment_status',payment_status,'payment_method',payment_method,'bank_code',bank_code,
    'virtual_account_masked',virtual_account_masked,'account_expires_at',account_expires_at
  ) order by created_at desc), '[]'::jsonb) into v_items
  from (select * from filtered order by created_at desc limit case when p_action='export' then 2000 else v_limit end offset case when p_action='export' then 0 else v_offset end) page;

  select jsonb_build_object(
    'total',count(*),'paid',count(*) filter(where r.status='paid' or p.status='paid'),
    'awaiting_payment',count(*) filter(where p.status in ('created','account_issued') and (p.account_expires_at is null or p.account_expires_at>now())),
    'expired',count(*) filter(where p.status in ('created','account_issued') and p.account_expires_at<=now()),
    'failed',count(*) filter(where p.status='failed'),
    'exception_review',count(*) filter(where r.status='exception_review'),
    'waitlisted',count(*) filter(where r.status='waitlisted'),
    'cancelled_or_refunded',count(*) filter(where r.status in ('cancelled','refunded'))
  ) into v_summary from camp_registration.registrations r
  left join lateral(select o.status,o.account_expires_at from camp_registration.payment_orders o where o.registration_id=r.id order by o.created_at desc limit 1) p on true
  where r.event_id=v_event;

  insert into camp_registration.audit_log(actor_type,actor_id,action,details)
  values('staff',p_user::text,case when p_action='export' then 'admin_list_exported' else 'admin_list_viewed' end,
    jsonb_build_object('search_used',v_search<>'','registration_status',p_status,'payment_status',p_payment,'result_count',jsonb_array_length(v_items)));
  return jsonb_build_object('event_name','2027 熱火籃球營','total_filtered',v_total,'offset',v_offset,'limit',v_limit,'summary',v_summary,'items',v_items);
end $$;

revoke all on function public.heat_camp_2027_admin_list(uuid,text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_admin_list(uuid,text,text,text,text,integer,integer) to service_role;
