UPDATE personal_mail.module_settings SET enabled=true;
INSERT INTO personal_mail.pilot_access SELECT id,true FROM public.pastoral_staff;
INSERT INTO personal_mail.accounts(id,owner_id,provider,provider_subject,email,status) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','gmail','a-google','a@example.invalid','connected'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','icloud','a-apple','apple@example.invalid','reconnect'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','gmail','b-google','b@example.invalid','connected');
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","session_id":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.personal_mail_get_state(null,1);
 IF r#>>'{pagination,total}' <> '2' OR r#>>'{pagination,hasMore}' <> 'true'
   OR r#>>'{accounts,0,email}' <> 'a@example.invalid' OR r#>>'{settings,time}' <> '07:00'
   OR r#>>'{settings,deliveryEnabled}' <> 'false' THEN RAISE EXCEPTION 'own_state_failed'; END IF;
 r:=public.personal_mail_get_state((r#>>'{pagination,nextCursor}')::uuid,1);
 IF r#>>'{accounts,0,email}' <> 'apple@example.invalid' OR r#>>'{pagination,hasMore}' <> 'false' THEN RAISE EXCEPTION 'pagination_failed'; END IF;
 r:=public.personal_mail_set_time('08:15',0);
 IF r#>>'{settings,revision}' <> '1' THEN RAISE EXCEPTION 'revision_failed'; END IF;
 BEGIN PERFORM public.personal_mail_set_time('09:00',0); RAISE EXCEPTION 'stale_write_accepted'; EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 BEGIN PERFORM public.personal_mail_set_time('24:00',1); RAISE EXCEPTION 'invalid_time_accepted'; EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN PERFORM public.personal_mail_pause_account('30000000-0000-4000-8000-000000000003'); RAISE EXCEPTION 'cross_owner_write_accepted'; EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
 PERFORM public.personal_mail_pause_account('30000000-0000-4000-8000-000000000001');
 PERFORM public.personal_mail_pause_account('30000000-0000-4000-8000-000000000001');
 BEGIN PERFORM 1 FROM personal_mail.accounts; RAISE EXCEPTION 'direct_read_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE personal_mail.preferences SET delivery_enabled=true; RAISE EXCEPTION 'direct_write_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"role":"admin","ownerId":"20000000-0000-4000-8000-000000000001"}}';
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.personal_mail_get_state();
 IF r#>>'{pagination,total}' <> '1' OR r#>>'{accounts,0,email}' <> 'b@example.invalid' OR r#>>'{accounts,0,status}' <> 'connected' THEN RAISE EXCEPTION 'cross_owner_read'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000003","session_id":"40000000-0000-4000-8000-000000000003","role":"authenticated"}';
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.personal_mail_get_state();
 IF r#>>'{pagination,total}' <> '2' OR r#>>'{settings,time}' <> '08:15' THEN RAISE EXCEPTION 'alias_owner_failed'; END IF;
END $$;
RESET ROLE;
-- Ambiguous historical staff mappings must fail rather than select one by name.
INSERT INTO public.pastoral_staff VALUES('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',true,null);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.personal_mail_get_state(); RAISE EXCEPTION 'ambiguous_owner_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM public.pastoral_staff WHERE id='20000000-0000-4000-8000-000000000003';
UPDATE personal_mail.pilot_access SET enabled=false WHERE owner_id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.personal_mail_get_state(); RAISE EXCEPTION 'disabled_pilot_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE personal_mail.pilot_access SET enabled=true;
UPDATE personal_mail.module_settings SET enabled=false;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.personal_mail_get_state(); RAISE EXCEPTION 'disabled_module_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE personal_mail.module_settings SET enabled=true;
UPDATE public.pastoral_staff SET is_active=false WHERE id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.personal_mail_get_state(); RAISE EXCEPTION 'inactive_staff_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.pastoral_staff SET is_active=true;
DELETE FROM auth.sessions WHERE id='40000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.personal_mail_get_state(); RAISE EXCEPTION 'revoked_session_allowed'; EXCEPTION WHEN SQLSTATE '28000' THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.personal_mail_get_state(); RAISE EXCEPTION 'anon_rpc_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 BEGIN PERFORM public.personal_mail_get_state(); RAISE EXCEPTION 'service_rpc_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'isolated assertions completed; rolling back all fixture changes' AS result;
