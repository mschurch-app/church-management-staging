create or replace function public.heat_camp_2027_prepare_payment(
  p_request_id uuid,
  p_player_name text,
  p_guardian_name text,
  p_email text,
  p_birthday date,
  p_jersey_number integer,
  p_merchant_order_no text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  registration_row camp_registration.registrations%rowtype;
  order_row camp_registration.payment_orders%rowtype;
begin
  if p_request_id is null or p_merchant_order_no !~ '^HB27[0-9A-Z]{10,22}$' then
    raise exception 'invalid_request';
  end if;

  select r.* into registration_row
  from camp_registration.registrations r
  where r.request_id=p_request_id
     or (
       r.status='awaiting_payment'
       and lower(r.email)=lower(trim(p_email))
       and r.player_name=trim(p_player_name)
       and r.guardian_name=trim(p_guardian_name)
       and r.birthday=p_birthday
       and r.jersey_number=p_jersey_number
     )
  order by (r.request_id=p_request_id) desc,r.created_at desc
  limit 1
  for update;

  if not found then raise exception 'retry_registration_not_found'; end if;

  select * into order_row
  from camp_registration.payment_orders
  where registration_id=registration_row.id
  order by created_at desc
  limit 1
  for update;

  if registration_row.status='paid' or order_row.status='paid' then
    return jsonb_build_object('id',registration_row.id,'registration_no',registration_row.registration_no,'status','paid');
  end if;

  if order_row.status in ('failed','expired','cancelled') then
    insert into camp_registration.payment_orders(registration_id,merchant_order_no,amount)
    values(registration_row.id,p_merchant_order_no,registration_row.amount)
    returning * into order_row;

    insert into camp_registration.audit_log(registration_id,actor_type,action,details)
    values(registration_row.id,'public','payment_retry_created',jsonb_build_object('merchant_order_no',p_merchant_order_no));
  end if;

  return jsonb_build_object(
    'id',registration_row.id,
    'registration_no',registration_row.registration_no,
    'status',registration_row.status,
    'amount',registration_row.amount,
    'merchant_order_no',order_row.merchant_order_no,
    'email',registration_row.email,
    'player_name',registration_row.player_name
  );
end
$$;

revoke all on function public.heat_camp_2027_prepare_payment(uuid,text,text,text,date,integer,text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_prepare_payment(uuid,text,text,text,date,integer,text) to service_role;
