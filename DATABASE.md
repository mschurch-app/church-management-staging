# Database

## Platform and project

- Database: Supabase Postgres.
- The configured project uses an earlier “staging” identifier while serving the active Church OS; do not infer that its data is disposable.
- This document intentionally excludes credentials, tokens, and connection strings.

## Main schemas and tables

- `church_auth`: `accounts`, `owners`, `grants`, `account_roles`, `account_feature_permissions`, and `account_home_preferences` support administrator identities, church grants, feature actions, and dashboard preferences.
- `public`: shared application tables and RPCs. Representative areas include members, groups, attendance, schedules, notifications, and inventory.
- `camp_registration`: `events`, `registrations`, `payment_orders`, `receipt_profiles`, `eoffering_sync`, and `audit_log` support the independent camp registration and payment workflow.

## Relationships

- Camp registrations belong to an event and may have payment orders, a receipt profile, and one receipt synchronization record.
- `payment_orders.registration_id` and other camp foreign keys use restrictive deletion where deleting a record could invalidate payment or receipt history.
- The camp schema is separate from the basketball team roster.

## Migrations

- Database changes are tracked as timestamped SQL in `supabase/migrations/` and applied in version order using Supabase migration tooling.
- Generate migrations with `supabase migration new <name>`; review the SQL and migration status before any apply/push.
- Do not edit or apply a production migration without reviewing its scope and backup/rollback plan.

## RLS and authorization

- Church data access is based on authenticated user identity, `church_auth.grants`, role assignments, and feature-level action settings.
- Camp data resides in a private schema and is accessed by existing server-side functions. The proposed admin listing function grants execution only to `service_role`; the Edge Function verifies the bearer token and checks active account, church grant, and view/export permission before calling it.
- Service-role credentials must never be shipped to browser code.

## Safe change practices

- Keep migrations additive and narrowly scoped. Do not delete registration/payment rows or rewrite payment history as part of UI work.
- Before changing production schema, RLS, grants, functions, or triggers, inspect the migration diff, confirm the intended effect, and capture an appropriate backup or recovery point.
- Record every database change in the migration and the matching daily work log. Applying a migration is a separate release step from committing it.
