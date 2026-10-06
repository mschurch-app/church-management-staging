create or replace function public.heat_camp_2027_record_payment(
  p_merchant_order_no text,
  p_trade_no text,
  p_paid boolean,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  order_row camp_registration.payment_orders%rowtype;
  registration_row camp_registration.registrations%rowtype;
  payment_code text;
  gateway_success boolean;
begin
  select * into order_row
  from camp_registration.payment_orders
  where merchant_order_no=p_merchant_order_no
  for update;
  if not found then raise exception 'order_not_found'; end if;

  select * into registration_row
  from camp_registration.registrations
  where id=order_row.registration_id
  for update;

  if (p_result->>'Amt')::integer<>order_row.amount then
    raise exception 'amount_mismatch';
  end if;

  gateway_success=coalesce(p_result->>'Status','')='SUCCESS';
  payment_code=coalesce(
    nullif(p_result->>'CodeNo',''),
    nullif(p_result->>'Barcode_3',''),
    nullif(p_result->>'Barcode_2',''),
    nullif(p_result->>'Barcode_1','')
  );

  if p_paid then
    update camp_registration.payment_orders
    set status='paid',
        trade_no=coalesce(nullif(p_trade_no,''),trade_no),
        paid_at=coalesce(paid_at,now()),
        provider_result=p_result,
        updated_at=now()
    where id=order_row.id;

    update camp_registration.registrations
    set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now()
    where id=registration_row.id and status<>'paid';

    insert into camp_registration.eoffering_sync(registration_id,idempotency_key)
    values(registration_row.id,'heat-camp-paid:'||order_row.id)
    on conflict do nothing;
  else
    update camp_registration.payment_orders
    set status=case
          when gateway_success and payment_code is not null then 'account_issued'
          when not gateway_success then 'failed'
          else status
        end,
        trade_no=coalesce(nullif(p_trade_no,''),trade_no),
        bank_code=coalesce(p_result->>'BankCode',bank_code),
        virtual_account_masked=case when payment_code is not null then '***'||right(payment_code,5) else virtual_account_masked end,
        provider_result=p_result,
        issued_at=case when gateway_success and payment_code is not null then coalesce(issued_at,now()) else issued_at end,
        updated_at=now()
    where id=order_row.id;
  end if;

  insert into camp_registration.audit_log(registration_id,actor_type,action,details)
  values(registration_row.id,'newebpay',case when p_paid then 'payment_confirmed' when gateway_success then 'payment_response' else 'payment_failed' end,jsonb_build_object('trade_no',p_trade_no,'status',p_result->>'Status','message',p_result->>'Message'));

  return jsonb_build_object('registration_no',registration_row.registration_no,'status',case when p_paid then 'paid' else 'awaiting_payment' end);
end
$$;

revoke all on function public.heat_camp_2027_record_payment(text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_record_payment(text,text,boolean,jsonb) to service_role;
