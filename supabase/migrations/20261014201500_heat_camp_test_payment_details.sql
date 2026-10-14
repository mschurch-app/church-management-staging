-- Show only the payment instructions needed by the password-protected test dashboard.
create or replace function public.heat_camp_2027_payment_test_orders(p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare rows jsonb;
begin
  if not exists (select 1 from camp_registration.payment_test_access
    where id=1 and password_hash=encode(extensions.digest(coalesce(p_password,''),'sha256'),'hex'))
  then raise exception 'payment_test_password_invalid'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'merchant_order_no',merchant_order_no,
    'payment_method',payment_method,'amount',amount,'status',status,'created_at',created_at,'paid_at',paid_at,
    'payment_details',case when status='account_issued' then jsonb_strip_nulls(jsonb_build_object(
      'bank_code',provider_result->>'BankCode',
      'account_no',coalesce(provider_result->>'CodeNo',provider_result->>'VaccNo'),
      'expire_date',provider_result->>'ExpireDate',
      'barcode_1',provider_result->>'Barcode_1',
      'barcode_2',provider_result->>'Barcode_2',
      'barcode_3',provider_result->>'Barcode_3')) else null end)
    order by created_at desc),'[]'::jsonb) into rows
  from (select * from camp_registration.payment_test_orders order by created_at desc limit 50) recent;
  return rows;
end $function$;
