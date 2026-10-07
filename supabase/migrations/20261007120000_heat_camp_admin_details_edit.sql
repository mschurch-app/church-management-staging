-- Detailed camp registration read and non-payment edit operations.
-- Payment orders, banking data, encrypted identity and health data are intentionally immutable here.

create or replace function public.heat_camp_2027_admin_details(p_user uuid,p_registration_no text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row camp_registration.registrations%rowtype;
  v_receipt jsonb;
  v_payment jsonb;
  v_event uuid;
  v_sensitive boolean:=false;
  v_encryption_key text;
  v_sensitive_data jsonb:='{}'::jsonb;
begin
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
     or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
         and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id='M+' and g.permission='heat_camp')) then
    raise exception 'forbidden';
  end if;
  if coalesce((select f.can_view from church_auth.account_feature_permissions f
      where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),true)=false then
    raise exception 'forbidden';
  end if;
  select id into v_event from camp_registration.events where slug='heat-basketball-camp-2027' limit 1;
  select * into v_row from camp_registration.registrations
   where event_id=v_event and registration_no=p_registration_no;
  if not found then raise exception 'registration_not_found'; end if;
  v_sensitive:=exists(select 1 from church_auth.owners o where o.user_id=p_user)
    or coalesce((select f.can_manage from church_auth.account_feature_permissions f
      where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),false);

  select to_jsonb(x) into v_receipt
    from (select receipt_type,delivery_method,donor_name,receipt_title,receipt_id_last4,
                 tax_upload_consent,public_credit,created_at,updated_at
          from camp_registration.receipt_profiles where registration_id=v_row.id) x;
  select to_jsonb(x) into v_payment
    from (
      select p.provider,p.merchant_order_no,p.trade_no,p.amount,p.status,p.bank_code,
        p.virtual_account_masked,p.account_expires_at,p.issued_at,p.paid_at,p.created_at,p.updated_at,
        case when coalesce(p.provider_result->>'PaymentType','') ilike 'CREDIT%' then '信用卡'
             when p.provider_result->>'PaymentType'='VACC' then 'ATM 虛擬帳號'
             when p.provider_result->>'PaymentType'='WEBATM' then '網路 ATM'
             when p.provider_result->>'PaymentType'='CVS' then '超商代碼'
             when p.provider_result->>'PaymentType'='BARCODE' then '超商條碼'
             when coalesce(p.provider_result->>'PaymentType','')<>'' then left(p.provider_result->>'PaymentType',30)
             else '尚未確認' end payment_method,
        case when p.status='paid' or v_row.status='paid' then 'paid'
             when p.status in ('created','account_issued') and p.account_expires_at<=now() then 'expired'
             when p.status in ('created','account_issued') then 'awaiting_payment'
             when p.status='failed' then 'failed'
             when p.status='refunded' or v_row.status='refunded' then 'refunded'
             when p.status='cancelled' or v_row.status='cancelled' then 'cancelled'
             else 'unpaid' end payment_status
      from camp_registration.payment_orders p
      where p.registration_id=v_row.id order by p.created_at desc limit 1
    ) x;

  insert into camp_registration.audit_log(actor_type,actor_id,registration_id,action,details)
  values('staff',p_user::text,v_row.id,'admin_registration_details_viewed',
         jsonb_build_object('registration_no',v_row.registration_no,'sensitive_fields_viewed',v_sensitive));

  if v_sensitive then
    select decrypted_secret into v_encryption_key from vault.decrypted_secrets
      where name='heat-camp-data-encryption-key';
    if v_encryption_key is null then raise exception 'encryption_unavailable'; end if;
    v_sensitive_data:=jsonb_build_object(
      'national_id',extensions.pgp_sym_decrypt(decode(v_row.national_id_ciphertext,'base64'),v_encryption_key),
      'medical',case when v_row.medical_ciphertext is null or v_row.medical_ciphertext=''
        then '{}'::jsonb else extensions.pgp_sym_decrypt(decode(v_row.medical_ciphertext,'base64'),v_encryption_key)::jsonb end,
      'care_notes',case when v_row.care_notes_ciphertext is null or v_row.care_notes_ciphertext=''
        then '' else extensions.pgp_sym_decrypt(decode(v_row.care_notes_ciphertext,'base64'),v_encryption_key) end,
      'receipt_id',case when v_receipt->>'receipt_id_last4' is null
        then '' else (select extensions.pgp_sym_decrypt(decode(rp.receipt_id_ciphertext,'base64'),v_encryption_key)
          from camp_registration.receipt_profiles rp where rp.registration_id=v_row.id) end
    );
  end if;

  return jsonb_build_object(
    'registration',jsonb_build_object(
      'registration_no',v_row.registration_no,'registration_status',v_row.status,'player_name',v_row.player_name,
      'guardian_name',v_row.guardian_name,'guardian_phone',v_row.guardian_phone,'email',v_row.email,'line_id',v_row.line_id,
      'national_id_last4',v_row.national_id_last4,'postal_code',v_row.postal_code,'receipt_address',v_row.receipt_address,
      'birthday',v_row.birthday,'school_stage',v_row.school_stage,'school_name',v_row.school_name,
      'height_cm',v_row.height_cm,'weight_kg',v_row.weight_kg,'basketball_profile',v_row.basketball_profile,
      'special_identity',v_row.special_identity,'eligibility_exception',v_row.eligibility_exception,
      'exception_reason',v_row.exception_reason,'exception_reviewed_at',v_row.exception_reviewed_at,
      'jersey_size',v_row.jersey_size,'jersey_number',v_row.jersey_number,'jersey_name',v_row.jersey_name,
      'amount',v_row.amount,'insurance_consent_at',v_row.insurance_consent_at,
      'privacy_consent_at',v_row.privacy_consent_at,'receipt_transfer_consent_at',v_row.receipt_transfer_consent_at,
      'created_at',v_row.created_at,'updated_at',v_row.updated_at,'paid_at',v_row.paid_at,
      'medical_data_present',v_row.medical_ciphertext is not null and v_row.medical_ciphertext<>'',
      'care_notes_present',v_row.care_notes_ciphertext is not null and v_row.care_notes_ciphertext<>''
    ),
    'receipt',coalesce(v_receipt,'{}'::jsonb),
    'payment',coalesce(v_payment,jsonb_build_object(
      'payment_status',case when v_row.status='paid' then 'paid' when v_row.status='refunded' then 'refunded' when v_row.status='cancelled' then 'cancelled' else 'unpaid' end,
      'payment_method','未記錄')),
    'sensitive_access',v_sensitive,
    'sensitive',v_sensitive_data
  );
end;
$$;

create or replace function public.heat_camp_2027_admin_update(
  p_user uuid,p_registration_no text,p_changes jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_event uuid;
  v_encryption_key text;
  v_sensitive_keys constant text[]:=array['national_id','medical_notes','emergency_name','emergency_phone','dietary_need','care_notes','receipt_id'];
  v_keys text[];
  v_allowed constant text[]:=array[
    'player_name','guardian_name','guardian_phone','email','line_id','postal_code','receipt_address',
    'birthday','school_stage','school_name','height_cm','weight_kg','basketball_profile',
    'special_identity','eligibility_exception','exception_reason','jersey_size','jersey_number',
    'jersey_name','receipt_type','delivery_method','donor_name','receipt_title',
    'national_id','medical_notes','emergency_name','emergency_phone','dietary_need','care_notes','receipt_id'
  ];
begin
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
     or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
         and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id='M+' and g.permission='heat_camp')) then
    raise exception 'forbidden';
  end if;
  if coalesce((select f.can_edit from church_auth.account_feature_permissions f
      where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),true)=false then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_changes)<>'object' or octet_length(p_changes::text)>20000 then raise exception 'invalid_changes'; end if;
  select array_agg(keys.key) into v_keys from jsonb_object_keys(p_changes) as keys(key);
  if coalesce(cardinality(v_keys),0)=0 or exists(select 1 from unnest(v_keys) as keys(key) where not(keys.key=any(v_allowed))) then
    raise exception 'invalid_changes';
  end if;
  if exists(select 1 from unnest(v_keys) as keys(key) where keys.key=any(v_sensitive_keys))
     and not exists(select 1 from church_auth.owners o where o.user_id=p_user)
     and not coalesce((select f.can_manage from church_auth.account_feature_permissions f
       where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),false) then
    raise exception 'forbidden';
  end if;
  if p_changes ? 'national_id' and coalesce(p_changes->>'national_id','') !~ '^[A-Z][12][0-9]{8}$' then
    raise exception 'invalid_changes';
  end if;
  if p_changes ? 'receipt_id' and length(coalesce(p_changes->>'receipt_id',''))>20 then raise exception 'invalid_changes'; end if;
  if p_changes ?| array['medical_notes','emergency_name','emergency_phone','dietary_need']
     and not (p_changes ?& array['medical_notes','emergency_name','emergency_phone','dietary_need']) then
    raise exception 'invalid_changes';
  end if;
  if p_changes ? 'basketball_profile' and (
    jsonb_typeof(p_changes->'basketball_profile')<>'object'
    or exists(select 1 from jsonb_object_keys(p_changes->'basketball_profile') as profile_keys(key)
      where profile_keys.key not in ('years','position','hand','team','competition','goals'))
  ) then raise exception 'invalid_changes'; end if;

  select id into v_event from camp_registration.events where slug='heat-basketball-camp-2027' limit 1;
  select id into v_id from camp_registration.registrations
   where event_id=v_event and registration_no=p_registration_no for update;
  if not found then raise exception 'registration_not_found'; end if;
  if p_changes ?| v_sensitive_keys then
    select decrypted_secret into v_encryption_key from vault.decrypted_secrets
      where name='heat-camp-data-encryption-key';
    if v_encryption_key is null then raise exception 'encryption_unavailable'; end if;
  end if;

  update camp_registration.registrations r set
    player_name=case when p_changes ? 'player_name' then left(trim(p_changes->>'player_name'),80) else r.player_name end,
    guardian_name=case when p_changes ? 'guardian_name' then left(trim(p_changes->>'guardian_name'),80) else r.guardian_name end,
    guardian_phone=case when p_changes ? 'guardian_phone' then left(trim(p_changes->>'guardian_phone'),40) else r.guardian_phone end,
    email=case when p_changes ? 'email' then left(trim(p_changes->>'email'),160) else r.email end,
    line_id=case when p_changes ? 'line_id' then left(trim(p_changes->>'line_id'),160) else r.line_id end,
    postal_code=case when p_changes ? 'postal_code' then left(trim(p_changes->>'postal_code'),10) else r.postal_code end,
    receipt_address=case when p_changes ? 'receipt_address' then left(trim(p_changes->>'receipt_address'),220) else r.receipt_address end,
    birthday=case when p_changes ? 'birthday' then (p_changes->>'birthday')::date else r.birthday end,
    school_stage=case when p_changes ? 'school_stage' then left(trim(p_changes->>'school_stage'),40) else r.school_stage end,
    school_name=case when p_changes ? 'school_name' then left(trim(p_changes->>'school_name'),160) else r.school_name end,
    height_cm=case when p_changes ? 'height_cm' then (p_changes->>'height_cm')::numeric else r.height_cm end,
    weight_kg=case when p_changes ? 'weight_kg' then (p_changes->>'weight_kg')::numeric else r.weight_kg end,
    basketball_profile=case when p_changes ? 'basketball_profile' then p_changes->'basketball_profile' else r.basketball_profile end,
    special_identity=case when p_changes ? 'special_identity' then left(trim(p_changes->>'special_identity'),40) else r.special_identity end,
    eligibility_exception=case when p_changes ? 'eligibility_exception' then (p_changes->>'eligibility_exception')::boolean else r.eligibility_exception end,
    exception_reason=case when p_changes ? 'exception_reason' then left(trim(p_changes->>'exception_reason'),500) else r.exception_reason end,
    jersey_size=case when p_changes ? 'jersey_size' then nullif(left(trim(p_changes->>'jersey_size'),30),'') else r.jersey_size end,
    jersey_number=case when p_changes ? 'jersey_number' then (p_changes->>'jersey_number')::integer else r.jersey_number end,
    jersey_name=case when p_changes ? 'jersey_name' then nullif(left(trim(p_changes->>'jersey_name'),40),'') else r.jersey_name end,
    national_id_ciphertext=case when p_changes ? 'national_id' then encode(extensions.pgp_sym_encrypt(p_changes->>'national_id',v_encryption_key,'cipher-algo=aes256'),'base64') else r.national_id_ciphertext end,
    national_id_last4=case when p_changes ? 'national_id' then right(p_changes->>'national_id',4) else r.national_id_last4 end,
    medical_ciphertext=case when p_changes ?| array['medical_notes','emergency_name','emergency_phone','dietary_need']
      then encode(extensions.pgp_sym_encrypt(jsonb_build_object(
        'medical_notes',case when p_changes ? 'medical_notes' then p_changes->>'medical_notes' else null end,
        'emergency_name',case when p_changes ? 'emergency_name' then p_changes->>'emergency_name' else null end,
        'emergency_phone',case when p_changes ? 'emergency_phone' then p_changes->>'emergency_phone' else null end,
        'dietary_need',case when p_changes ? 'dietary_need' then p_changes->>'dietary_need' else null end
      )::text,v_encryption_key,'cipher-algo=aes256'),'base64') else r.medical_ciphertext end,
    care_notes_ciphertext=case when p_changes ? 'care_notes' then
      case when coalesce(p_changes->>'care_notes','')='' then null else encode(extensions.pgp_sym_encrypt(p_changes->>'care_notes',v_encryption_key,'cipher-algo=aes256'),'base64') end
      else r.care_notes_ciphertext end,
    updated_at=now()
  where r.id=v_id;

  if p_changes ?| array['receipt_type','delivery_method','donor_name','receipt_title','receipt_id'] then
    update camp_registration.receipt_profiles rp set
      receipt_type=case when p_changes ? 'receipt_type' then left(trim(p_changes->>'receipt_type'),20) else rp.receipt_type end,
      delivery_method=case when p_changes ? 'delivery_method' then nullif(left(trim(p_changes->>'delivery_method'),20),'') else rp.delivery_method end,
      donor_name=case when p_changes ? 'donor_name' then nullif(left(trim(p_changes->>'donor_name'),120),'') else rp.donor_name end,
      receipt_title=case when p_changes ? 'receipt_title' then nullif(left(trim(p_changes->>'receipt_title'),160),'') else rp.receipt_title end,
      receipt_id_ciphertext=case when p_changes ? 'receipt_id' then
        case when coalesce(p_changes->>'receipt_id','')='' then null else encode(extensions.pgp_sym_encrypt(p_changes->>'receipt_id',v_encryption_key,'cipher-algo=aes256'),'base64') end
        else rp.receipt_id_ciphertext end,
      receipt_id_last4=case when p_changes ? 'receipt_id' then nullif(right(p_changes->>'receipt_id',4),'') else rp.receipt_id_last4 end,
      updated_at=now()
    where rp.registration_id=v_id;
  end if;

  insert into camp_registration.audit_log(actor_type,actor_id,registration_id,action,details)
  values('staff',p_user::text,v_id,'admin_registration_updated',
         jsonb_build_object('changed_fields',to_jsonb(v_keys)));
  return true;
end;
$$;

revoke all on function public.heat_camp_2027_admin_details(uuid,text) from public,anon,authenticated;
revoke all on function public.heat_camp_2027_admin_update(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_admin_details(uuid,text) to service_role;
grant execute on function public.heat_camp_2027_admin_update(uuid,text,jsonb) to service_role;
