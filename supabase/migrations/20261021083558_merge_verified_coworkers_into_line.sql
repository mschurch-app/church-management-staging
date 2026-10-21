begin;

-- A removed login remains in auth.users for immutable historical actor references.
-- This private snapshot allows a supervised recovery without exposing donor or staff data.
create table church_auth.coworker_identity_merge_audit (
  email_user_id uuid primary key references auth.users(id) on delete restrict,
  line_user_id uuid not null unique references auth.users(id) on delete restrict,
  retained_staff_id uuid,
  retired_staff_id uuid,
  before_snapshot jsonb not null,
  merged_at timestamptz not null default now(),
  constraint coworker_identity_merge_distinct_users check (email_user_id<>line_user_id)
);
alter table church_auth.coworker_identity_merge_audit enable row level security;
revoke all on church_auth.coworker_identity_merge_audit from public,anon,authenticated;

-- A linked Auth identity is an administrator only while it has its own account row.
-- Retired email logins must not read the LINE account's notifications or settings.
create or replace function church_auth.account_users(p_user uuid)
returns setof uuid language sql stable set search_path='' as $$
  with root as (
    select church_auth.canonical_account(p_user) as user_id
    where exists (select 1 from church_auth.accounts caller where caller.user_id=p_user)
  ), linked as (
    select root.user_id from root
    union
    select l.alias_user_id
    from root join church_auth.account_identity_links l on l.canonical_user_id=root.user_id
  )
  select a.user_id from linked join church_auth.accounts a on a.user_id=linked.user_id
$$;
revoke all on function church_auth.account_users(uuid) from public,anon,authenticated;

-- Require the presented login and its canonical account to be active M+ staff.
-- During the identity merge, existing roles on a verified linked login remain valid.
create or replace function public.finance_user_can(p_user uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from church_auth.accounts presented
    join church_auth.grants presented_grant
      on presented_grant.user_id=presented.user_id and presented_grant.church_id='M+'
    join church_auth.accounts root
      on root.user_id=church_auth.canonical_account(presented.user_id) and root.is_active
    join church_auth.grants root_grant
      on root_grant.user_id=root.user_id and root_grant.church_id='M+'
    join public.finance_staff_roles role on role.role_key=p_role
    join church_auth.accounts role_account
      on role_account.user_id=role.user_id and role_account.is_active
    join church_auth.grants role_grant
      on role_grant.user_id=role.user_id and role_grant.church_id='M+'
    where presented.user_id=p_user and presented.is_active
      and role.user_id in (select church_auth.account_users(p_user))
  );
$$;
revoke all on function public.finance_user_can(uuid,text) from public,anon,authenticated;
grant execute on function public.finance_user_can(uuid,text) to service_role;

-- An owner edits the person, not whichever login happened to be selected.
-- Remove any stale linked role before assigning it to the canonical identity.
create or replace function public.finance_assign_role(p_actor uuid,p_target uuid,p_role text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_root uuid;
begin
  if not exists (
    select 1 from church_auth.owners o
    join church_auth.accounts actor_account on actor_account.user_id=o.user_id and actor_account.is_active
    where o.user_id=p_actor
  ) then raise exception 'forbidden'; end if;
  if p_role not in ('entry','cash_verify','approve') or p_enabled is null then raise exception 'invalid_role'; end if;
  if not exists (
    select 1 from church_auth.accounts a
    join church_auth.grants g on g.user_id=a.user_id and g.church_id='M+'
    where a.user_id=p_target and a.is_active
  ) then raise exception 'target_not_mplus_admin'; end if;
  v_root := church_auth.canonical_account(p_target);
  if not exists (
    select 1 from church_auth.accounts a
    join church_auth.grants g on g.user_id=a.user_id and g.church_id='M+'
    where a.user_id=v_root and a.is_active
  ) then raise exception 'target_not_mplus_admin'; end if;
  if p_enabled then
    delete from public.finance_staff_roles r
    where r.role_key=p_role and r.user_id<>v_root
      and church_auth.canonical_account(r.user_id)=v_root;
    insert into public.finance_staff_roles(user_id,role_key,assigned_by)
    values(v_root,p_role,p_actor)
    on conflict(user_id,role_key) do nothing;
  else
    delete from public.finance_staff_roles r
    where r.role_key=p_role and church_auth.canonical_account(r.user_id)=v_root;
  end if;
  return true;
end $$;
revoke all on function public.finance_assign_role(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.finance_assign_role(uuid,uuid,text,boolean) to service_role;

create or replace function public.finance_save_cash_batch(
  p_actor uuid,p_batch_id uuid,p_expected_version integer,p_data jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_batch public.finance_cash_batches%rowtype;
  v_id uuid;
  v_date date;
  v_counter_1 uuid;
  v_counter_2 uuid;
  v_counted bigint;
  v_total bigint := 0;
  v_bag_total bigint;
  v_declared bigint;
  v_bag jsonb;
  v_line jsonb;
  v_bag_id uuid;
  v_bag_no integer := 0;
  v_member_id bigint;
  v_code text;
  v_expected_code text;
  v_name text;
  v_category text;
  v_designation text;
  v_amount bigint;
  v_new_version integer;
  v_action text;
begin
  if not public.finance_user_can(p_actor,'entry') then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_data)<>'object' or jsonb_typeof(p_data->'bags')<>'array'
     or jsonb_array_length(p_data->'bags') not between 1 and 500
     or jsonb_typeof(p_data->'counterUserIds')<>'array'
     or jsonb_array_length(p_data->'counterUserIds')<>2 then raise exception 'invalid_batch'; end if;
  v_date := (p_data->>'offeringDate')::date;
  v_counter_1 := (p_data->'counterUserIds'->>0)::uuid;
  v_counter_2 := (p_data->'counterUserIds'->>1)::uuid;
  v_counted := (p_data->>'countedCash')::bigint;
  -- Check the submitted login IDs first: a retired alias must never inherit access.
  if v_counted is null or v_counted<=0
     or not public.finance_user_can(v_counter_1,'entry')
     or not public.finance_user_can(v_counter_2,'entry') then raise exception 'invalid_counters'; end if;
  -- Store one identity per person and enforce two distinct human counters.
  v_counter_1 := church_auth.canonical_account(v_counter_1);
  v_counter_2 := church_auth.canonical_account(v_counter_2);
  if v_counter_1=v_counter_2 then raise exception 'invalid_counters'; end if;
  if p_batch_id is null then
    if p_expected_version is not null then raise exception 'version_conflict'; end if;
    insert into public.finance_cash_batches(offering_date,counter_1,counter_2,counted_cash,entered_total,created_by,updated_by)
    values(v_date,v_counter_1,v_counter_2,v_counted,1,p_actor,p_actor)
    returning id into v_id;
    v_new_version := 1;
    v_action := 'created';
  else
    select * into v_batch from public.finance_cash_batches where id=p_batch_id and church_id='M+' for update;
    if not found then raise exception 'batch_not_found'; end if;
    if v_batch.status not in ('draft','returned') then raise exception 'batch_locked'; end if;
    if p_expected_version is distinct from v_batch.version then raise exception 'version_conflict'; end if;
    v_id := p_batch_id;
    v_new_version := v_batch.version+1;
    v_action := 'saved';
    delete from public.finance_cash_bags where batch_id=v_id;
  end if;
  for v_bag in select value from jsonb_array_elements(p_data->'bags') loop
    v_bag_no := v_bag_no+1;
    if jsonb_typeof(v_bag)<>'object' or jsonb_typeof(v_bag->'lines')<>'array'
       or jsonb_array_length(v_bag->'lines') not between 1 and 20 then raise exception 'invalid_bag'; end if;
    v_name := btrim(coalesce(v_bag->>'bagName',''));
    if length(v_name) not between 1 and 80 then raise exception 'invalid_bag_name'; end if;
    v_member_id := nullif(v_bag->>'memberId','')::bigint;
    v_code := nullif(v_bag->>'offeringCode','');
    if v_member_id is not null then
      select p.offering_code into v_expected_code
      from public.finance_member_codes p join public.members m on m.id=p.member_id
      where p.member_id=v_member_id and m.church_id='M+' and m.archived_at is null;
      if v_expected_code is null or v_code is distinct from v_expected_code then raise exception 'member_code_mismatch'; end if;
    elsif v_code is not null then
      raise exception 'unlinked_offering_code';
    end if;
    v_bag_total := 0;
    v_declared := (v_bag->>'declaredTotal')::bigint;
    if v_declared<=0 then raise exception 'invalid_bag_total'; end if;
    insert into public.finance_cash_bags(
      batch_id,bag_no,bag_name,member_id,offering_code,bag_phone,bag_address,
      anonymous,public_choice,hide_from_bulletin,receipt_preference,declared_total
    ) values (
      v_id,v_bag_no,v_name,v_member_id,v_code,
      nullif(btrim(coalesce(v_bag->>'bagPhone','')),''),nullif(btrim(coalesce(v_bag->>'bagAddress','')),''),
      coalesce((v_bag->>'anonymous')::boolean,false),
      coalesce(nullif(v_bag->>'publicChoice',''),'public'),
      coalesce((v_bag->>'hideFromBulletin')::boolean,false),
      coalesce(nullif(v_bag->>'receiptPreference',''),'annual'),v_declared
    ) returning id into v_bag_id;
    for v_line in select value from jsonb_array_elements(v_bag->'lines') loop
      v_category := v_line->>'category';
      v_designation := nullif(btrim(coalesce(v_line->>'designation','')),'');
      v_amount := (v_line->>'amount')::bigint;
      if v_category not in ('十一奉獻','感恩奉獻','宣教奉獻','建堂奉獻','慈惠奉獻','指定奉獻','一般／不具名奉獻')
         or v_amount<=0 or (v_category='指定奉獻' and v_designation is null)
         or (v_category='一般／不具名奉獻' and coalesce((v_bag->>'anonymous')::boolean,false)=false)
         then raise exception 'invalid_line'; end if;
      insert into public.finance_cash_lines(bag_id,category,designation,amount)
      values(v_bag_id,v_category,v_designation,v_amount);
      v_bag_total := v_bag_total+v_amount;
    end loop;
    if v_bag_total<>v_declared then raise exception 'bag_total_mismatch'; end if;
    v_total := v_total+v_bag_total;
  end loop;
  update public.finance_cash_batches set
    offering_date=v_date,counter_1=v_counter_1,counter_2=v_counter_2,
    counted_cash=v_counted,entered_total=v_total,version=v_new_version,
    spouse_verified_cash=null,spouse_verified_by=null,pastor_approved_by=null,
    updated_by=p_actor,updated_at=now()
  where id=v_id;
  insert into public.finance_cash_events(batch_id,version,action,from_status,to_status,actor_user_id,snapshot)
  values(v_id,v_new_version,v_action,case when v_action='created' then null else v_batch.status end,
         case when v_action='created' then 'draft' else v_batch.status end,p_actor,p_data);
  return jsonb_build_object('id',v_id,'version',v_new_version,'status',case when v_action='created' then 'draft' else v_batch.status end,'enteredTotal',v_total);
end $$;
revoke all on function public.finance_save_cash_batch(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.finance_save_cash_batch(uuid,uuid,integer,jsonb) to service_role;

notify pgrst,'reload schema';

commit;
