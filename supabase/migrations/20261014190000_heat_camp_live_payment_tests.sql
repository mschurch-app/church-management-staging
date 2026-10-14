-- Password-protected live MPG tests are separate from camp registrations and receipts.
create table camp_registration.payment_test_access (
  id integer primary key check (id = 1),
  password_hash text not null check (length(password_hash) = 64),
  updated_at timestamptz not null default now()
);

create table camp_registration.payment_test_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  merchant_order_no text not null unique check (merchant_order_no ~ '^HB27T[0-9A-Z]{10,22}$'),
  email text not null,
  payment_method text not null check (payment_method in ('card','webatm','atm','cvs','barcode')),
  amount integer not null check (amount between 10 and 1000),
  status text not null default 'created' check (status in ('created','account_issued','paid','failed')),
  trade_no text,
  provider_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  check ((payment_method not in ('cvs','barcode')) or (payment_method='cvs' and amount >= 30) or (payment_method='barcode' and amount >= 20))
);

alter table camp_registration.payment_test_access enable row level security;
alter table camp_registration.payment_test_orders enable row level security;
revoke all on camp_registration.payment_test_access, camp_registration.payment_test_orders from public, anon, authenticated;
grant select on camp_registration.payment_test_access to service_role;
grant select, insert, update on camp_registration.payment_test_orders to service_role;

create function public.heat_camp_2027_payment_test_login(p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
begin
  if not exists (select 1 from camp_registration.payment_test_access
    where id=1 and password_hash=encode(extensions.digest(coalesce(p_password,''),'sha256'),'hex'))
  then raise exception 'payment_test_password_invalid'; end if;
  return jsonb_build_object('authenticated',true,'methods',jsonb_build_object(
    'card',10,'webatm',10,'atm',10,'barcode',20,'cvs',30));
end $function$;

create function public.heat_camp_2027_create_payment_test_order(
  p_request_id uuid, p_password text, p_email text, p_payment_method text, p_amount integer, p_merchant_order_no text
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare o camp_registration.payment_test_orders%rowtype;
        minimum integer;
begin
  if not exists (select 1 from camp_registration.payment_test_access
    where id=1 and password_hash=encode(extensions.digest(coalesce(p_password,''),'sha256'),'hex'))
  then raise exception 'payment_test_password_invalid'; end if;
  minimum:=case p_payment_method when 'card' then 10 when 'webatm' then 10 when 'atm' then 10
    when 'barcode' then 20 when 'cvs' then 30 end;
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

create function public.heat_camp_2027_payment_test_orders(p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare rows jsonb;
begin
  if not exists (select 1 from camp_registration.payment_test_access
    where id=1 and password_hash=encode(extensions.digest(coalesce(p_password,''),'sha256'),'hex'))
  then raise exception 'payment_test_password_invalid'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('request_id',request_id,'merchant_order_no',merchant_order_no,
    'payment_method',payment_method,'amount',amount,'status',status,'created_at',created_at,'paid_at',paid_at)
    order by created_at desc),'[]'::jsonb) into rows
  from (select * from camp_registration.payment_test_orders order by created_at desc limit 50) recent;
  return rows;
end $function$;

create function public.heat_camp_2027_record_payment_test(
  p_merchant_order_no text, p_trade_no text, p_paid boolean, p_result jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare o camp_registration.payment_test_orders%rowtype;
        gateway_success boolean;
        payment_code text;
begin
  select * into o from camp_registration.payment_test_orders where merchant_order_no=p_merchant_order_no for update;
  if not found then raise exception 'payment_test_order_not_found'; end if;
  if p_result->>'_environment'<>'production' then raise exception 'payment_environment_mismatch'; end if;
  if nullif(p_result->>'Amt','') is null or (p_result->>'Amt')::integer<>o.amount then raise exception 'amount_mismatch'; end if;
  if o.status='paid' then return jsonb_build_object('status','paid'); end if;
  gateway_success=coalesce(p_result->>'Status','')='SUCCESS';
  payment_code=coalesce(nullif(p_result->>'CodeNo',''),nullif(p_result->>'VaccNo',''),
    nullif(p_result->>'Barcode_1',''));
  update camp_registration.payment_test_orders
  set status=case when p_paid then 'paid' when gateway_success and payment_code is not null then 'account_issued'
                  when gateway_success then status else 'failed' end,
      trade_no=coalesce(nullif(p_trade_no,''),trade_no),provider_result=p_result,
      paid_at=case when p_paid then now() else paid_at end,updated_at=now()
  where id=o.id;
  return jsonb_build_object('status',case when p_paid then 'paid' when gateway_success then 'account_issued' else 'failed' end);
end $function$;

revoke all on function public.heat_camp_2027_payment_test_login(text),
  public.heat_camp_2027_create_payment_test_order(uuid,text,text,text,integer,text),
  public.heat_camp_2027_payment_test_orders(text),
  public.heat_camp_2027_record_payment_test(text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_payment_test_login(text),
  public.heat_camp_2027_create_payment_test_order(uuid,text,text,text,integer,text),
  public.heat_camp_2027_payment_test_orders(text),
  public.heat_camp_2027_record_payment_test(text,text,boolean,jsonb) to service_role;
