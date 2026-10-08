# Database

## Platform and project

- Database: Supabase Postgres.
- The configured project uses an earlier “staging” identifier while serving the active Church OS; do not infer that its data is disposable.
- This document intentionally excludes credentials, tokens, and connection strings.

## Main schemas and tables

- `church_auth`: `accounts`, `owners`, `grants`, `account_roles`, `account_feature_permissions`, and `account_home_preferences` support administrator identities, church grants, feature actions, and dashboard preferences.
- `public`: shared application tables and RPCs. Representative areas include members, groups, attendance, schedules, notifications, and inventory.
- `public.app_notifications` records notification-center items and background push delivery state (`push_sent_at`, attempt count, and a non-secret last error). Existing producers remain opt-in for queued delivery; the delivery worker processes rows whose `push_sent_at` is null.
- `camp_registration`: `events`, `registrations`, `payment_orders`, `receipt_profiles`, `eoffering_sync`, and `audit_log` support the independent camp registration and payment workflow.
- Daily devotionals: migration `20261008090000_daily_devotional_2027_mvp` adds `daily_devotionals`, private LINE-member progress in `daily_devotional_progress`, and the append-only `daily_devotional_reviews` audit trail. A follow-up migration defines the fixed reviewer assignment: 鈺庭初審、師母複審、牧師終審。
- Sunday service signup uses `service_signup_seasons`, `service_signup_slots`, and `service_signup_registrations`. Migration file `20261009052000_service_signup_batch_registration` (applied version `20261008171831`) adds the service-role-only `service_signup_register_batch` RPC for required typed-name verification and atomic multi-date registration. It does not alter existing rows or RLS.
- In-season cancellation and adjustment requests use `service_signup_change_requests`. `church_auth.service_signup_final_reviewers` defines the final administrative reviewers; leader access continues to use `service_ministry_scopes`. Request records are private and exposed only through identity-checked RPCs.
- `review_workflow_settings` centralizes initial/final reviewer selection and App/LINE notification preferences for multi-stage workflows. Direct browser table access is revoked; authenticated management RPCs verify notification-settings permission and reject LINE delivery when a selected account lacks a verified LINE identity.

## Relationships

- Camp registrations belong to an event and may have payment orders, a receipt profile, and one receipt synchronization record.
- `payment_orders.registration_id` and other camp foreign keys use restrictive deletion where deleting a record could invalidate payment or receipt history.
- The camp schema is separate from the basketball team roster.

## Migrations

- Database changes are tracked as timestamped SQL in `supabase/migrations/` and applied in version order using Supabase migration tooling.
- Generate migrations with `supabase migration new <name>`; review the SQL and migration status before any apply/push.
- Do not edit or apply a production migration without reviewing its scope and backup/rollback plan.
- Heat Camp admin detail/edit migration `heat_camp_admin_details_edit` was applied as version `20261007035411`; it adds two RPCs and does not change registration/payment rows.

## RLS and authorization

- Church data access is based on authenticated user identity, `church_auth.grants`, role assignments, and feature-level action settings.
- Owner-only RPCs `get_line_admin_access_review` and `approve_line_admin_access_review` support explicit LINE identity matching. Approval replaces only the selected LINE Auth user's access rows with the chosen existing administrator's grants, role, feature actions, and home preferences.
- Camp data resides in a private schema and is accessed through service-role-only RPCs. The `heat-camp-admin` Edge Function verifies the bearer token and the RPC checks active account, `heat_camp` grant, and feature permissions. Detail access logs every view; identity/health decryption and edits require owner or explicit `can_manage`. Payment status, payment method, amount, and bank/order information are not in the edit allowlist. Anonymous and authenticated roles cannot execute these RPCs directly.
- Service-role credentials must never be shipped to browser code.
- Devotional tables revoke direct `anon` and `authenticated` access. Edge Functions verify either LINE identity or a Church OS session before using server-side access. Final approval requires a different reviewer from initial review and complete scripture licensing metadata.

## Safe change practices

- Keep migrations additive and narrowly scoped. Do not delete registration/payment rows or rewrite payment history as part of UI work.
- Before changing production schema, RLS, grants, functions, or triggers, inspect the migration diff, confirm the intended effect, and capture an appropriate backup or recovery point.
- Record every database change in the migration and the matching daily work log. Applying a migration is a separate release step from committing it.
