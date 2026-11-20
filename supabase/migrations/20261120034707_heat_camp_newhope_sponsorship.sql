-- New Hope registrations settle through project sponsorship, never a payment order.
set lock_timeout='3s';
alter table camp_registration.registrations add column sponsorship_token_id uuid references camp_registration.promotion_tokens(id);
alter table camp_registration.registrations drop constraint registrations_status_check;
alter table camp_registration.registrations add constraint registrations_status_check check(status in ('draft','exception_review','awaiting_pair','awaiting_payment','paid','sponsored','waitlisted','cancelled','refunded'));
alter table camp_registration.registrations drop constraint registrations_amount_check;
alter table camp_registration.registrations add constraint registrations_amount_check check(amount>0 or (amount=0 and sponsorship_token_id is not null));
alter table camp_registration.price_rules drop constraint price_rules_rule_type_check;
alter table camp_registration.price_rules add constraint price_rules_rule_type_check check(rule_type in ('date_range','verified_onsite','friend_pair','verified_sponsorship'));
alter table camp_registration.price_rules drop constraint price_rules_amount_check;
alter table camp_registration.price_rules add constraint price_rules_amount_check check(amount>0 or (amount=0 and rule_type='verified_sponsorship'));
create unique index heat_camp_unique_active_jersey_number_v2_idx on camp_registration.registrations(event_id,payment_environment,jersey_number) where jersey_number is not null and status in ('draft','exception_review','awaiting_pair','awaiting_payment','paid','sponsored');
drop index camp_registration.heat_camp_unique_active_jersey_number_idx;
insert into camp_registration.price_rules(event_id,code,label,amount,rule_type,priority,metadata)
select id,'newhope','新希望專案・免繳費',0,'verified_sponsorship',5,'{"requires_token":true,"sponsor":"新希望基金會"}'::jsonb from camp_registration.events where slug='heat-basketball-camp-2027';
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
  sponsored boolean:=coalesce(p_payload->>'pricing_mode','standard')='newhope';
  token_code text;
begin
  environment_value:=coalesce(p_payload->>'payment_environment','test');
  if environment_value not in ('test','production') then raise exception 'invalid_environment'; end if;
  if p_request_id is null or jsonb_typeof(p_payload)<>'object' or p_merchant_order_no !~ '^HB27[0-9A-Z]{10,22}$' then raise exception 'invalid_request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into existing from camp_registration.registrations where request_id=p_request_id;
  if found then
    if (existing.onsite_token_id is not null)<>onsite or (existing.sponsorship_token_id is not null)<>sponsored then raise exception 'request_registration_mismatch'; end if;
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
  if onsite or sponsored then
    token_code:=upper(trim(coalesce(p_payload->>case when sponsored then 'sponsorship_code' else 'onsite_code' end,'')));
    if token_code !~ '^[A-Z0-9-]{8,32}$' then raise exception using message=case when sponsored then 'sponsorship_verification_failed' else 'onsite_verification_failed' end; end if;
    select pt.* into onsite_token from camp_registration.promotion_tokens pt
      where pt.event_id=event_row.id and pt.payment_environment=environment_value
        and pt.token_hash=encode(extensions.digest(token_code,'sha256'),'hex')
        and pt.active and (sponsored or (pt.payment_confirmed_at is not null and nullif(trim(pt.payment_reference),'') is not null))
        and (pt.expires_at is null or pt.expires_at>now())
      for update;
    if not found then raise exception using message=case when sponsored then 'sponsorship_verification_failed' else 'onsite_verification_failed' end; end if;
    if onsite_token.used_count>=onsite_token.max_uses or onsite_token.max_uses<>1 then raise exception using message=case when sponsored then 'sponsorship_code_used' else 'onsite_code_used' end; end if;
    select * into rule_row from camp_registration.price_rules where id=onsite_token.price_rule_id
      and event_id=event_row.id and rule_type=case when sponsored then 'verified_sponsorship' else 'verified_onsite' end and active
      and (not sponsored or (code='newhope' and amount=0));
    if not found then raise exception using message=case when sponsored then 'sponsorship_verification_failed' else 'onsite_verification_failed' end; end if;
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
  if (select count(*) from camp_registration.registrations where event_id=event_row.id and payment_environment=environment_value and status in ('paid','sponsored'))>=event_row.capacity then raise exception 'camp_full'; end if;
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name='heat-camp-data-encryption-key';
  if encryption_key is null then raise exception 'encryption_unavailable'; end if;
  registration_id:=gen_random_uuid();
  registration_no:='HC27-'||upper(substr(replace(registration_id::text,'-',''),1,10));
  status_value:=case when sponsored then 'sponsored' when onsite then 'paid' when p_payload->>'school_stage'='elementary_6_or_below' then 'exception_review' else 'awaiting_payment' end;
  insert into camp_registration.registrations(
    id,request_id,event_id,payment_environment,registration_no,status,player_name,guardian_name,guardian_phone,email,line_id,
    national_id_ciphertext,national_id_last4,postal_code,receipt_address,birthday,school_stage,school_name,height_cm,weight_kg,
    basketball_profile,medical_ciphertext,care_notes_ciphertext,special_identity,eligibility_exception,exception_reason,
    jersey_size,jersey_number,jersey_name,price_rule_id,amount,insurance_consent_at,privacy_consent_at,refund_consent_at,receipt_transfer_consent_at,onsite_token_id,paid_at,sponsorship_token_id
  ) values (
    registration_id,p_request_id,event_row.id,environment_value,registration_no,status_value,trim(p_payload->>'player_name'),trim(p_payload->>'guardian_name'),trim(p_payload->>'guardian_phone'),lower(trim(p_payload->>'email')),trim(p_payload->>'line_id'),
    encode(extensions.pgp_sym_encrypt(p_payload->>'national_id',encryption_key,'cipher-algo=aes256'),'base64'),right(p_payload->>'national_id',4),trim(p_payload->>'postal_code'),trim(p_payload->>'receipt_address'),(p_payload->>'birthday')::date,p_payload->>'school_stage',trim(p_payload->>'school_name'),(p_payload->>'height_cm')::numeric,(p_payload->>'weight_kg')::numeric,
    jsonb_build_object('years',p_payload->>'basketball_years','position',p_payload->>'primary_position','hand',p_payload->>'dominant_hand','team',p_payload->>'current_team','competition',p_payload->>'competition_level','goals',coalesce(p_payload->'training_goals','[]'::jsonb)),
    encode(extensions.pgp_sym_encrypt(jsonb_build_object('medical_status',p_payload->>'medical_status','medical_notes',p_payload->>'medical_notes','emergency_name',p_payload->>'emergency_name','emergency_phone',p_payload->>'emergency_phone','dietary_need',p_payload->>'dietary_need')::text,encryption_key,'cipher-algo=aes256'),'base64'),
    case when coalesce(p_payload->>'care_notes','')='' then null else encode(extensions.pgp_sym_encrypt(p_payload->>'care_notes',encryption_key,'cipher-algo=aes256'),'base64') end,
    coalesce(p_payload->>'special_identity','none'),coalesce((p_payload->>'eligibility_exception')::boolean,false),coalesce(p_payload->>'exception_reason',''),
    case when now()<=event_row.jersey_choice_ends_at then p_payload->>'jersey_size' end,case when now()<=event_row.jersey_choice_ends_at then jersey_no end,case when now()<=event_row.jersey_choice_ends_at then p_payload->>'jersey_name' end,
    rule_row.id,rule_row.amount,now(),now(),case when coalesce((p_payload->>'refund_consent')::boolean,false) then now() end,case when coalesce((p_payload->>'receipt_consent')::boolean,false) then now() end,case when onsite then onsite_token.id end,case when onsite then onsite_token.payment_confirmed_at end,case when sponsored then onsite_token.id end
  );
  insert into camp_registration.receipt_profiles(registration_id,receipt_type,delivery_method,donor_name,receipt_title,receipt_id_ciphertext,receipt_id_last4,tax_upload_consent,public_credit)
  values(registration_id,'single','mail',trim(p_payload->>'donor_name'),trim(p_payload->>'receipt_title'),
    case when coalesce(p_payload->>'receipt_id','')='' then null else encode(extensions.pgp_sym_encrypt(p_payload->>'receipt_id',encryption_key,'cipher-algo=aes256'),'base64') end,
    case when coalesce(p_payload->>'receipt_id','')='' then null else right(p_payload->>'receipt_id',4) end,
    not sponsored and coalesce((p_payload->>'tax_upload_consent')::boolean,false),not sponsored and coalesce((p_payload->>'public_credit')::boolean,false));
  if sponsored or coalesce((p_payload->>'no_receipt')::boolean,false) then
    perform public.heat_camp_2027_set_no_receipt(registration_id);
  end if;
  if onsite or sponsored then
    update camp_registration.promotion_tokens set used_count=used_count+1 where id=onsite_token.id;
    insert into camp_registration.audit_log(registration_id,actor_type,action,details)
      values(registration_id,'system',case when sponsored then 'newhope_sponsorship_completed' else 'onsite_prepaid_completed' end,jsonb_build_object('environment',environment_value,'payment_reference',onsite_token.payment_reference,'amount',rule_row.amount));
  end if;
  if status_value='awaiting_payment' then
    insert into camp_registration.payment_orders(registration_id,merchant_order_no,amount,payment_environment) values(registration_id,p_merchant_order_no,rule_row.amount,environment_value);
  end if;
  insert into camp_registration.audit_log(registration_id,actor_type,action,details) values(registration_id,'public','registration_created',jsonb_build_object('status',status_value,'amount',rule_row.amount));
  return jsonb_build_object('id',registration_id,'registration_no',registration_no,'status',status_value,'amount',rule_row.amount,'merchant_order_no',case when status_value='awaiting_payment' then p_merchant_order_no end,'email',lower(trim(p_payload->>'email')),'player_name',trim(p_payload->>'player_name'));
exception when unique_violation then raise exception 'jersey_or_order_unavailable';
end $function$

;

revoke all on function public.heat_camp_2027_create_registration(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_create_registration(uuid,jsonb,text) to service_role;
CREATE OR REPLACE FUNCTION public.heat_camp_2027_available_jersey_numbers(p_environment text)
 RETURNS TABLE(jersey_number integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select candidate
  from pg_catalog.generate_series(0,99) as candidate
  where p_environment in ('test','production') and not exists (
    select 1 from camp_registration.registrations r
    join camp_registration.events e on e.id=r.event_id
    where e.slug='heat-basketball-camp-2027'
      and r.payment_environment=p_environment and r.jersey_number=candidate
      and r.status in ('draft','exception_review','awaiting_pair','awaiting_payment','paid','sponsored')
  ) order by candidate;
$function$

;
CREATE OR REPLACE FUNCTION public.heat_camp_2027_admin_list(p_user uuid, p_action text, p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_payment text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_event uuid; v_total integer; v_items jsonb; v_summary jsonb; v_limit integer:=least(greatest(coalesce(p_limit,50),1),100); v_offset integer:=greatest(coalesce(p_offset,0),0); v_search text:=left(trim(coalesce(p_search,'')),100);
begin
  if p_action not in ('view','export') then raise exception 'invalid_action'; end if;
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
     or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
         and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id='M+' and g.permission='heat_camp')) then raise exception 'forbidden'; end if;
  if coalesce((select case when p_action='export' then f.can_export else f.can_view end
      from church_auth.account_feature_permissions f where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),true)=false then raise exception 'forbidden'; end if;

  select id into v_event from camp_registration.events where slug='heat-basketball-camp-2027' limit 1;
  if v_event is null then raise exception 'event_not_found'; end if;
  with rows as (
    select r.id,r.registration_no,r.status,r.player_name,r.guardian_name,r.guardian_phone,r.email,r.school_stage,r.school_name,
      r.jersey_size,r.jersey_number,r.jersey_name,r.amount,r.created_at,r.paid_at,
      p.merchant_order_no,p.status payment_order_status,p.bank_code,p.virtual_account_masked,p.account_expires_at,p.paid_at order_paid_at,
      case when r.status='sponsored' then 'sponsored' when p.status='paid' or r.status='paid' then 'paid'
           when p.status in ('created','account_issued') and p.account_expires_at<=now() then 'expired'
           when p.status in ('created','account_issued') then 'awaiting_payment'
           when p.status='failed' then 'failed'
           when p.status='refunded' or r.status='refunded' then 'refunded'
           when p.status='cancelled' or r.status='cancelled' then 'cancelled'
           else 'unpaid' end payment_status,
      case when r.status='sponsored' then '新希望專案補助' when coalesce(p.provider_result->>'PaymentType','') ilike 'CREDIT%' then '信用卡'
           when coalesce(p.provider_result->>'PaymentType','')='VACC' then 'ATM 虛擬帳號'
           when coalesce(p.provider_result->>'PaymentType','')<>'' then left(p.provider_result->>'PaymentType',30)
           else '' end payment_method
    from camp_registration.registrations r
    left join lateral(select o.* from camp_registration.payment_orders o where o.registration_id=r.id order by o.created_at desc limit 1) p on true
    where r.event_id=v_event
  ), filtered as (
    select * from rows x
    where (p_status='' or x.status=p_status)
      and (p_payment='' or x.payment_status=p_payment)
      and (v_search='' or x.registration_no ilike '%'||v_search||'%' or x.player_name ilike '%'||v_search||'%' or x.guardian_name ilike '%'||v_search||'%' or x.guardian_phone ilike '%'||v_search||'%' or x.email ilike '%'||v_search||'%')
  )
  select count(*) into v_total from filtered;
  if p_action='export' and v_total>2000 then raise exception 'filter_required'; end if;
  with rows as (
    select r.id,r.registration_no,r.status,r.player_name,r.guardian_name,r.guardian_phone,r.email,r.school_stage,r.school_name,
      r.jersey_size,r.jersey_number,r.jersey_name,r.amount,r.created_at,r.paid_at,
      p.merchant_order_no,p.status payment_order_status,p.bank_code,p.virtual_account_masked,p.account_expires_at,p.paid_at order_paid_at,
      case when r.status='sponsored' then 'sponsored' when p.status='paid' or r.status='paid' then 'paid'
           when p.status in ('created','account_issued') and p.account_expires_at<=now() then 'expired'
           when p.status in ('created','account_issued') then 'awaiting_payment'
           when p.status='failed' then 'failed'
           when p.status='refunded' or r.status='refunded' then 'refunded'
           when p.status='cancelled' or r.status='cancelled' then 'cancelled'
           else 'unpaid' end payment_status,
      case when r.status='sponsored' then '新希望專案補助' when coalesce(p.provider_result->>'PaymentType','') ilike 'CREDIT%' then '信用卡'
           when coalesce(p.provider_result->>'PaymentType','')='VACC' then 'ATM 虛擬帳號'
           when coalesce(p.provider_result->>'PaymentType','')<>'' then left(p.provider_result->>'PaymentType',30)
           else '' end payment_method
    from camp_registration.registrations r
    left join lateral(select o.* from camp_registration.payment_orders o where o.registration_id=r.id order by o.created_at desc limit 1) p on true
    where r.event_id=v_event
  ), filtered as (
    select * from rows x
    where (p_status='' or x.status=p_status)
      and (p_payment='' or x.payment_status=p_payment)
      and (v_search='' or x.registration_no ilike '%'||v_search||'%' or x.player_name ilike '%'||v_search||'%' or x.guardian_name ilike '%'||v_search||'%' or x.guardian_phone ilike '%'||v_search||'%' or x.email ilike '%'||v_search||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'registration_no',registration_no,'registration_status',status,'player_name',player_name,'guardian_name',guardian_name,
    'guardian_phone',guardian_phone,'email',email,'school_stage',school_stage,'school_name',school_name,
    'jersey_size',jersey_size,'jersey_number',jersey_number,'jersey_name',jersey_name,'amount',amount,
    'created_at',created_at,'paid_at',coalesce(order_paid_at,paid_at),'merchant_order_no',merchant_order_no,
    'payment_status',payment_status,'payment_method',payment_method,'bank_code',bank_code,
    'virtual_account_masked',virtual_account_masked,'account_expires_at',account_expires_at
  ) order by created_at desc), '[]'::jsonb) into v_items
  from (select * from filtered order by created_at desc limit case when p_action='export' then 2000 else v_limit end offset case when p_action='export' then 0 else v_offset end) page;

  select jsonb_build_object(
    'total',count(*),'sponsored',count(*) filter(where r.status='sponsored'),'paid',count(*) filter(where r.status='paid' or p.status='paid'),
    'awaiting_payment',count(*) filter(where p.status in ('created','account_issued') and (p.account_expires_at is null or p.account_expires_at>now())),
    'expired',count(*) filter(where p.status in ('created','account_issued') and p.account_expires_at<=now()),
    'failed',count(*) filter(where p.status='failed'),
    'exception_review',count(*) filter(where r.status='exception_review'),
    'waitlisted',count(*) filter(where r.status='waitlisted'),
    'cancelled_or_refunded',count(*) filter(where r.status in ('cancelled','refunded'))
  ) into v_summary from camp_registration.registrations r
  left join lateral(select o.status,o.account_expires_at from camp_registration.payment_orders o where o.registration_id=r.id order by o.created_at desc limit 1) p on true
  where r.event_id=v_event;

  insert into camp_registration.audit_log(actor_type,actor_id,action,details)
  values('staff',p_user::text,case when p_action='export' then 'admin_list_exported' else 'admin_list_viewed' end,
    jsonb_build_object('search_used',v_search<>'','registration_status',p_status,'payment_status',p_payment,'result_count',jsonb_array_length(v_items)));
  return jsonb_build_object('event_name','2027 熱火籃球營','total_filtered',v_total,'offset',v_offset,'limit',v_limit,'summary',v_summary,'items',v_items);
end $function$

;
CREATE OR REPLACE FUNCTION public.heat_camp_2027_admin_details(p_user uuid, p_registration_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'payment_status',case when v_row.status='sponsored' then 'sponsored' when v_row.status='paid' then 'paid' when v_row.status='refunded' then 'refunded' when v_row.status='cancelled' then 'cancelled' else 'unpaid' end,
      'payment_method',case when v_row.status='sponsored' then '新希望專案補助' else '未記錄' end)),
    'sensitive_access',v_sensitive,
    'sensitive',v_sensitive_data
  );
end;
$function$

;

create unique index heat_camp_unique_sponsorship_token_idx on camp_registration.registrations(sponsorship_token_id) where sponsorship_token_id is not null;

create or replace function public.heat_camp_2027_issue_newhope_codes(p_user uuid,p_count integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare event_row camp_registration.events%rowtype; rule_id uuid; code_value text; codes jsonb:='[]'::jsonb;
begin
 if not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
 or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
 and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id='M+' and g.permission='heat_camp'))
 or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
 and not coalesce((select f.can_manage from church_auth.account_feature_permissions f where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),false)) then raise exception 'forbidden'; end if;
 if p_count is null or p_count not between 1 and 100 then raise exception 'invalid_count'; end if;
 select * into event_row from camp_registration.events where slug='heat-basketball-camp-2027' and active;
 if not found or event_row.registration_closes_at<=now() then raise exception 'registration_closed'; end if;
 select id into rule_id from camp_registration.price_rules where event_id=event_row.id and code='newhope' and rule_type='verified_sponsorship' and active and amount=0;
 if rule_id is null then raise exception 'project_unavailable'; end if;
 for i in 1..p_count loop
  code_value:='NH-'||upper(encode(extensions.gen_random_bytes(10),'hex'));
  insert into camp_registration.promotion_tokens(event_id,price_rule_id,token_hash,label,max_uses,expires_at,payment_environment)
  values(event_row.id,rule_id,encode(extensions.digest(code_value,'sha256'),'hex'),'新希望專案',1,event_row.registration_closes_at,'production');
  codes:=codes||jsonb_build_array(code_value);
 end loop;
 insert into camp_registration.audit_log(actor_type,actor_id,action,details) values('staff',p_user::text,'newhope_codes_issued',jsonb_build_object('count',p_count,'max_uses',1));
 return jsonb_build_object('codes',codes,'expires_at',event_row.registration_closes_at,'max_uses',1);
end $fn$;
revoke all on function public.heat_camp_2027_issue_newhope_codes(uuid,integer) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_issue_newhope_codes(uuid,integer) to service_role;
