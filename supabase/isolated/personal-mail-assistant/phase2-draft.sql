-- ISOLATED REVIEW DRAFT, NOT A MIGRATION. Do not run on the Church OS project.
-- The test harness wraps this in a transaction, using synthetic identities only.
-- OAuth, credentials, mail bodies, AI, Cron and push delivery are intentionally absent.
DO $$ BEGIN
  IF current_setting('personal_mail.isolated_setup', true) IS DISTINCT FROM 'enabled' THEN
    RAISE EXCEPTION 'isolated_test_only' USING ERRCODE='42501';
  END IF;
END $$;
CREATE SCHEMA personal_mail;
REVOKE ALL ON SCHEMA personal_mail FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA personal_mail TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA personal_mail REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE personal_mail.module_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO personal_mail.module_settings(singleton,enabled) VALUES(true,false);
CREATE TABLE personal_mail.pilot_access (
  owner_id uuid PRIMARY KEY REFERENCES public.pastoral_staff(id),
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE personal_mail.preferences (
  owner_id uuid PRIMARY KEY REFERENCES public.pastoral_staff(id),
  notify_time time(0) NOT NULL DEFAULT '07:00',
  timezone text NOT NULL DEFAULT 'Asia/Taipei' CHECK (timezone='Asia/Taipei'),
  delivery_enabled boolean NOT NULL DEFAULT false CHECK (delivery_enabled=false),
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE personal_mail.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.pastoral_staff(id),
  provider text NOT NULL CHECK (provider IN ('gmail','icloud')),
  provider_subject text NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 512),
  email text NOT NULL CHECK (length(email)<=254 AND email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
  status text NOT NULL DEFAULT 'reconnect' CHECK (status IN ('connected','reconnect','paused','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,provider,provider_subject)
);
CREATE INDEX personal_mail_accounts_owner_page ON personal_mail.accounts(owner_id,id);
ALTER TABLE personal_mail.module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_mail.pilot_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_mail.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_mail.accounts ENABLE ROW LEVEL SECURITY;
-- No direct-client policies or table grants: default-deny RLS. Checked RPCs below
-- are the only API. SECURITY DEFINER functions MUST retain explicit owner filters.
REVOKE ALL ON ALL TABLES IN SCHEMA personal_mail FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION personal_mail.require_owner() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  caller uuid := auth.uid();
  claims jsonb := auth.jwt();
  session_text text := claims->>'session_id';
  root_user uuid;
  owners uuid[];
  owner uuid;
BEGIN
  IF caller IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR coalesce(claims->>'is_anonymous','false') <> 'false'
    OR session_text IS NULL OR session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE='28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=session_text::uuid
      AND s.user_id=caller AND (s.not_after IS NULL OR s.not_after>now())) THEN
    RAISE EXCEPTION 'login_required' USING ERRCODE='28000';
  END IF;
  root_user := church_auth.canonical_account(caller);
  IF NOT EXISTS (SELECT 1 FROM church_auth.accounts a WHERE a.user_id=caller AND a.is_active)
    OR NOT EXISTS (SELECT 1 FROM church_auth.accounts a WHERE a.user_id=root_user AND a.is_active) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
  SELECT array_agg(s.id ORDER BY s.id) INTO owners
    FROM public.pastoral_staff s JOIN church_auth.accounts a ON a.user_id=s.app_user_id
    WHERE s.is_active AND a.is_active
      AND a.user_id IN (SELECT church_auth.account_users(caller));
  -- Do not guess between duplicate active staff records or match by name/email.
  IF coalesce(cardinality(owners),0)<>1 THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
  owner := owners[1];
  IF NOT EXISTS (SELECT 1 FROM personal_mail.module_settings m WHERE m.singleton AND m.enabled)
    OR NOT EXISTS (SELECT 1 FROM public.pastoral_staff_access a
       WHERE a.staff_id=owner AND a.entity_key IN ('mplus','tcsc'))
    OR NOT EXISTS (SELECT 1 FROM personal_mail.pilot_access p WHERE p.owner_id=owner AND p.enabled) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE='42501';
  END IF;
  RETURN owner;
END $$;
REVOKE ALL ON FUNCTION personal_mail.require_owner() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION personal_mail.api_state(p_after uuid,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  owner uuid := personal_mail.require_owner();
  prefs personal_mail.preferences%ROWTYPE;
  rows jsonb; more boolean; next_id text; total bigint; line_present boolean;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
  END IF;
  SELECT * INTO prefs FROM personal_mail.preferences p WHERE p.owner_id=owner;
  SELECT count(*) INTO total FROM personal_mail.accounts a WHERE a.owner_id=owner;
  WITH page AS MATERIALIZED (
    SELECT a.id,a.provider,a.email,a.status FROM personal_mail.accounts a
    WHERE a.owner_id=owner AND (p_after IS NULL OR a.id>p_after) ORDER BY a.id LIMIT p_limit+1
  ), visible AS (SELECT * FROM page ORDER BY id LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM visible v),'[]'::jsonb),
    (SELECT count(*)>p_limit FROM page),
    (SELECT v.id::text FROM visible v ORDER BY v.id DESC LIMIT 1)
    INTO rows,more,next_id;
  SELECT coalesce(s.line_subject ~* '^U[0-9a-f]{32}$',false) INTO line_present
    FROM public.pastoral_staff s WHERE s.id=owner AND s.is_active;
  RETURN jsonb_build_object('ok',true,
    'settings',jsonb_build_object('time',coalesce(to_char(prefs.notify_time,'HH24:MI'),'07:00'),
      'timezone','Asia/Taipei','deliveryEnabled',false,'revision',coalesce(prefs.revision,0)),
    'accounts',rows,
    'pagination',jsonb_build_object('total',total,'hasMore',more,'nextCursor',CASE WHEN more THEN next_id ELSE NULL END),
    'line',jsonb_build_object('status',CASE WHEN line_present THEN 'needs_verification' ELSE 'missing' END));
END $$;

CREATE FUNCTION personal_mail.api_set_time(p_time text,p_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid := personal_mail.require_owner(); prefs personal_mail.preferences%ROWTYPE;
BEGIN
  IF p_time IS NULL OR p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 2147483646 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
  END IF;
  INSERT INTO personal_mail.preferences(owner_id) VALUES(owner) ON CONFLICT(owner_id) DO NOTHING;
  UPDATE personal_mail.preferences p SET notify_time=p_time::time,revision=p.revision+1,updated_at=now()
    WHERE p.owner_id=owner AND p.revision=p_expected_revision RETURNING * INTO prefs;
  IF NOT FOUND THEN RAISE EXCEPTION 'settings_changed_reload' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('ok',true,'settings',jsonb_build_object('time',to_char(prefs.notify_time,'HH24:MI'),
    'timezone','Asia/Taipei','deliveryEnabled',false,'revision',prefs.revision));
END $$;

CREATE FUNCTION personal_mail.api_pause_account(p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid := personal_mail.require_owner(); changed uuid;
BEGIN
  IF p_account IS NULL THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023'; END IF;
  UPDATE personal_mail.accounts a SET status='paused',updated_at=now()
    WHERE a.id=p_account AND a.owner_id=owner RETURNING a.id INTO changed;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found' USING ERRCODE='P0002'; END IF;
  -- No work queue exists in this phase. Before adding a worker, cancellation and
  -- just-in-time account/owner checks must be implemented and tested atomically.
  RETURN jsonb_build_object('ok',true,'account',jsonb_build_object('id',changed,'status','paused'));
END $$;

REVOKE ALL ON FUNCTION personal_mail.api_state(uuid,integer),personal_mail.api_set_time(text,integer),
  personal_mail.api_pause_account(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION personal_mail.api_state(uuid,integer),personal_mail.api_set_time(text,integer),
  personal_mail.api_pause_account(uuid) TO authenticated;

-- Public wrappers are invokers, not definer endpoints. No owner or recipient arg.
CREATE FUNCTION public.personal_mail_get_state(p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT personal_mail.api_state(p_after,p_limit);
$$;
CREATE FUNCTION public.personal_mail_set_time(p_time text,p_expected_revision integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT personal_mail.api_set_time(p_time,p_expected_revision);
$$;
CREATE FUNCTION public.personal_mail_pause_account(p_account uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT personal_mail.api_pause_account(p_account);
$$;
REVOKE ALL ON FUNCTION public.personal_mail_get_state(uuid,integer),public.personal_mail_set_time(text,integer),
  public.personal_mail_pause_account(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.personal_mail_get_state(uuid,integer),public.personal_mail_set_time(text,integer),
  public.personal_mail_pause_account(uuid) TO authenticated;
