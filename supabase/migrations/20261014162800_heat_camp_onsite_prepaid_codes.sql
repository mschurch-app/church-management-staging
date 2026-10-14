-- Single-use owner-issued codes for onsite payments already received.
alter table camp_registration.promotion_tokens
  add column payment_environment text not null default 'production' check(payment_environment in ('test','production')),
  add column payment_confirmed_at timestamptz,
  add column payment_reference text;
alter table camp_registration.registrations
  add column onsite_token_id uuid references camp_registration.promotion_tokens(id),
  alter column receipt_transfer_consent_at drop not null;
create unique index heat_camp_unique_onsite_token_idx on camp_registration.registrations(onsite_token_id) where onsite_token_id is not null;
CREATE OR REPLACE FUNCTION public.heat_camp_2027_create_registration(p_request_id uuid, p_payload jsonb, p_merchant_order_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_row camp_registration.events%rowtype;
  rule_row camp_registration.price_rules%rowtype;
  existing camp_registration.registrations%rowtype;
  registration_id uuid;
  registration_no text;
  status_value text;
  encryption_key text;
  jersey_no integer;
  environment_value text;
  onsite_token camp_registration.promotion_tokens%rowtype;
  onsite boolean:=coalesce(p_payload->>'pricing_mode','standard')='onsite';
begin
  environment_value:=coalesce(p_payload->>'payment_environment','test');
  if environment_value not in ('test','production') then raise exception 'invalid_environment'; end if;
  if p_request_id is null or jsonb_typeof(p_payload)<>'object' or p_merchant_order_no !~ '^HB27[0-9A-Z]{10,22}$' then raise exception 'invalid_request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into existing from camp_registration.registrations where request_id=p_request_id;
  if found then
    if (existing.onsite_token_id is not null)<>onsite then raise exception 'request_registration_mismatch'; end if;
    if existing.payment_environment<>environment_value then raise exception 'payment_environment_mismatch'; end if;
    if existing.player_name is distinct from trim(p_payload->>'player_name')
      or existing.guardian_name is distinct from trim(p_payload->>'guardian_name')
      or existing.email is distinct from lower(trim(p_payload->>'email'))
      or existing.birthday is distinct from (p_payload->>'birthday')::date
      or existing.national_id_last4 is distinct from right(p_payload->>'national_id',4)
    then raise exception 'request_registration_mismatch'; end if;
    return jsonb_build_object('id',existing.id,'registration_no',existing.registration_no,'status',existing.status,'amount',existing.amount,
      'merchant_order_no',(select po.merchant_order_no from camp_registration.payment_orders po where po.registration_id=existing.id order by (po.status in ('created','account_issued','paid')) desc,po.created_at desc,po.id desc limit 1));
  end if;
  select * into event_row from camp_registration.events where slug='heat-basketball-camp-2027' and active for update;
  if not found or now()<event_row.registration_opens_at or now()>event_row.registration_closes_at then raise exception 'registration_closed'; end if;
  if onsite then
    if upper(trim(coalesce(p_payload->>'onsite_code',''))) !~ '^[A-Z0-9-]{8,20}$' then raise exception 'onsite_verification_failed'; end if;
    select pt.* into onsite_token from camp_registration.promotion_tokens pt
      where pt.event_id=event_row.id and pt.payment_environment=environment_value
        and pt.token_hash=encode(extensions.digest(upper(trim(p_payload->>'onsite_code')),'sha256'),'hex')
        and pt.active and pt.payment_confirmed_at is not null and nullif(trim(pt.payment_reference),'') is not null
        and (pt.expires_at is null or pt.expires_at>now())
      for update;
    if not found then raise exception 'onsite_verification_failed'; end if;
    if onsite_token.used_count>0 or onsite_token.max_uses<>1 then raise exception 'onsite_code_used'; end if;
    select * into rule_row from camp_registration.price_rules where id=onsite_token.price_rule_id
      and event_id=event_row.id and rule_type='verified_onsite' and active;
    if not found then raise exception 'onsite_verification_failed'; end if;
  else
    if coalesce(p_payload->>'pricing_mode','standard')<>'standard' then raise exception 'pricing_mode_not_ready'; end if;
    select * into rule_row from camp_registration.price_rules where event_id=event_row.id and rule_type='date_range' and active
      and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) order by priority,id limit 1;
    if not found then raise exception 'price_unavailable'; end if;
  end if;
  if length(trim(p_payload->>'player_name')) not between 1 and 80 or length(trim(p_payload->>'guardian_name')) not between 1 and 80 then raise exception 'invalid_name'; end if;
  if coalesce(p_payload->>'national_id','') !~ '^[A-Z][12][0-9]{8}$' then raise exception 'invalid_national_id'; end if;
  if coalesce(p_payload->>'guardian_phone','') !~ '^[0-9+() -]{8,20}$' then raise exception 'invalid_phone'; end if;
  if coalesce(p_payload->>'email','') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  jersey_no:=nullif(p_payload->>'jersey_number','')::integer;
  if now()<=event_row.jersey_choice_ends_at and (jersey_no is null or jersey_no not between 0 and 99) then raise exception 'invalid_jersey'; end if;
  if (select count(*) from camp_registration.registrations where event_id=event_row.id and payment_environment=environment_value and status='paid')>=event_row.capacity then raise exception 'camp_full'; end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name='heat-camp-data-encryption-key';
  if encryption_key is null then raise exception 'encryption_unavailable'; end if;
  registration_id:=gen_random_uuid();
  registration_no:='HC27-'||upper(substr(replace(registration_id::text,'-',''),1,10));
  status_value:=case when onsite then 'paid' when p_payload->>'school_stage'='elementary_6_or_below' then 'exception_review' else 'awaiting_payment' end;
  insert into camp_registration.registrations(
    id,request_id,event_id,payment_environment,registration_no,status,player_name,guardian_name,guardian_phone,email,line_id,
    national_id_ciphertext,national_id_last4,postal_code,receipt_address,birthday,school_stage,school_name,height_cm,weight_kg,
    basketball_profile,medical_ciphertext,care_notes_ciphertext,special_identity,eligibility_exception,exception_reason,
    jersey_size,jersey_number,jersey_name,price_rule_id,amount,insurance_consent_at,privacy_consent_at,refund_consent_at,receipt_transfer_consent_at,onsite_token_id,paid_at
  ) values (
    registration_id,p_request_id,event_row.id,environment_value,registration_no,status_value,trim(p_payload->>'player_name'),trim(p_payload->>'guardian_name'),trim(p_payload->>'guardian_phone'),lower(trim(p_payload->>'email')),trim(p_payload->>'line_id'),
    encode(extensions.pgp_sym_encrypt(p_payload->>'national_id',encryption_key,'cipher-algo=aes256'),'base64'),right(p_payload->>'national_id',4),trim(p_payload->>'postal_code'),trim(p_payload->>'receipt_address'),(p_payload->>'birthday')::date,p_payload->>'school_stage',trim(p_payload->>'school_name'),(p_payload->>'height_cm')::numeric,(p_payload->>'weight_kg')::numeric,
    jsonb_build_object('years',p_payload->>'basketball_years','position',p_payload->>'primary_position','hand',p_payload->>'dominant_hand','team',p_payload->>'current_team','competition',p_payload->>'competition_level','goals',coalesce(p_payload->'training_goals','[]'::jsonb)),
    encode(extensions.pgp_sym_encrypt(jsonb_build_object('medical_status',p_payload->>'medical_status','medical_notes',p_payload->>'medical_notes','emergency_name',p_payload->>'emergency_name','emergency_phone',p_payload->>'emergency_phone','dietary_need',p_payload->>'dietary_need')::text,encryption_key,'cipher-algo=aes256'),'base64'),
    case when coalesce(p_payload->>'care_notes','')='' then null else encode(extensions.pgp_sym_encrypt(p_payload->>'care_notes',encryption_key,'cipher-algo=aes256'),'base64') end,
    coalesce(p_payload->>'special_identity','none'),coalesce((p_payload->>'eligibility_exception')::boolean,false),coalesce(p_payload->>'exception_reason',''),
    case when now()<=event_row.jersey_choice_ends_at then p_payload->>'jersey_size' end,case when now()<=event_row.jersey_choice_ends_at then jersey_no end,case when now()<=event_row.jersey_choice_ends_at then p_payload->>'jersey_name' end,
    rule_row.id,rule_row.amount,now(),now(),case when coalesce((p_payload->>'refund_consent')::boolean,false) then now() end,case when coalesce((p_payload->>'receipt_consent')::boolean,false) then now() end,case when onsite then onsite_token.id end,case when onsite then onsite_token.payment_confirmed_at end
  );
  insert into camp_registration.receipt_profiles(registration_id,receipt_type,delivery_method,donor_name,receipt_title,receipt_id_ciphertext,receipt_id_last4,tax_upload_consent,public_credit)
  values(registration_id,'single','mail',trim(p_payload->>'donor_name'),trim(p_payload->>'receipt_title'),
    case when coalesce(p_payload->>'receipt_id','')='' then null else encode(extensions.pgp_sym_encrypt(p_payload->>'receipt_id',encryption_key,'cipher-algo=aes256'),'base64') end,
    case when coalesce(p_payload->>'receipt_id','')='' then null else right(p_payload->>'receipt_id',4) end,
    coalesce((p_payload->>'tax_upload_consent')::boolean,false),coalesce((p_payload->>'public_credit')::boolean,false));
  if coalesce((p_payload->>'no_receipt')::boolean,false) then
    perform public.heat_camp_2027_set_no_receipt(registration_id);
  end if;
  if onsite then
    update camp_registration.promotion_tokens set used_count=used_count+1 where id=onsite_token.id;
    insert into camp_registration.audit_log(registration_id,actor_type,action,details)
      values(registration_id,'system','onsite_prepaid_completed',jsonb_build_object('environment',environment_value,'payment_reference',onsite_token.payment_reference,'amount',rule_row.amount));
  end if;
  if status_value='awaiting_payment' then
    insert into camp_registration.payment_orders(registration_id,merchant_order_no,amount,payment_environment) values(registration_id,p_merchant_order_no,rule_row.amount,environment_value);
  end if;
  insert into camp_registration.audit_log(registration_id,actor_type,action,details) values(registration_id,'public','registration_created',jsonb_build_object('status',status_value,'amount',rule_row.amount));
  return jsonb_build_object('id',registration_id,'registration_no',registration_no,'status',status_value,'amount',rule_row.amount,'merchant_order_no',case when status_value='awaiting_payment' then p_merchant_order_no end,'email',lower(trim(p_payload->>'email')),'player_name',trim(p_payload->>'player_name'));
exception when unique_violation then raise exception 'jersey_or_order_unavailable';
end $function$;


revoke all on function public.heat_camp_2027_create_registration(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_create_registration(uuid,jsonb,text) to service_role;

