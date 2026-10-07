# Project Status

Last reviewed: 2026-10-07

## Current state

Church OS is an active production system at `mscos.mchurch.online`. Heat Camp admin PR #18 has been merged. Its additive RPC migration is applied to Supabase project `aqanuwilmvdtlzuqlrau`, and `heat-camp-admin` is deployed at version 2. No registration or payment records were changed. GitHub Pages contains the merged source; direct CDN/page verification was not available in this session.

## Main capabilities

- Church administration, member and group management, attendance, schedules, pastoral care, and room reservations.
- App notifications, feature access controls, and configurable dashboard shortcuts.
- Website and media publishing tools.
- A separate 2027 Heat Basketball Camp registration and payment flow in Supabase, including NewebPay and receipt synchronization preparation.

## In progress

- Church OS Heat Camp admin: mobile registration cards, full details, permission-gated edits, immutable payment/banking information, payment status/method in details and receipts, and printable receipt draft. PR #18 is merged; the RPC migration is applied and Edge Function version 2 is active.
- Additional stability and mobile usability fixes are tracked through recent repository history and `docs/codex-log/`.

## Known issues

- The camp data exists in a private Supabase schema. Use an account with the explicit `heat_camp` grant; decrypting or editing identity and health fields additionally requires owner or `can_manage` permission.
- PDF export uses the browser print dialog; the user selects “Save as PDF”.
- No repository-level package scripts or automated CI workflow were found during this inventory.

## Technical debt

- No single root operations guide or deployment runbook existed before this task.
- Static frontend deployment and Supabase deployment are separate operations and need explicit release coordination.
- Camp registration, payment, and receipts currently have independent workflows; broader camp management actions are not included in this admin list.
- Receipt template still needs the official association name and seal artwork before it can serve as a finalized official receipt.

## Next steps

1. Receive the official association name and seal files, then finalize the receipt layout.
2. Verify the published mobile interface using an authorized staff account, including list, detail, edits, payment read-only behavior, exports, and receipt printing.
3. Assign the `heat_camp` permission only to approved staff and verify their least-privilege access.
4. Continue documenting releases and verification in `docs/codex-log/`.

## Important risks

- The registration database contains minors’ personal, insurance, and health information. New interfaces and exports must continue to exclude unnecessary sensitive fields.
- Database permission changes can expose production data if applied incorrectly. Keep migrations additive, review them before applying, and do not use service-role credentials in the browser.
- Payment status is driven by verified NewebPay callbacks; administrative reporting must not independently mark payments as paid.
