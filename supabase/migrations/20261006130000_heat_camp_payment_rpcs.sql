create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists(select 1 from vault.secrets where name='heat-camp-data-encryption-key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'heat-camp-data-encryption-key','2027 camp PII encryption key');
  end if;
end $$;

create or replace function public.heat_camp_2027_create_registration(p_request_id uuid,p_payload jsonb,p_merchant_order_no text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  event_row camp_registration.events%rowtype;
  rule_row camp_registration.price_rules%rowtype;
  existing camp_registration.registrations%rowtype;
  registration_id uuid;
  registration_no text;
  status_value text;
  encryption_key text;
  jersey_no integer;
begin
  if p_request_id is null or jsonb_typeof(p_payload)<>'object' or p_merchant_order_no !~ '^HB27[0-9A-Z]{10,22}$' then raise exception 'invalid_request'; end if;
  select * into existing from camp_registration.registrations where request_id=p_request_id;
  if found then
    return jsonb_build_object('id',existing.id,'registration_no',existing.registration_no,'status',existing.status,'amount',existing.amount,
      'merchant_order_no',(select merchant_order_no from camp_registration.payment_orders where registration_id=existing.id order by created_at desc limit 1));
  end if;
  select * into event_row from camp_registration.events where slug='heat-basketball-camp-2027' and active for update;
  if not found or now()<event_row.registration_opens_at or now()>event_row.registration_closes_at then raise exception 'registration_closed'; end if;
  if coalesce(p_payload->>'pricing_mode','standard')<>'standard' then raise exception 'pricing_mode_not_ready'; end if;
  select * into rule_row from camp_registration.price_rules where event_id=event_row.id and rule_type='date_range' and active
    and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) order by priority,id limit 1;
  if not found then raise exception 'price_unavailable'; end if;
  if length(trim(p_payload->>'player_name')) not between 1 and 80 or length(trim(p_payload->>'guardian_name')) not between 1 and 80 then raise exception 'invalid_name'; end if;
  if coalesce(p_payload->>'national_id','') !~ '^[A-Z][12][0-9]{8}$' then raise exception 'invalid_national_id'; end if;
  if coalesce(p_payload->>'guardian_phone','') !~ '^[0-9+() -]{8,20}$' then raise exception 'invalid_phone'; end if;
  if coalesce(p_payload->>'email','') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  jersey_no:=nullif(p_payload->>'jersey_number','')::integer;
  if now()<=event_row.jersey_choice_ends_at and (jersey_no is null or jersey_no not between 0 and 99) then raise exception 'invalid_jersey'; end if;
  if (select count(*) from camp_registration.registrations where event_id=event_row.id and status='paid')>=event_row.capacity then raise exception 'camp_full'; end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name='heat-camp-data-encryption-key';
  if encryption_key is null then raise exception 'encryption_unavailable'; end if;
  registration_id:=gen_random_uuid();
  registration_no:='HC27-'||upper(substr(replace(registration_id::text,'-',''),1,10));
  status_value:=case when p_payload->>'school_stage'='elementary_6_or_below' then 'exception_review' else 'awaiting_payment' end;
  insert into camp_registration.registrations(
    id,request_id,event_id,registration_no,status,player_name,guardian_name,guardian_phone,email,line_id,
    national_id_ciphertext,national_id_last4,postal_code,receipt_address,birthday,school_stage,school_name,height_cm,weight_kg,
    basketball_profile,medical_ciphertext,care_notes_ciphertext,special_identity,eligibility_exception,exception_reason,
    jersey_size,jersey_number,jersey_name,price_rule_id,amount,insurance_consent_at,privacy_consent_at,receipt_transfer_consent_at
  ) values (
    registration_id,p_request_id,event_row.id,registration_no,status_value,trim(p_payload->>'player_name'),trim(p_payload->>'guardian_name'),trim(p_payload->>'guardian_phone'),lower(trim(p_payload->>'email')),trim(p_payload->>'line_id'),
    encode(extensions.pgp_sym_encrypt(p_payload->>'national_id',encryption_key,'cipher-algo=aes256'),'base64'),right(p_payload->>'national_id',4),trim(p_payload->>'postal_code'),trim(p_payload->>'receipt_address'),(p_payload->>'birthday')::date,p_payload->>'school_stage',trim(p_payload->>'school_name'),(p_payload->>'height_cm')::numeric,(p_payload->>'weight_kg')::numeric,
    jsonb_build_object('years',p_payload->>'basketball_years','position',p_payload->>'primary_position','hand',p_payload->>'dominant_hand','team',p_payload->>'current_team','competition',p_payload->>'competition_level','goals',coalesce(p_payload->'training_goals','[]'::jsonb)),
    encode(extensions.pgp_sym_encrypt(jsonb_build_object('medical_notes',p_payload->>'medical_notes','emergency_name',p_payload->>'emergency_name','emergency_phone',p_payload->>'emergency_phone','dietary_need',p_payload->>'dietary_need')::text,encryption_key,'cipher-algo=aes256'),'base64'),
    case when coalesce(p_payload->>'care_notes','')='' then null else encode(extensions.pgp_sym_encrypt(p_payload->>'care_notes',encryption_key,'cipher-algo=aes256'),'base64') end,
    coalesce(p_payload->>'special_identity','none'),coalesce((p_payload->>'eligibility_exception')::boolean,false),coalesce(p_payload->>'exception_reason',''),
    case when now()<=event_row.jersey_choice_ends_at then p_payload->>'jersey_size' end,case when now()<=event_row.jersey_choice_ends_at then jersey_no end,case when now()<=event_row.jersey_choice_ends_at then p_payload->>'jersey_name' end,
    rule_row.id,rule_row.amount,now(),now(),now()
  );
  insert into camp_registration.receipt_profiles(registration_id,receipt_type,delivery_method,donor_name,receipt_title,receipt_id_ciphertext,receipt_id_last4,tax_upload_consent,public_credit)
  values(registration_id,'single','mail',trim(p_payload->>'donor_name'),trim(p_payload->>'receipt_title'),
    case when coalesce(p_payload->>'receipt_id','')='' then null else encode(extensions.pgp_sym_encrypt(p_payload->>'receipt_id',encryption_key,'cipher-algo=aes256'),'base64') end,
    case when coalesce(p_payload->>'receipt_id','')='' then null else right(p_payload->>'receipt_id',4) end,
    coalesce((p_payload->>'tax_upload_consent')::boolean,false),coalesce((p_payload->>'public_credit')::boolean,false));
  if status_value='awaiting_payment' then
    insert into camp_registration.payment_orders(registration_id,merchant_order_no,amount) values(registration_id,p_merchant_order_no,rule_row.amount);
  end if;
  insert into camp_registration.audit_log(registration_id,actor_type,action,details) values(registration_id,'public','registration_created',jsonb_build_object('status',status_value,'amount',rule_row.amount));
  return jsonb_build_object('id',registration_id,'registration_no',registration_no,'status',status_value,'amount',rule_row.amount,'merchant_order_no',case when status_value='awaiting_payment' then p_merchant_order_no end,'email',lower(trim(p_payload->>'email')),'player_name',trim(p_payload->>'player_name'));
exception when unique_violation then raise exception 'jersey_or_order_unavailable';
end $$;

create or replace function public.heat_camp_2027_record_payment(p_merchant_order_no text,p_trade_no text,p_paid boolean,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare order_row camp_registration.payment_orders%rowtype; registration_row camp_registration.registrations%rowtype;
begin
 select * into order_row from camp_registration.payment_orders where merchant_order_no=p_merchant_order_no for update;
 if not found then raise exception 'order_not_found'; end if;
 select * into registration_row from camp_registration.registrations where id=order_row.registration_id for update;
 if (p_result->>'Amt')::integer<>order_row.amount then raise exception 'amount_mismatch'; end if;
 if p_paid then
  update camp_registration.payment_orders set status='paid',trade_no=coalesce(nullif(p_trade_no,''),trade_no),paid_at=coalesce(paid_at,now()),provider_result=p_result,updated_at=now() where id=order_row.id;
  update camp_registration.registrations set status='paid',paid_at=coalesce(paid_at,now()),updated_at=now() where id=registration_row.id and status<>'paid';
  insert into camp_registration.eoffering_sync(registration_id,idempotency_key) values(registration_row.id,'heat-camp-paid:'||order_row.id) on conflict do nothing;
 else
  update camp_registration.payment_orders set status=case when p_result ? 'CodeNo' then 'account_issued' else status end,trade_no=coalesce(nullif(p_trade_no,''),trade_no),bank_code=coalesce(p_result->>'BankCode',bank_code),virtual_account_masked=case when p_result ? 'CodeNo' then '***'||right(p_result->>'CodeNo',5) else virtual_account_masked end,provider_result=p_result,issued_at=case when p_result ? 'CodeNo' then coalesce(issued_at,now()) else issued_at end,updated_at=now() where id=order_row.id;
 end if;
 insert into camp_registration.audit_log(registration_id,actor_type,action,details) values(registration_row.id,'newebpay',case when p_paid then 'payment_confirmed' else 'payment_response' end,jsonb_build_object('trade_no',p_trade_no));
 return jsonb_build_object('registration_no',registration_row.registration_no,'status',case when p_paid then 'paid' else 'awaiting_payment' end);
end $$;

revoke all on function public.heat_camp_2027_create_registration(uuid,jsonb,text),public.heat_camp_2027_record_payment(text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_create_registration(uuid,jsonb,text),public.heat_camp_2027_record_payment(text,text,boolean,jsonb) to service_role;
