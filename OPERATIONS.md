# Operations

## Local development

This is a static browser application plus Supabase services. There is no root `package.json` or repository-defined npm script at the time of review.

- Install: no frontend package installation is required for the static pages. Supabase CLI is needed for migration/function workflows; use the project’s approved CLI installation method.
- Run the static files locally with a local HTTP server, for example `python3 -m http.server 8000`, then open the relevant page. Authenticated Supabase requests still require valid project configuration and network access.
- Local Edge Function development depends on Supabase CLI and Docker; confirm those tools are installed before relying on local emulation.

## Verification

### Life-tree garden interaction preview

Serve the repository locally (`python3 -m http.server 8765 --bind 127.0.0.1`) and open `http://127.0.0.1:8765/life-tree-garden-preview.html`. This is a standalone prototype, not the production LIFF entry. Use the scenario controls at the bottom to try rain, insects, wind, fallen branches and reset. Reload discards all demonstration progress and journal drafts. No install, login or database configuration is needed. The user approved the connected October implementation on 2026-10-10. Keep this prototype separate: its sample controller must never be imported into the authenticated entry.

Run its isolated browser checks using `tests/life-tree/garden-preview.mjs` as documented in the test README. The script writes screenshots and `results.json` to `TREE_TEST_OUTPUT`. Safari and iPhone/LINE validation remain separate.

- Run `git diff --check` before committing.
- For changed browser modules, use `node --check <file.mjs>` where applicable.
- For Edge Functions, use the project’s configured Deno/Supabase checks when available.
- No automated test, lint, typecheck, or build script was discovered during the initial inventory. Record checks as “not run” when they were not actually run.

### Daily devotional import

- Validate a workbook with `python3 scripts/import_daily_devotionals.py <xlsx> --month YYYY-MM --out <directory>`.
- The validator rejects missing fields, placeholders, duplicate core content, and selected references outside that day's reading.
- Generated seed SQL is insert-only and never overwrites an existing reviewed date.
- Confirm the exact target project and existing month count before executing a seed; read back every imported field afterward and compare the previous month's checksum. A workbook's approval label does not bypass the configured reviewers.
- In `daily-devotional-admin.html`, select the content month. A direct link may use `?church=M%2B&month=2027-02`; the existing authenticated API enforces permissions and receives that month's inclusive date range.
- Apply the schema migration before the January seed. Confirm scripture version, source, and license in the admin editor before final approval.

## Deployment

### Connected Life Tree garden

- Existing October entry: `https://liff.line.me/2011645391-9t2SxuSG`. The 2027 LIFF ID remains separate.
- Publish the entry HTML, controller and its new `tree-reading-garden.css` / `tree-reading-garden-art.mjs` together through main/GitHub Pages. Resource version: `20261010-garden-live1`.
- Run `tests/life-tree/browser.mjs` with the documented Puppeteer runtime. It intercepts external requests and uses synthetic identity/progress; never point test fixtures at a real database.
- Read back the hosted HTML/modules/styles and compare SHA-256 with the release source; preserve earlier stale/404 results as pending, not passed.
- This release needs no migration, RLS or Edge Function deployment. Roll back the reviewed frontend commit through a new revert PR; do not reset history or roll back member records.
- Verify real Mac Safari and iPhone/LINE separately, including audible music, actual authentication, reading, dated watering, care and devotional return. Native LIFF Full remains a LINE console setting.


- Frontend: review and merge the approved change to the repository’s GitHub Pages publishing branch (`main`), then confirm the public page update.
- Database: inspect migration status and reviewed SQL before applying a migration to the linked Supabase project. Never assume pushing frontend files applies SQL.
- Edge Functions: deploy the named function separately with Supabase CLI after checking project linkage and function secrets. Keep service credentials in Supabase secrets.
- After release, verify the page, authentication, permissions, read-only listing, and export behavior with an authorized test account.

## Rollback

- Before clearing even test journals, capture a recoverable, access-controlled snapshot of the exact rows and verify restoration is possible. Keep personal note text and credentials out of Git and reports. Authorization to delete does not itself provide a recovery copy. Record the approved scope, count, dates, checksums and retention policy; do not infer backup availability from the SQL connector working.

- Frontend: revert the reviewed Git commit and publish the resulting version through the normal GitHub Pages workflow.
- Edge Function: redeploy the last known-good function version from Git.
- Database: prefer a forward corrective migration. A migration that changes permissions or function behavior must have a reviewed reversal plan; do not drop or truncate production data to roll back.

## Troubleshooting

- LIFF生命樹只開半截：在LINE Developers對應Channel的LIFF設定把Size設成Full並按Update，關閉舊頁再重開原LIFF連結。正式生命樹與十月同工測試是不同LIFF：正式 `2011645391-l63wfeP0`，十月 `2011645391-9t2SxuSG`（以各頁實際config為準）。不要替換既有ID、endpoint或登入路由。頁面CSS及GitHub發布不能修改LINE原生視窗大小；截圖中Full已勾選而Update尚在，不代表已儲存。沒有安全管理連線時由Channel管理員操作，不收集帳密或Token。

- Login/access denied: refresh the session and verify the account is active and has the required church and feature grant.
- Edge Function unavailable: check function deployment, Supabase project linkage, CORS origin, and required server-side secrets without printing secret values.
- Missing camp list: verify the migration has been applied, the private schema/RPC exists, and the caller has the `heat_camp` view permission.
- Export unavailable: verify `heat_camp` export permission; large exports must be narrowed with filters.
- App notification appears in the notification center but the phone does not alert: confirm the user has an active `app_push_subscriptions` row, inspect the notification's `push_sent_at` / `push_last_error`, and verify the `church-os-app-push-delivery` cron job and `app-push` Edge Function are active.
- Do not use real personal information in test logs or screenshots.
