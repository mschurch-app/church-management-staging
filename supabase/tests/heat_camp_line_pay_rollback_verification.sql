-- Verify the LINE Pay database path without leaving a registration, payment,
-- receipt queue item, or audit row. No LINE API or real charge is involved.
do $test$
declare
  rid uuid:=gen_random_uuid();
  order_no text:='HB27'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
  transaction_no text:='20261020'||lpad((floor(random()*100000000000)::bigint)::text,11,'0');
  payload jsonb; created jsonb; claimed jsonb; saved jsonb; context jsonb; paid jsonb;
  info jsonb; amount_value integer; jersey integer; before_count integer; after_count integer;
  mismatch_rejected boolean:=false; passed text[]:='{}';
begin
  select count(*) into before_count from camp_registration.registrations;
  begin
    select jersey_number into jersey from public.heat_camp_2027_available_jersey_numbers('production') limit 1;
    if jersey is null then raise exception 'no_test_jersey_available'; end if;
    payload:=jsonb_build_object(
      'payment_environment','production','player_name','驗證不留存','guardian_name','驗證家長',
      'guardian_phone','0912345678','email','verification@example.invalid',
      'national_id','A123456789','postal_code','428','receipt_address','驗證地址',
      'birthday','2012-01-01','school_stage','junior_high','school_name','',
      'line_id','','height_cm','160','weight_kg','55','jersey_size','M',
      'jersey_number',jersey,'jersey_name','VERIFY','medical_status','none',
      'medical_notes','','emergency_name','驗證','emergency_phone','0912345678',
      'dietary_need','none','refund_consent',true,'receipt_consent',true,
      'donor_name','驗證','receipt_title','驗證','pricing_mode','standard');
    created:=public.heat_camp_2027_create_registration(rid,payload,order_no);
    amount_value:=(created->>'amount')::integer;
    claimed:=public.heat_camp_2027_claim_line_pay_order(rid,'production',order_no);
    if claimed->>'merchant_order_no'<>order_no then raise exception 'claim_failed'; end if;
    passed:=array_append(passed,'claim original registration');
    saved:=public.heat_camp_2027_save_line_pay_request(order_no,transaction_no,
      'https://web-pay.line.me/web/payment/verification-only');
    if saved->>'transaction_id'<>transaction_no then raise exception 'save_request_failed'; end if;
    context:=public.heat_camp_2027_retry_context(rid);
    if context->>'payment_provider'<>'line_pay' or context->>'transaction_id'<>transaction_no
      or context->>'payment_url'<>'https://web-pay.line.me/web/payment/verification-only'
      then raise exception 'resume_context_failed'; end if;
    passed:=array_append(passed,'resume same payment URL');
    info:=jsonb_build_object('orderId',order_no,'transactionId',transaction_no,
      'transactionType','PAYMENT','currency','TWD',
      'payInfo',jsonb_build_array(jsonb_build_object('amount',amount_value)));
    begin
      perform public.heat_camp_2027_record_line_pay(transaction_no,
        jsonb_set(info,'{payInfo,0,amount}',to_jsonb(amount_value+1)));
    exception when others then
      if sqlerrm='line_pay_amount_mismatch' then mismatch_rejected:=true; else raise; end if;
    end;
    if not mismatch_rejected then raise exception 'wrong_amount_accepted'; end if;
    passed:=array_append(passed,'wrong amount rejected');
    paid:=public.heat_camp_2027_record_line_pay(transaction_no,info);
    if paid->>'status'<>'paid' then raise exception 'paid_record_failed'; end if;
    if (public.heat_camp_2027_record_line_pay(transaction_no,info)->>'status')<>'paid'
      then raise exception 'duplicate_payment_failed'; end if;
    if (public.heat_camp_2027_close_line_pay(transaction_no,'cancelled')->>'status')<>'paid'
      then raise exception 'late_cancel_overwrote_paid'; end if;
    if (select count(*) from camp_registration.eoffering_sync where registration_id=(created->>'id')::uuid)<>1
      then raise exception 'receipt_queue_not_once'; end if;
    context:=public.heat_camp_2027_retry_context(rid);
    if context->>'status'<>'paid' or context->>'order_status'<>'paid'
      then raise exception 'paid_registration_not_visible'; end if;
    passed:=array_append(passed,'paid once, late cancel ignored, receipt queued once');
    raise exception 'verification rollback' using errcode='P0002';
  exception when no_data_found then
    if array_length(passed,1)<>4 then raise exception 'incomplete_verification'; end if;
  end;
  select count(*) into after_count from camp_registration.registrations;
  if before_count<>after_count or exists(select 1 from camp_registration.registrations where request_id=rid)
    then raise exception 'test_rollback_failed'; end if;
  perform set_config('camp.line_pay_verification',jsonb_build_object('passed',passed,
    'rolled_back',true,'registrations_before',before_count,'registrations_after',after_count)::text,true);
end $test$;
select current_setting('camp.line_pay_verification')::jsonb verification;
