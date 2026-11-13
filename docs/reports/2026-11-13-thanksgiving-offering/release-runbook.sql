-- Review-only release runbook. DO NOT execute before SMTP reuse, delivery and device acceptance.
-- Phase A: apply the additive migration and deploy the new Edge, intake remains disabled.
-- No existing schema/table/role/Edge is replaced.

-- Phase B: privately configure the already verified pastor destination and worker secret.
-- This is a one-time operation by an authorized operator, after checking existing cron/vault names.
begin;
do $setup$
declare staff uuid;mail text;worker text;
begin
 select s.id,u.email into strict staff,mail from public.pastoral_staff s
 join auth.users u on u.id=church_auth.canonical_account(s.app_user_id)
 where s.display_name='吳俊璋' and s.is_active and u.email_confirmed_at is not null;
 worker:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 if exists(select 1 from vault.secrets where name='thanksgiving_offering_worker_key')then raise exception 'worker_already_configured';end if;
 perform vault.create_secret(worker,'thanksgiving_offering_worker_key','Private thanksgiving outbox worker authentication');
 update offering_response.settings set recipient_staff_id=staff,recipient_email=mail,worker_hash=encode(sha256(convert_to(worker,'UTF8')),'hex'),enabled=false where id;
end $setup$;
commit;

-- Configure OFFERING_SMTP_USER / OFFERING_SMTP_PASSWORD / optional OFFERING_SMTP_HOST,
-- OFFERING_SMTP_FROM from the existing approved SMTP in the secure settings UI/Management API.
-- Never put a password into this SQL file, GitHub, terminal arguments, chat or logs.

-- Phase C: a service-only synthetic intake (is_test=true) then manual dispatch.
-- Verify response/outbox transaction and actual service-role privileges first.
-- Trigger worker without returning its key:
select net.http_post(
 url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/thanksgiving-offering-response',
 headers:=jsonb_build_object('content-type','application/json','x-offering-worker-key',
  (select decrypted_secret from vault.decrypted_secrets where name='thanksgiving_offering_worker_key')),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
-- Read net response and independent private deliveries rows; confirm the Email in the real inbox.
-- DO NOT mark delivery sent by hand to bypass the acceptance gate.

-- Phase D: only after human acceptance, create this feature's dedicated cron.
-- Keep all existing jobs untouched. Claim leases make overlapping dispatch safe.
select cron.schedule('thanksgiving-offering-dispatch','* * * * *',$job$
 select net.http_post(
  url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/thanksgiving-offering-response',
  headers:=jsonb_build_object('content-type','application/json','x-offering-worker-key',
   (select decrypted_secret from vault.decrypted_secrets where name='thanksgiving_offering_worker_key')),
  body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
-- Enable intake through the owner admin API only after a synthetic response has two sent rows.
-- Then configure the frontend endpoint, publish PR #316, verify live hashes and actual page behavior.

-- Emergency pause (retain data):
-- update offering_response.settings set enabled=false where id;
-- select cron.alter_job(jobid,active:=false) from cron.job where jobname='thanksgiving-offering-dispatch';
