begin;
-- All synthetic data, codes and schema changes in this preflight are rolled back.
do $test$
declare e uuid; rule_id uuid; onsite_rule uuid; token_id uuid; j integer; req uuid:=gen_random_uuid(); p jsonb; a jsonb; b jsonb; test_code text:='NH-TRANSACTION-TEST-ONLY'; n integer;
begin
 select id into e from camp_registration.events where slug='heat-basketball-camp-2027';
 select id into rule_id from camp_registration.price_rules where event_id=e and code='newhope';
 select id into onsite_rule from camp_registration.price_rules where event_id=e and code='onsite_2026';
 select jersey_number into j from public.heat_camp_2027_available_jersey_numbers('test') limit 1;
 if j is null then raise exception 'TEST_no_test_jersey'; end if;
 p:='{"line_id":"","donor_name":"","receipt_title":"","receipt_id":"","care_notes":"","medical_notes":"","emergency_name":"","emergency_phone":"","dietary_need":""}'::jsonb || jsonb_build_object('player_name','合成學員','guardian_name','合成家長','guardian_phone','0900000000','email','synthetic@example.invalid','national_id','A100000000','postal_code','400','receipt_address','隔離測試地址','birthday','2012-01-01','school_stage','junior_high','school_name','合成學校','height_cm',160,'weight_kg',55,'jersey_size','M','jersey_number',j,'jersey_name','TEST','medical_status','none','insurance_consent',true,'privacy_consent',true,'truth_consent',true,'refund_consent',true,'no_receipt',true,'pricing_mode','newhope','payment_environment','test','sponsorship_code',test_code);
 insert into camp_registration.promotion_tokens(event_id,price_rule_id,token_hash,label,max_uses,payment_environment,expires_at) values(e,rule_id,encode(extensions.digest(test_code,'sha256'),'hex'),'SYNTHETIC TRANSACTION ONLY',1,'test',now()+interval '1 day') returning id into token_id;
 a:=public.heat_camp_2027_create_registration(req,p,'HB27TEST00000001');
 if a->>'status'<>'sponsored' or (a->>'amount')::int<>0 then raise exception 'TEST_sponsor_state'; end if;
 if not exists(select 1 from camp_registration.registrations where id=(a->>'id')::uuid and sponsorship_token_id=token_id and paid_at is null and national_id_ciphertext<>'A100000000') then raise exception 'TEST_encryption_or_source'; end if;
 if exists(select 1 from camp_registration.payment_orders where registration_id=(a->>'id')::uuid) or exists(select 1 from camp_registration.eoffering_sync where registration_id=(a->>'id')::uuid) then raise exception 'TEST_no_financial_side_effects'; end if;
 if exists(select 1 from public.heat_camp_2027_available_jersey_numbers('test') where jersey_number=j) then raise exception 'TEST_reserved_jersey'; end if;
 b:=public.heat_camp_2027_create_registration(req,p,'HB27TEST00000002');
 if a->>'id'<>b->>'id' or (select used_count from camp_registration.promotion_tokens where id=token_id)<>1 then raise exception 'TEST_idempotency'; end if;
 begin perform public.heat_camp_2027_create_registration(gen_random_uuid(),p,'HB27TEST00000003');raise exception 'TEST_missing_used_rejection';exception when others then if sqlerrm<>'sponsorship_code_used' then raise;end if;end;
 begin perform public.heat_camp_2027_create_registration(gen_random_uuid(),p||'{"sponsorship_code":"NH-INVALID-NOT-A-CODE"}', 'HB27TEST00000004');raise exception 'TEST_missing_invalid_rejection';exception when others then if sqlerrm<>'sponsorship_verification_failed' then raise;end if;end;
 begin perform public.heat_camp_2027_create_registration(req,p||'{"pricing_mode":"standard"}','HB27TEST00000005');raise exception 'TEST_missing_mode_rejection';exception when others then if sqlerrm<>'request_registration_mismatch' then raise;end if;end;
 -- Expired, inactive, wrong-environment and wrong-project codes cannot be redeemed.
 for n in 1..4 loop
  insert into camp_registration.promotion_tokens(event_id,price_rule_id,token_hash,label,max_uses,payment_environment,expires_at,active)
  values(e,case when n=4 then onsite_rule else rule_id end,encode(extensions.digest('NH-REJECT-TEST-'||n,'sha256'),'hex'),'SYNTHETIC',1,case when n=3 then 'production' else 'test' end,case when n=1 then now()-interval '1 second' else now()+interval '1 day' end,n<>2);
  begin perform public.heat_camp_2027_create_registration(gen_random_uuid(),p||jsonb_build_object('sponsorship_code','NH-REJECT-TEST-'||n),'HB27TEST00000006');raise exception 'TEST_missing_invalid_token_rejection';exception when others then if sqlerrm<>'sponsorship_verification_failed' then raise;end if;end;
 end loop;
 -- A fresh code cannot claim an occupied jersey, and failure does not consume it.
 insert into camp_registration.promotion_tokens(event_id,price_rule_id,token_hash,label,max_uses,payment_environment) values(e,rule_id,encode(extensions.digest('NH-JERSEY-TEST','sha256'),'hex'),'SYNTHETIC',1,'test');
 begin perform public.heat_camp_2027_create_registration(gen_random_uuid(),p||'{"sponsorship_code":"NH-JERSEY-TEST"}','HB27TEST00000007');raise exception 'TEST_missing_jersey_rejection';exception when others then if sqlerrm<>'jersey_or_order_unavailable' then raise;end if;end;
 if (select used_count from camp_registration.promotion_tokens where token_hash=encode(extensions.digest('NH-JERSEY-TEST','sha256'),'hex'))<>0 then raise exception 'TEST_failed_redemption_consumed';end if;
 select jersey_number into j from public.heat_camp_2027_available_jersey_numbers('test') limit 1;
 b:=public.heat_camp_2027_create_registration(gen_random_uuid(),p||jsonb_build_object('pricing_mode','standard','jersey_number',j),'HB27TEST00000008');
 if b->>'status'<>'awaiting_payment' or (b->>'amount')::int<=0 then raise exception 'TEST_standard_regression';end if;
 select jersey_number into j from public.heat_camp_2027_available_jersey_numbers('test') limit 1;
 insert into camp_registration.promotion_tokens(event_id,price_rule_id,token_hash,label,max_uses,payment_environment,payment_confirmed_at,payment_reference) values(e,onsite_rule,encode(extensions.digest('ONSITE-TEST-ONLY','sha256'),'hex'),'SYNTHETIC',1,'test',now(),'SYNTHETIC');
 b:=public.heat_camp_2027_create_registration(gen_random_uuid(),p||jsonb_build_object('pricing_mode','onsite','onsite_code','ONSITE-TEST-ONLY','jersey_number',j),'HB27TEST00000009');
 if b->>'status'<>'paid' or (b->>'amount')::int<>6000 then raise exception 'TEST_onsite_regression';end if;
 begin perform public.heat_camp_2027_prepare_checkout(req,'test','HB27TEST00000010');raise exception 'TEST_missing_payment_rejection';exception when others then if sqlerrm<>'payment_retry_unavailable' then raise;end if;end;
 begin perform camp_registration.issue_receipt(a->>'registration_no',null);raise exception 'TEST_missing_receipt_rejection';exception when others then if sqlerrm<>'paid_production_required' then raise;end if;end;
 -- Authorized staff can issue distinct single-use codes, and labels stay separate from payments.
 declare owner_id uuid; issued jsonb; detail jsonb; list_data jsonb;
 begin
 select user_id into owner_id from church_auth.owners where exists(select 1 from church_auth.accounts a where a.user_id=church_auth.owners.user_id and a.is_active) limit 1;
 if owner_id is null then raise exception 'TEST_owner_fixture_unavailable';end if;
 issued:=public.heat_camp_2027_issue_newhope_codes(owner_id,2);
 if jsonb_array_length(issued->'codes')<>2 or (issued->>'max_uses')::int<>1 or issued->'codes'->>0=issued->'codes'->>1 then raise exception 'TEST_issuance';end if;
 detail:=public.heat_camp_2027_admin_details(owner_id,a->>'registration_no');
 if detail->'payment'->>'payment_status'<>'sponsored' or detail->'registration'->>'registration_status'<>'sponsored' then raise exception 'TEST_admin_detail';end if;
 list_data:=public.heat_camp_2027_admin_list(owner_id,'view',a->>'registration_no','sponsored','sponsored',50,0);
 if jsonb_array_length(list_data->'items')<>1 or list_data->'items'->0->>'payment_status'<>'sponsored' then raise exception 'TEST_admin_filter';end if;
 begin perform public.heat_camp_2027_issue_newhope_codes(owner_id,101);raise exception 'TEST_missing_count_limit';exception when others then if sqlerrm<>'invalid_count' then raise;end if;end;
 end;
 -- A project enrolment consumes a real camp place.
 update camp_registration.events set capacity=1 where id=e;
 begin perform public.heat_camp_2027_create_registration(gen_random_uuid(),p||jsonb_build_object('pricing_mode','standard','jersey_number',99),'HB27TEST00000011');raise exception 'TEST_missing_capacity_guard';exception when others then if sqlerrm<>'camp_full' then raise;end if;end;
 begin perform public.heat_camp_2027_issue_newhope_codes(gen_random_uuid(),1);raise exception 'TEST_missing_permission_rejection';exception when others then if sqlerrm<>'forbidden' then raise;end if;end;
 if has_function_privilege('anon','public.heat_camp_2027_issue_newhope_codes(uuid,integer)','EXECUTE') or has_function_privilege('authenticated','public.heat_camp_2027_create_registration(uuid,jsonb,text)','EXECUTE') then raise exception 'TEST_public_privileged_rpc';end if;
end $test$;
select 'passed' as status,'sponsor, encryption, no financial order, jersey, idempotency, used/invalid/expired/inactive/environment/project, failure rollback, standard, onsite, payment guard, receipt guard, authorization' as checks;

rollback;
