# Operations

## Local development

This is a static browser application plus Supabase services. There is no root `package.json` or repository-defined npm script at the time of review.

- Install: no frontend package installation is required for the static pages. Supabase CLI is needed for migration/function workflows; use the project’s approved CLI installation method.
- Run the static files locally with a local HTTP server, for example `python3 -m http.server 8000`, then open the relevant page. Authenticated Supabase requests still require valid project configuration and network access.
- Local Edge Function development depends on Supabase CLI and Docker; confirm those tools are installed before relying on local emulation.

## Verification

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

- Frontend: review and merge the approved change to the repository’s GitHub Pages publishing branch (`main`), then confirm the public page update.
- Database: inspect migration status and reviewed SQL before applying a migration to the linked Supabase project. Never assume pushing frontend files applies SQL.
- Edge Functions: deploy the named function separately with Supabase CLI after checking project linkage and function secrets. Keep service credentials in Supabase secrets.
- After release, verify the page, authentication, permissions, read-only listing, and export behavior with an authorized test account.

## Rollback

- Frontend: revert the reviewed Git commit and publish the resulting version through the normal GitHub Pages workflow.
- Edge Function: redeploy the last known-good function version from Git.
- Database: prefer a forward corrective migration. A migration that changes permissions or function behavior must have a reviewed reversal plan; do not drop or truncate production data to roll back.

## Troubleshooting

- Login/access denied: refresh the session and verify the account is active and has the required church and feature grant.
- Edge Function unavailable: check function deployment, Supabase project linkage, CORS origin, and required server-side secrets without printing secret values.
- Missing camp list: verify the migration has been applied, the private schema/RPC exists, and the caller has the `heat_camp` view permission.
- Export unavailable: verify `heat_camp` export permission; large exports must be narrowed with filters.
- App notification appears in the notification center but the phone does not alert: confirm the user has an active `app_push_subscriptions` row, inspect the notification's `push_sent_at` / `push_last_error`, and verify the `church-os-app-push-delivery` cron job and `app-push` Edge Function are active.
- Do not use real personal information in test logs or screenshots.
