# Project Status

Last reviewed: 2026-10-07

## Current state

Church OS is an active production system at `mscos.mchurch.online`. This checkout is a separate review branch based on the GitHub `main` revision identified during this task. No production data or live database configuration was changed.

## Main capabilities

- Church administration, member and group management, attendance, schedules, pastoral care, and room reservations.
- App notifications, feature access controls, and configurable dashboard shortcuts.
- Website and media publishing tools.
- A separate 2027 Heat Basketball Camp registration and payment flow in Supabase, including NewebPay and receipt synchronization preparation.

## In progress

- Church OS admin list for Heat Camp registrations, payment status, and Excel/PDF exports. Changes are being prepared for review; migration and Edge Function are not deployed.
- Additional stability and mobile usability fixes are tracked through recent repository history and `docs/codex-log/`.

## Known issues

- The camp data exists in a private Supabase schema. The new admin interface requires its additive permission migration and Edge Function before it can be used.
- PDF export uses the browser print dialog; the user selects “Save as PDF”.
- No repository-level package scripts or automated CI workflow were found during this inventory.

## Technical debt

- No single root operations guide or deployment runbook existed before this task.
- Static frontend deployment and Supabase deployment are separate operations and need explicit release coordination.
- Camp registration, payment, and receipts currently have independent workflows; broader camp management actions are not included in this admin list.

## Next steps

1. Review the Heat Camp admin UI, Edge Function, and migration in the draft change.
2. Apply the reviewed migration and deploy the Edge Function through the established Supabase release process.
3. Assign the `heat_camp` permission only to approved staff and verify list, payment reconciliation, and export access.
4. Continue documenting releases and verification in `docs/codex-log/`.

## Important risks

- The registration database contains minors’ personal, insurance, and health information. New interfaces and exports must continue to exclude unnecessary sensitive fields.
- Database permission changes can expose production data if applied incorrectly. Keep migrations additive, review them before applying, and do not use service-role credentials in the browser.
- Payment status is driven by verified NewebPay callbacks; administrative reporting must not independently mark payments as paid.
