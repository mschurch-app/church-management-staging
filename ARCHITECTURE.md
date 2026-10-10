# Architecture

## Frontend

- `life-tree-garden-preview.html` / `.css` / `.mjs` form an isolated, unconnected garden interaction prototype. They reuse shared design tokens, SVG icons and local life-tree audio; all reading, watering, challenge, collection and journal state stays in memory and resets on reload. The prototype imports no LINE, Supabase, authentication or production data client and does not replace the October or 2027 entry points.

- Static HTML, CSS, and browser ES modules served from the repository through GitHub Pages at `mscos.mchurch.online`.
- `admin-db.mjs` creates the Supabase browser client using the publishable key and persistent authenticated sessions.
- `admin-access.mjs` loads the signed-in user’s church grants and per-feature action permissions. Pages still need server-side authorization for protected data.
- `admin-dashboard-ui.mjs` builds the dashboard and authorized module shortcuts.

## Backend

- Supabase Postgres stores church administration data and the separate `camp_registration` schema.
- Supabase Edge Functions handle server-side operations and integrations. Camp registration and payment processing are in `supabase/functions/heat-camp-registration/`.
- The `heat-camp-admin` Edge Function verifies the user token and calls service-only database RPCs for filtered lists, exports, detail access, and permission-gated edits. The database RPCs enforce the feature grant and write audit entries; payment and bank fields remain read-only.
- The 2027 devotional MVP uses `daily_devotionals`, `daily_devotional_progress`, and `daily_devotional_reviews`. Member access goes through the LINE identity-verified `line-member` Edge Function; administrator editing and review use the authenticated `daily-devotional-admin` Edge Function. No devotional table is exposed directly to browser roles.
- The October tree opens a January devotional preview with one journal editor at its end. `october-devotional-journal.mjs` authenticates against the dedicated October LIFF and uses the existing October `me` / `journal_save` API. The preview remains uncounted; journal dates are actual Taipei dates and journal access does not grant access to the Church OS devotional database.
- October devotional navigation uses `tree-reading-october-test.html?view=devotional&church=M%2B&preview=1&from=october-tree`. `october-devotional-shell.mjs` reuses the existing devotional markup at the configured LIFF endpoint so authentication does not depend on a sibling URL outside LINE's guaranteed initialization scope. Legacy October-preview links redirect to this fixed route; ordinary public previews and member devotional routes retain their existing behavior.

## API and authentication

- Browser authentication is Supabase Auth. The app persists the session in local storage and refreshes it when appropriate.
- SHiNE-only administrators may use Email/password without linking LINE. M+ grants remain hidden until the same Auth user has a verified `custom:line-web` identity; dual-church accounts without LINE are restricted to SHiNE grants.
- Browser calls use the Supabase publishable key plus the authenticated bearer token. A publishable key is not an authorization boundary; database grants, RLS, RPC checks, and server-side checks provide access control.
- Supabase Edge Functions expose the HTTP API. Sensitive service-role credentials remain server-side.
- Public Sunday service signup uses the LINE-authenticated `line-member` Edge Function. Multi-role selections call the service-only `service_signup_register_batch` RPC so name matching, duplicate-date checks, capacity calculation, waitlist placement, and all inserts run in one database transaction.
- In-season service changes are stored separately from registrations. The member submits through `line-member`; ministry scope controls the initial review, and configured final reviewers control administrative approval through `service-signup-admin`. App notifications queue each handoff.
- Review routing configuration is stored in `review_workflow_settings` and managed from `review-workflow-settings.html`. Reviewer choices use active Church OS accounts; LINE availability is derived from verified `custom:line-web` Auth identities.

## Third-party services

- NewebPay handles camp payment; the server verifies signed callbacks before recording a successful payment.
- The registration system prepares receipt synchronization to the church’s external giving platform.
- LINE and browser push services are used by other Church OS features.

## GitHub and deployment

- GitHub repository: `mschurch-app/church-management-staging`.
- The repository is published as a static site through GitHub Pages with custom domain `mscos.mchurch.online`.
- Supabase migrations and Edge Functions deploy separately from the static frontend; a GitHub push alone does not apply database migrations or deploy functions.
- The exact automated release workflow was not present in the repository at review time.

## Important directories

- `*.html`, `*.mjs`, `*.css`: static frontend and browser modules.
- `supabase/functions/`: Edge Functions.
- `supabase/migrations/`: ordered database migration history.
- `docs/`: workflow and operational documentation.
