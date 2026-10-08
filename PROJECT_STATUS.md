# Project Status

Last reviewed: 2026-10-08

## Current state

Church OS is an active production system at `mscos.mchurch.online`. Heat Camp admin PR #18 has been merged. Its additive RPC migration is applied to Supabase project `aqanuwilmvdtlzuqlrau`, and `heat-camp-admin` is deployed at version 2. No registration or payment records were changed. GitHub Pages contains the merged source; direct CDN/page verification was not available in this session.


A cross-page button stability audit was completed on 2026-10-07. Shared mobile focus/scroll interception, indefinite user-action requests, incorrect disabled-state restoration, and blank pending states were corrected without changing production data.

## Main capabilities

- Church administration, member and group management, attendance, schedules, pastoral care, and room reservations.
- App notifications, feature access controls, and configurable dashboard shortcuts.
- App notification-center items can be queued for background delivery to registered devices; a one-minute backend worker records delivery attempts and non-secret failure states.
- Website and media publishing tools.
- A separate 2027 Heat Basketball Camp registration and payment flow in Supabase, including NewebPay and receipt synchronization preparation.

## In progress

- 2027 每日靈修生命樹 MVP 已上線：一月31篇資料、會員每日頁面與完成紀錄已部署；審核流程正調整為鈺庭初審、師母複審、牧師終審的固定三階段。
- Church OS Heat Camp admin: mobile registration cards, full details, permission-gated edits, immutable payment/banking information, payment status/method in details and receipts, and printable receipt draft. PR #18 is merged; the RPC migration is applied and Edge Function version 2 is active.
- Additional stability and mobile usability fixes are tracked through recent repository history and `docs/codex-log/`.

## Known issues

- The camp data exists in a private Supabase schema. Use an account with the explicit `heat_camp` grant; decrypting or editing identity and health fields additionally requires owner or `can_manage` permission.
- PDF export uses the browser print dialog; the user selects “Save as PDF”.
- No repository-level package scripts or automated CI workflow were found during this inventory.
- Authenticated browser smoke tests remain necessary because the repository has no automated end-to-end coverage for its 45 button-bearing pages.

## Technical debt

- No single root operations guide or deployment runbook existed before this task.
- Static frontend deployment and Supabase deployment are separate operations and need explicit release coordination.
- Camp registration, payment, and receipts currently have independent workflows; broader camp management actions are not included in this admin list.
- Receipt template still needs the official association name and seal artwork before it can serve as a finalized official receipt.

## Next steps

1. Review the daily devotional migration and January content package; confirm scripture version/source/license before any item can be finally approved.
2. Apply the devotional migration and insert-only January seed in the approved Supabase release window, then deploy `daily-devotional-admin` and the updated `line-member` function.
3. Receive the official association name and seal files, then finalize the camp receipt layout.
4. Continue documenting releases and verification in `docs/codex-log/`.
5. Add a small authenticated smoke-test suite for high-risk save, approval, publishing, and permission flows.

## Important risks

- The registration database contains minors’ personal, insurance, and health information. New interfaces and exports must continue to exclude unnecessary sensitive fields.
- Database permission changes can expose production data if applied incorrectly. Keep migrations additive, review them before applying, and do not use service-role credentials in the browser.
- Payment status is driven by verified NewebPay callbacks; administrative reporting must not independently mark payments as paid.
