-- Synthetic-only fixture for a NEW, EMPTY local PostgreSQL database.
DO $$ BEGIN
 IF to_regnamespace('auth') IS NOT NULL OR to_regnamespace('church_auth') IS NOT NULL
   OR to_regnamespace('personal_mail') IS NOT NULL OR to_regclass('public.pastoral_staff') IS NOT NULL THEN
   RAISE EXCEPTION 'refuse_nonempty_database';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA church_auth;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE TABLE church_auth.accounts(user_id uuid PRIMARY KEY,is_active boolean NOT NULL);
CREATE TABLE church_auth.account_identity_links(alias_user_id uuid PRIMARY KEY,canonical_user_id uuid NOT NULL);
CREATE FUNCTION church_auth.canonical_account(p_user uuid) RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT canonical_user_id FROM church_auth.account_identity_links WHERE alias_user_id=p_user),p_user);
$$;
CREATE FUNCTION church_auth.account_users(p_user uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path='' AS $$
 WITH root AS (SELECT church_auth.canonical_account(p_user) AS user_id WHERE EXISTS(SELECT 1 FROM church_auth.accounts a WHERE a.user_id=p_user)),
 linked AS (SELECT user_id FROM root UNION SELECT l.alias_user_id FROM root JOIN church_auth.account_identity_links l ON l.canonical_user_id=root.user_id)
 SELECT a.user_id FROM linked JOIN church_auth.accounts a ON a.user_id=linked.user_id;
$$;
CREATE TABLE public.pastoral_staff(id uuid PRIMARY KEY,app_user_id uuid UNIQUE,is_active boolean NOT NULL,line_subject text);
CREATE TABLE public.pastoral_staff_access(staff_id uuid,entity_key text,PRIMARY KEY(staff_id,entity_key));
INSERT INTO church_auth.accounts VALUES
 ('10000000-0000-4000-8000-000000000001',true),('10000000-0000-4000-8000-000000000002',true),('10000000-0000-4000-8000-000000000003',true);
INSERT INTO church_auth.account_identity_links VALUES('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');
INSERT INTO auth.sessions VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',null),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',null);
INSERT INTO public.pastoral_staff VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true,'U00000000000000000000000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true,null);
INSERT INTO public.pastoral_staff_access VALUES
 ('20000000-0000-4000-8000-000000000001','mplus'),('20000000-0000-4000-8000-000000000002','mplus');
