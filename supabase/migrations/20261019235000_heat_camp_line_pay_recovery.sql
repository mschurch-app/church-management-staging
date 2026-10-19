-- Expose the current order only to the service-role retry handler so it can
-- reconcile an authorized LINE Pay payment if the browser return was lost.
create or replace function public.heat_camp_2027_retry_context(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r camp_registration.registrations%rowtype;
  o camp_registration.payment_orders%rowtype;
begin
  if p_request_id is null then return null; end if;
  select * into r from camp_registration.registrations where request_id=p_request_id limit 1;
  if not found then return null; end if;
  select * into o from camp_registration.payment_orders
    where registration_id=r.id
    order by (status in ('created','account_issued','paid')) desc,created_at desc,id desc limit 1;
  return jsonb_build_object('registration_no',r.registration_no,'status',r.status,'amount',r.amount,
    'payment_environment',r.payment_environment,'order_status',o.status,
    'payment_provider',o.provider,'merchant_order_no',o.merchant_order_no,'transaction_id',o.trade_no,
    'player_name',r.player_name,'guardian_name',r.guardian_name,'email',r.email,
    'birthday',r.birthday,'jersey_number',r.jersey_number);
end;
$$;
revoke all on function public.heat_camp_2027_retry_context(uuid) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_retry_context(uuid) to service_role;
