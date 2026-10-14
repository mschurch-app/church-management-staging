-- Stop creating WebATM and CVS-code payment tests; preserve historical orders.
create or replace function public.heat_camp_2027_payment_test_login(p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
begin
  if not exists (select 1 from camp_registration.payment_test_access
    where id=1 and password_hash=encode(extensions.digest(coalesce(p_password,''),'sha256'),'hex'))
  then raise exception 'payment_test_password_invalid'; end if;
  return jsonb_build_object('authenticated',true,'methods',jsonb_build_object(
    'card',10,'atm',10,'barcode',20));
end $function$;

create or replace function public.heat_camp_2027_create_payment_test_order(
  p_request_id uuid, p_password text, p_email text, p_payment_method text, p_amount integer, p_merchant_order_no text
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare o camp_registration.payment_test_orders%rowtype;
        minimum integer;
begin
  if not exists (select 1 from camp_registration.payment_test_access
    where id=1 and password_hash=encode(extensions.digest(coalesce(p_password,''),'sha256'),'hex'))
  then raise exception 'payment_test_password_invalid'; end if;
  minimum:=case p_payment_method when 'card' then 10 when 'atm' then 10
    when 'barcode' then 20 end;
  if p_request_id is null or p_merchant_order_no !~ '^HB27T[0-9A-Z]{10,22}$'
    or lower(trim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or minimum is null or p_amount not between minimum and 1000 then raise exception 'invalid_payment_test_request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into o from camp_registration.payment_test_orders where request_id=p_request_id;
  if found then
    if o.email<>lower(trim(p_email)) or o.payment_method<>p_payment_method or o.amount<>p_amount
    then raise exception 'payment_test_request_mismatch'; end if;
    return jsonb_build_object('merchant_order_no',o.merchant_order_no,'amount',o.amount,'email',o.email,'status',o.status);
  end if;
  insert into camp_registration.payment_test_orders(request_id,merchant_order_no,email,payment_method,amount)
  values (p_request_id,p_merchant_order_no,lower(trim(p_email)),p_payment_method,p_amount)
  returning * into o;
  return jsonb_build_object('merchant_order_no',o.merchant_order_no,'amount',o.amount,'email',o.email,'status',o.status);
end $function$;

