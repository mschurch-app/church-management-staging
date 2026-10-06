create or replace function public.heat_camp_2027_set_no_receipt(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update camp_registration.receipt_profiles
  set receipt_type='none',
      delivery_method=null,
      donor_name=null,
      receipt_title=null,
      receipt_id_ciphertext=null,
      receipt_id_last4=null,
      tax_upload_consent=false,
      public_credit=false
  where registration_id=p_registration_id;

  update camp_registration.registrations
  set receipt_address='',receipt_transfer_consent_at=null,updated_at=now()
  where id=p_registration_id;

  insert into camp_registration.audit_log(registration_id,actor_type,action,details)
  values(p_registration_id,'public','receipt_declined','{}'::jsonb);
end
$$;

revoke all on function public.heat_camp_2027_set_no_receipt(uuid) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_set_no_receipt(uuid) to service_role;
