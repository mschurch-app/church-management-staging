begin;
alter table public.finance_cash_lines drop constraint finance_cash_lines_category_check;
alter table public.finance_cash_lines add constraint finance_cash_lines_category_check check(category in ('十一奉獻','感恩奉獻','宣教奉獻','建堂奉獻','慈惠奉獻','兒童主日學奉獻','指定奉獻','一般／不具名奉獻'));
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
  v_cash bigint := 0;
  v_method text;
  v_reported_code text;
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
  v_previous_bags jsonb := '{}'::jsonb;
  v_old_bag jsonb;
  v_snapshot jsonb;
  v_source_id text;
  v_seen_ids text[] := '{}';
  v_confirmed_by uuid;
  v_confirmed_at timestamptz;
  v_actor uuid;
  v_confirm_self boolean;
begin
  if not public.finance_user_can(p_actor,'entry') then raise exception 'forbidden'; end if;
  v_actor:=church_auth.canonical_account(p_actor);
  if p_data ? 'counterConfirmed' and jsonb_typeof(p_data->'counterConfirmed')<>'boolean' then raise exception 'invalid_confirmation'; end if;
  v_confirm_self:=coalesce((p_data->>'counterConfirmed')::boolean,false);
  if jsonb_typeof(p_data)<>'object' or jsonb_typeof(p_data->'bags')<>'array'
     or jsonb_array_length(p_data->'bags') not between 1 and 500
     or jsonb_typeof(p_data->'counterUserIds')<>'array'
     or jsonb_array_length(p_data->'counterUserIds')<>2 then raise exception 'invalid_batch'; end if;
  v_date := (p_data->>'offeringDate')::date;
  v_counter_1 := (p_data->'counterUserIds'->>0)::uuid;
  v_counter_2 := (p_data->'counterUserIds'->>1)::uuid;
  v_counted := 1; -- Insert placeholder; the persisted total is computed from validated lines below.
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
    if exists(select 1 from public.finance_cash_bags where batch_id=p_batch_id and payment_method<>'cash') and exists(select 1 from jsonb_array_elements(p_data->'bags') item where not(item ? 'paymentMethod')) then raise exception 'client_update_required'; end if;
    if exists(select 1 from public.finance_cash_bags b join public.finance_cash_lines l on l.bag_id=b.id where b.batch_id=p_batch_id and l.category='兒童主日學奉獻') and coalesce((p_data->>'supportsChildrenOffering')::boolean,false) is not true then raise exception 'client_update_required'; end if;
    v_id := p_batch_id;
    v_new_version := v_batch.version+1;
    v_action := 'saved';
    select coalesce(jsonb_object_agg(id::text,jsonb_build_object('confirmed_by',confirmed_by,'confirmed_at',confirmed_at,'confirmation_snapshot',confirmation_snapshot)),'{}'::jsonb)
      into v_previous_bags from public.finance_cash_bags where batch_id=v_id;
    delete from public.finance_cash_bags where batch_id=v_id;
  end if;
  for v_bag in select value from jsonb_array_elements(p_data->'bags') loop
    v_bag_no := v_bag_no+1;
    if jsonb_typeof(v_bag)<>'object' or jsonb_typeof(v_bag->'lines')<>'array'
       or jsonb_array_length(v_bag->'lines') not between 1 and 20 then raise exception 'invalid_bag'; end if;
    v_method:=coalesce(v_bag->>'paymentMethod','cash');
    if v_method not in ('cash','transfer','online') then raise exception 'invalid_payment_method'; end if;
    if v_method<>'cash' and coalesce((v_bag->>'anonymous')::boolean,false) then raise exception 'invalid_payment_method'; end if;
    v_reported_code:=nullif(btrim(coalesce(v_bag->>'reportedOfferingCode','')),'');
    if v_reported_code is not null and (v_method='cash' or v_reported_code !~ '^[0-9]{4}$') then raise exception 'invalid_code'; end if;
    v_name := btrim(coalesce(v_bag->>'bagName',''));
    if length(v_name) not between 1 and 80 then raise exception 'invalid_bag_name'; end if;
    v_member_id := nullif(v_bag->>'memberId','')::bigint;
    v_code := nullif(v_bag->>'offeringCode','');
    if v_member_id is not null then
      select p.offering_code into v_expected_code
      from public.members m left join public.finance_member_codes p on p.member_id=m.id
      where m.id=v_member_id and m.church_id='M+' and m.archived_at is null;
      if not found then raise exception 'member_not_found'; end if;
      if (v_method='cash' and v_expected_code is null) or v_code is distinct from v_expected_code then raise exception 'member_code_mismatch'; end if;
    elsif v_code is not null then
      raise exception 'unlinked_offering_code';
    end if;
    v_bag_total := 0;
    v_declared := 1; -- Replaced by the validated category sum; no manual bag total is trusted.
    insert into public.finance_cash_bags(
      batch_id,bag_no,bag_name,member_id,offering_code,payment_method,reported_offering_code,bag_phone,bag_address,
      anonymous,public_choice,hide_from_bulletin,receipt_preference,declared_total
    ) values (
      v_id,v_bag_no,v_name,v_member_id,v_code,v_method,v_reported_code,
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
      if v_category not in ('十一奉獻','感恩奉獻','宣教奉獻','建堂奉獻','慈惠奉獻','兒童主日學奉獻','指定奉獻','一般／不具名奉獻')
         or v_amount<=0 or (v_category='指定奉獻' and v_designation is null)
         or (v_category='一般／不具名奉獻' and coalesce((v_bag->>'anonymous')::boolean,false)=false)
         then raise exception 'invalid_line'; end if;
      insert into public.finance_cash_lines(bag_id,category,designation,amount)
      values(v_bag_id,v_category,v_designation,v_amount);
      v_bag_total := v_bag_total+v_amount;
    end loop;
    if v_bag_total<=0 then raise exception 'invalid_bag_total'; end if;
    if v_bag ? 'confirmed' and jsonb_typeof(v_bag->'confirmed')<>'boolean' then raise exception 'invalid_bag_confirmation'; end if;
    v_source_id := nullif(v_bag->>'id','');
    if v_source_id is not null then
      if v_source_id=any(v_seen_ids) or not (v_previous_bags ? v_source_id) then raise exception 'invalid_bag_confirmation'; end if;
      v_seen_ids := array_append(v_seen_ids,v_source_id);
    end if;
    v_snapshot := (v_bag-'id'-'confirmed'-'confirmedBy'-'confirmedAt'-'declaredTotal')||jsonb_build_object('computedTotal',v_bag_total);
    v_old_bag := v_previous_bags->v_source_id;
    v_confirmed_by := null;v_confirmed_at := null;
    if coalesce((v_bag->>'confirmed')::boolean,false) then
      if v_batch.offering_date=v_date and v_old_bag->'confirmation_snapshot'=v_snapshot and v_old_bag->>'confirmed_by' is not null then
        v_confirmed_by := (v_old_bag->>'confirmed_by')::uuid;
        v_confirmed_at := (v_old_bag->>'confirmed_at')::timestamptz;
      else
        v_confirmed_by := church_auth.canonical_account(p_actor);v_confirmed_at := now();
      end if;
    end if;
    update public.finance_cash_bags set declared_total=v_bag_total,confirmed_by=v_confirmed_by,confirmed_at=v_confirmed_at,
      confirmation_snapshot=case when v_confirmed_by is not null then v_snapshot else null end where id=v_bag_id;
    v_total := v_total+v_bag_total;
    if v_method='cash' then v_cash:=v_cash+v_bag_total; end if;
  end loop;
  if v_confirm_self then
    if v_actor<>v_counter_1 and v_actor<>v_counter_2 then raise exception 'counter_confirmation_forbidden'; end if;
    if exists(select 1 from public.finance_cash_bags where batch_id=v_id and confirmed_at is null) then raise exception 'bag_confirmations_required'; end if;
  end if;
  update public.finance_cash_batches set
    offering_date=v_date,counter_1=v_counter_1,counter_2=v_counter_2,
    counted_cash=v_cash,entered_total=v_total,version=v_new_version,
    counter_1_confirmed_by=case when v_confirm_self and v_actor=v_counter_1 then v_actor else null end,
    counter_1_confirmed_at=case when v_confirm_self and v_actor=v_counter_1 then now() else null end,
    counter_2_confirmed_by=case when v_confirm_self and v_actor=v_counter_2 then v_actor else null end,
    counter_2_confirmed_at=case when v_confirm_self and v_actor=v_counter_2 then now() else null end,
    spouse_verified_cash=null,spouse_verified_by=null,pastor_approved_by=null,
    updated_by=p_actor,updated_at=now()
  where id=v_id;
  insert into public.finance_cash_events(batch_id,version,action,from_status,to_status,actor_user_id,snapshot)
  values(v_id,v_new_version,v_action,case when v_action='created' then null else v_batch.status end,
         case when v_action='created' then 'draft' else v_batch.status end,p_actor,p_data||jsonb_build_object('countedCash',v_cash,'enteredTotal',v_total,'counterConfirmedBy',case when v_confirm_self then v_actor else null end,'bagConfirmations',(select jsonb_agg(jsonb_build_object('bagNo',bag_no,'total',declared_total,'confirmedBy',confirmed_by,'confirmedAt',confirmed_at) order by bag_no) from public.finance_cash_bags where batch_id=v_id)));
  return jsonb_build_object('id',v_id,'version',v_new_version,'status',case when v_action='created' then 'draft' else v_batch.status end,'enteredTotal',v_total);
end $$;
revoke all on function public.finance_save_cash_batch(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.finance_save_cash_batch(uuid,uuid,integer,jsonb) to service_role;


commit;
