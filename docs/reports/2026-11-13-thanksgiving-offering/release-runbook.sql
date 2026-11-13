-- LINE-only campaign release runbook. Public intake stays disabled until delivery and device acceptance.
-- Phase A: apply the additive migration and deploy the new Edge, intake remains disabled.
-- No existing schema/table/role/Edge is replaced.

-- Phase B: privately configure the already verified pastor destination and worker secret.
-- This is a one-time operation by an authorized operator, after checking existing cron/vault names.
begin;
do $setup$
declare staff uuid;worker text;
begin
 select s.id into strict staff from public.pastoral_staff s
 where s.display_name='吳俊璋' and s.is_active
 and exists(select 1 from auth.identities i where i.user_id=church_auth.canonical_account(s.app_user_id) and i.provider='custom:line-web' and i.identity_data->>'sub'=s.line_subject);
 worker:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 if exists(select 1 from vault.secrets where name='thanksgiving_offering_worker_key')then raise exception 'worker_already_configured';end if;
 perform vault.create_secret(worker,'thanksgiving_offering_worker_key','Private thanksgiving outbox worker authentication');
 update offering_response.settings set recipient_staff_id=staff,worker_hash=encode(sha256(convert_to(worker,'UTF8')),'hex'),enabled=false where id;
end $setup$;
commit;

-- Uses the existing LINE channel token only; no SMTP secret or Auth change is required.

-- Phase C: a service-only synthetic intake (is_test=true) then manual dispatch.
-- Verify response/outbox transaction and actual service-role privileges first.
-- Trigger worker without returning its key:
select net.http_post(
 url:='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/thanksgiving-offering-response',
 headers:=jsonb_build_object('content-type','application/json','x-offering-worker-key',
  (select decrypted_secret from vault.decrypted_secrets where name='thanksgiving_offering_worker_key')),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
-- Read net response and private LINE delivery row; keep the provider acceptance ID.
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
-- Enable intake through the owner admin API only after a synthetic response has one sent private LINE row for the current verified recipient.
-- Then configure the frontend endpoint, publish PR #316, verify live hashes and actual page behavior.

-- Emergency pause (retain data):
-- update offering_response.settings set enabled=false where id;
-- select cron.alter_job(jobid,active:=false) from cron.job where jobname='thanksgiving-offering-dispatch';
