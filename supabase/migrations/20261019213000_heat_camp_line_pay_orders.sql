-- LINE Pay orders remain in the same one-live-order constraint as NewebPay.
-- This migration does not enable the payment method on the public form.
alter table camp_registration.payment_orders drop constraint payment_orders_provider_check;
alter table camp_registration.payment_orders add constraint payment_orders_provider_check
  check (provider in ('newebpay','line_pay'));
alter table camp_registration.audit_log drop constraint audit_log_actor_type_check;
alter table camp_registration.audit_log add constraint audit_log_actor_type_check
  check (actor_type in ('public','staff','system','newebpay','line_pay','eoffering'));

-- Only the newly created, still untouched order can change provider. A retry
-- with a different order number must not convert an already-issued NewebPay URL.
create or replace function public.heat_camp_2027_claim_line_pay_order(
  p_request_id uuid, p_environment text, p_merchant_order_no text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r camp_registration.registrations%rowtype;
  o camp_registration.payment_orders%rowtype;
begin
  if p_request_id is null or p_environment not in ('test','production')
    or p_merchant_order_no !~ '^HB27[0-9A-Z]{10,22}$' then raise exception 'invalid_line_pay_request'; end if;
  select * into r from camp_registration.registrations
    where request_id=p_request_id and payment_environment=p_environment for update;
  if not found or r.status<>'awaiting_payment' then raise exception 'line_pay_registration_unavailable'; end if;
  select * into o from camp_registration.payment_orders
    where registration_id=r.id and payment_environment=p_environment
      and status in ('created','account_issued','paid')
    order by created_at desc,id desc limit 1 for update;
  if not found or o.status<>'created' or o.merchant_order_no<>p_merchant_order_no
    or (o.provider='newebpay' and (o.provider_result<>'{}'::jsonb or o.trade_no is not null))
    or o.provider not in ('newebpay','line_pay') then
    raise exception 'line_pay_order_unavailable';
  end if;
  if o.provider='newebpay' then
    update camp_registration.payment_orders set provider='line_pay',updated_at=now()
      where id=o.id;
    insert into camp_registration.audit_log(registration_id,actor_type,action,details)
      values(r.id,'line_pay','provider_selected',
        jsonb_build_object('order',o.merchant_order_no,'environment',p_environment));
  end if;
  return jsonb_build_object('registration_no',r.registration_no,
    'merchant_order_no',o.merchant_order_no,'amount',o.amount,
    'payment_environment',o.payment_environment,'status',o.status,
    'transaction_id',o.trade_no);
end;
$$;
revoke all on function public.heat_camp_2027_claim_line_pay_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_claim_line_pay_order(uuid,text,text) to service_role;

create or replace function public.heat_camp_2027_save_line_pay_request(
  p_merchant_order_no text,p_transaction_id text,p_payment_url text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  o camp_registration.payment_orders%rowtype;
  r camp_registration.registrations%rowtype;
begin
  if p_transaction_id !~ '^[0-9]{16,22}$'
    or p_payment_url !~ '^https://(sandbox-web-pay|web-pay)\.line\.me/' then
    raise exception 'invalid_line_pay_response'; end if;
  select * into o from camp_registration.payment_orders
    where merchant_order_no=p_merchant_order_no for update;
  if not found or o.provider<>'line_pay' or o.status<>'created'
    or (o.payment_environment='test' and p_payment_url !~ '^https://sandbox-web-pay\.line\.me/')
    or (o.payment_environment='production' and p_payment_url !~ '^https://web-pay\.line\.me/')
    then raise exception 'line_pay_order_unavailable'; end if;
  select * into r from camp_registration.registrations where id=o.registration_id for update;
  if r.status<>'awaiting_payment' then raise exception 'line_pay_registration_unavailable'; end if;
  if o.trade_no is not null then
    if o.trade_no<>p_transaction_id then raise exception 'line_pay_transaction_mismatch'; end if;
  else
    update camp_registration.payment_orders
      set trade_no=p_transaction_id,
        provider_result=jsonb_build_object('payment_url',p_payment_url),updated_at=now()
      where id=o.id;
  end if;
  return jsonb_build_object('registration_no',r.registration_no,
    'merchant_order_no',o.merchant_order_no,'amount',o.amount,
    'transaction_id',p_transaction_id,'payment_url',p_payment_url);
end;
$$;
revoke all on function public.heat_camp_2027_save_line_pay_request(text,text,text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_save_line_pay_request(text,text,text) to service_role;

create or replace function public.heat_camp_2027_line_pay_order(p_transaction_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  o camp_registration.payment_orders%rowtype;
  r camp_registration.registrations%rowtype;
begin
  if p_transaction_id !~ '^[0-9]{16,22}$' then return null; end if;
  select * into o from camp_registration.payment_orders
    where trade_no=p_transaction_id and provider='line_pay' for update;
  if not found then return null; end if;
  select * into r from camp_registration.registrations where id=o.registration_id;
  return jsonb_build_object('registration_no',r.registration_no,
    'merchant_order_no',o.merchant_order_no,'amount',o.amount,
    'payment_environment',o.payment_environment,'status',o.status,
    'registration_status',r.status,'payment_url',o.provider_result->>'payment_url');
end;
$$;
revoke all on function public.heat_camp_2027_line_pay_order(text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_line_pay_order(text) to service_role;

create or replace function public.heat_camp_2027_record_line_pay(
  p_transaction_id text,p_info jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  o camp_registration.payment_orders%rowtype;
  r camp_registration.registrations%rowtype;
  received_amount integer;
begin
  if p_transaction_id !~ '^[0-9]{16,22}$' or jsonb_typeof(p_info)<>'object'
    then raise exception 'invalid_line_pay_confirmation'; end if;
  select * into o from camp_registration.payment_orders
    where trade_no=p_transaction_id and provider='line_pay';
  if not found then raise exception 'line_pay_order_not_found'; end if;
  select * into r from camp_registration.registrations where id=o.registration_id for update;
  select * into o from camp_registration.payment_orders where id=o.id for update;
  if p_info->>'orderId' is distinct from o.merchant_order_no
    or p_info->>'transactionId' is distinct from p_transaction_id
    or coalesce(p_info->>'currency','TWD')<>'TWD'
    or jsonb_typeof(p_info->'payInfo')<>'array' then
    raise exception 'line_pay_confirmation_mismatch'; end if;
  select coalesce(sum((part->>'amount')::integer),0) into received_amount
    from jsonb_array_elements(p_info->'payInfo') part;
  if received_amount<>o.amount then raise exception 'line_pay_amount_mismatch'; end if;
  if o.status='paid' then
    return jsonb_build_object('status','paid','registration_no',r.registration_no);
  end if;
  if o.status<>'created' or r.status<>'awaiting_payment' then
    raise exception 'line_pay_order_unavailable'; end if;
  update camp_registration.payment_orders set status='paid',paid_at=now(),
    provider_result=p_info,updated_at=now() where id=o.id;
  update camp_registration.registrations set status='paid',paid_at=now(),
    updated_at=now() where id=r.id;
  if o.payment_environment='production' then
    insert into camp_registration.eoffering_sync(registration_id,idempotency_key)
      values(r.id,'heat-camp-paid:'||o.id) on conflict do nothing;
  end if;
  insert into camp_registration.audit_log(registration_id,actor_type,action,details)
    values(r.id,'line_pay','payment_confirmed',
      jsonb_build_object('transaction_id',p_transaction_id,'amount',received_amount));
  return jsonb_build_object('status','paid','registration_no',r.registration_no);
end;
$$;
revoke all on function public.heat_camp_2027_record_line_pay(text,jsonb) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_record_line_pay(text,jsonb) to service_role;

create or replace function public.heat_camp_2027_close_line_pay(
  p_transaction_id text,p_state text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  o camp_registration.payment_orders%rowtype;
  r camp_registration.registrations%rowtype;
begin
  if p_transaction_id !~ '^[0-9]{16,22}$' or p_state not in ('cancelled','failed')
    then raise exception 'invalid_line_pay_close'; end if;
  select * into o from camp_registration.payment_orders
    where trade_no=p_transaction_id and provider='line_pay';
  if not found then raise exception 'line_pay_order_not_found'; end if;
  select * into r from camp_registration.registrations where id=o.registration_id for update;
  select * into o from camp_registration.payment_orders where id=o.id for update;
  if o.status='paid' or r.status='paid' then
    return jsonb_build_object('status','paid','registration_no',r.registration_no); end if;
  if o.status='created' then
    update camp_registration.payment_orders set status=p_state,updated_at=now() where id=o.id;
    insert into camp_registration.audit_log(registration_id,actor_type,action,details)
      values(r.id,'line_pay','payment_'||p_state,
        jsonb_build_object('transaction_id',p_transaction_id));
  end if;
  return jsonb_build_object('status',p_state,'registration_no',r.registration_no);
end;
$$;
revoke all on function public.heat_camp_2027_close_line_pay(text,text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_close_line_pay(text,text) to service_role;
