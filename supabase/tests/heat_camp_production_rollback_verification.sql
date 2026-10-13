-- Authorized verification. All fixture writes roll back within an exception subtransaction.
do $test$
declare
 rid uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid(); dupid uuid:=gen_random_uuid();
 payload jsonb; r jsonb; t jsonb; x jsonb; n integer; jersey integer; amount_value integer;
 first_order text:='HB27'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 retry_order text:='HB27'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 test_order text:='HB27'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 dup_order text:='HB27'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 passed text[]:='{}'; expected boolean:=false; before_count integer; after_count integer;
begin
 select count(*) into before_count from camp_registration.registrations;
 begin
 select p.jersey_number into jersey from public.heat_camp_2027_available_jersey_numbers('production') p
 join public.heat_camp_2027_available_jersey_numbers('test') t using(jersey_number) limit 1;
 payload:=jsonb_build_object('payment_environment','production','player_name','自動驗證不留存','guardian_name','驗證家長','guardian_phone','0912345678','email','verification@example.invalid','national_id','A123456789','postal_code','428','receipt_address','驗證地址','birthday','2012-01-01','school_stage','junior_high','school_name','','line_id','','height_cm','160','weight_kg','55','jersey_size','M','jersey_number',jersey,'jersey_name','VERIFY','medical_status','none','medical_notes','','emergency_name','驗證','emergency_phone','0912345678','dietary_need','none','refund_consent',true,'receipt_consent',true,'donor_name','驗證','receipt_title','驗證','pricing_mode','standard');
 r:=public.heat_camp_2027_create_registration(rid,payload,first_order);
 if r->>'status'<>'awaiting_payment' then raise exception 'test_create_failed'; end if;
 amount_value:=(r->>'amount')::integer;
 if not exists(select 1 from camp_registration.registrations where id=(r->>'id')::uuid and payment_environment='production' and refund_consent_at is not null and line_id='' and school_name='') then raise exception 'test_fields_failed'; end if;
 passed:=array_append(passed,'production create and consent');
 x:=public.heat_camp_2027_create_registration(rid,payload,retry_order);
 if x->>'id'<>r->>'id' then raise exception 'test_idempotence_failed'; end if;
 passed:=array_append(passed,'same request preserves registration');
 begin
 perform public.heat_camp_2027_create_registration(rid,payload||'{"player_name":"different"}'::jsonb,retry_order);
 exception when others then if sqlerrm='request_registration_mismatch' then expected:=true; else raise; end if; end;
 if not expected then raise exception 'test_identity_guard_failed'; end if;
 passed:=array_append(passed,'different applicant cannot reuse request');
 expected:=false;
 begin
 perform public.heat_camp_2027_create_registration(dupid,payload,dup_order);
 exception when others then if sqlerrm='jersey_or_order_unavailable' then expected:=true; else raise; end if; end;
 if not expected then raise exception 'test_jersey_guard_failed'; end if;
 t:=public.heat_camp_2027_create_registration(tid,payload||'{"payment_environment":"test"}'::jsonb,test_order);
 if t->>'id'=r->>'id' then raise exception 'test_environment_failed'; end if;
 passed:=array_append(passed,'jersey uniqueness within environment and reuse across environments');
 expected:=false;
 begin
 perform public.heat_camp_2027_record_payment(first_order,'V'||first_order,true,jsonb_build_object('_environment','test','Status','SUCCESS','Amt',amount_value));
 exception when others then if sqlerrm='payment_environment_mismatch' then expected:=true; else raise; end if; end;
 if not expected then raise exception 'test_callback_environment_failed'; end if;
 passed:=array_append(passed,'callback environment mismatch rejected');
 expected:=false;
 begin
 perform public.heat_camp_2027_record_payment(first_order,'V'||first_order,true,jsonb_build_object('_environment','production','Status','SUCCESS','Amt',amount_value+1));
 exception when others then if sqlerrm='amount_mismatch' then expected:=true; else raise; end if; end;
 if not expected then raise exception 'test_amount_guard_failed'; end if;
 passed:=array_append(passed,'incorrect callback amount rejected');
 perform public.heat_camp_2027_record_payment(first_order,'V'||first_order,false,'{"_environment":"production","Status":"FAIL"}'::jsonb);
 x:=public.heat_camp_2027_prepare_checkout(rid,'production',retry_order);
 if x->>'id'<>r->>'id' or x->>'merchant_order_no'<>retry_order then raise exception 'test_retry_failed'; end if;
 select count(*) into n from camp_registration.registrations where request_id=rid;
 if n<>1 then raise exception 'test_duplicate_registration'; end if;
 x:=public.heat_camp_2027_prepare_checkout(rid,'production',dup_order);
 if x->>'merchant_order_no'<>retry_order then raise exception 'test_duplicate_order'; end if;
 passed:=array_append(passed,'failed payment retries original registration with one live order');
 perform public.heat_camp_2027_record_payment(retry_order,'V'||retry_order,true,jsonb_build_object('_environment','production','Status','SUCCESS','Amt',amount_value));
 x:=public.heat_camp_2027_prepare_checkout(rid,'production',dup_order);
 if x->>'status'<>'paid' then raise exception 'test_paid_retry_failed'; end if;
 perform public.heat_camp_2027_record_payment(retry_order,'V'||retry_order,true,jsonb_build_object('_environment','production','Status','SUCCESS','Amt',amount_value));
 select count(*) into n from camp_registration.eoffering_sync where registration_id=(r->>'id')::uuid;
 if n<>1 then raise exception 'test_receipt_idempotence_failed'; end if;
 passed:=array_append(passed,'paid blocks new checkout and duplicate receipt');
 x:=public.heat_camp_2027_record_payment(retry_order,'V'||retry_order,false,'{"_environment":"production","Status":"FAIL"}'::jsonb);
 if x->>'status'<>'paid' or not exists(select 1 from camp_registration.payment_orders where merchant_order_no=retry_order and status='paid') then raise exception 'test_late_failure_failed'; end if;
 passed:=array_append(passed,'late failure preserves paid status');
 perform public.heat_camp_2027_record_payment(test_order,'V'||test_order,true,jsonb_build_object('_environment','test','Status','SUCCESS','Amt',amount_value));
 if exists(select 1 from camp_registration.eoffering_sync where registration_id=(t->>'id')::uuid) then raise exception 'test_test_receipt_failed'; end if;
 passed:=array_append(passed,'sandbox payment creates no receipt');
 raise exception 'verification rollback' using errcode='P0002';
 exception when no_data_found then
 if array_length(passed,1)<>10 then raise exception 'incomplete_verification'; end if;
 end;
 select count(*) into after_count from camp_registration.registrations;
 if before_count<>after_count or exists(select 1 from camp_registration.registrations where request_id in(rid,tid,dupid)) then raise exception 'test_rollback_failed'; end if;
 perform set_config('camp.verification_results',jsonb_build_object('passed',array_length(passed,1),'cases',passed,'rolled_back',true,'registrations_before',before_count,'registrations_after',after_count)::text,true);
end $test$;
select current_setting('camp.verification_results')::jsonb verification;