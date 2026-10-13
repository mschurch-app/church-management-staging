create or replace function public.heat_camp_2027_retry_context(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  registration_row camp_registration.registrations%rowtype;
  order_row camp_registration.payment_orders%rowtype;
begin
  if p_request_id is null then return null; end if;

  select * into registration_row
  from camp_registration.registrations
  where request_id = p_request_id
  limit 1;
  if not found then return null; end if;

  select * into order_row
  from camp_registration.payment_orders
  where registration_id = registration_row.id
  order by created_at desc, id desc
  limit 1;

  return jsonb_build_object(
    'registration_no', registration_row.registration_no,
    'status', registration_row.status,
    'amount', registration_row.amount,
    'order_status', order_row.status,
    'player_name', registration_row.player_name,
    'guardian_name', registration_row.guardian_name,
    'email', registration_row.email,
    'birthday', registration_row.birthday,
    'jersey_number', registration_row.jersey_number
  );
end
$$;

revoke all on function public.heat_camp_2027_retry_context(uuid) from public, anon, authenticated;
grant execute on function public.heat_camp_2027_retry_context(uuid) to service_role;
