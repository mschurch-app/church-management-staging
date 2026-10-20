# M+ Church OS school workspace

The school workspace lives at `https://mscos.mchurch.online/school/index.html`. M+ home performs the existing `/mschool-api/church-login` handoff into this same-origin route, preserving the requested tab. There is no iframe and no new database. All school reads and writes still use the existing authenticated school API and verified school roles. The opaque handoff session is consumed and removed from the URL by the existing school logic.

Independent `school.mchurch.online` entries, login behavior, shared assets, backend and records are unchanged. No files are released to the school repository. Public enrollment remains the original independent workstation. Only M+ home changes destination; SHiNE/shared function metadata retains the original school links.

The dedicated page has one green OS header, the approved global five-entry dock, and an inline school feature bar. Dialog, unsaved-form guards and data handlers are retained. The source school data script differs only in the Supabase data-client constructor: unused Supabase Auth persistence/refresh/URL detection are disabled, so it cannot read/refresh the OS login session. The existing opaque school-session headers and backend authorization remain unchanged. Uses the pinned existing OS SDK asset.

Source: `mschurch-app/m-shcool` commit `a39a647b8eedf24d9ebb7d2a1383dacaefa1c9dc`; SHA receipt in `school/source-manifest.json`. Regenerate with `python3 scripts/school/build-isolated-view.py --source /path/to/checked-out/m-shcool`. The generator writes only the OS `school/` folder; it does not write to the upstream checkout. Future school business-logic updates must regenerate and rerun the regression suite; the new view is an isolated presentation snapshot, not a second data store.

Validation:
- 99 tests: school data handlers, role checks, duplicates, failed writes, OS handoff, source hash, navigation, theme, calendar and preserved tools.
- 18 catalog checks and 22 service-worker checks.
- Live read-only API checks: OS-origin preflight 204; anonymous session read denied 401.
- Synthetic UI verified at 393×852 and 1280×900. No live record mutations, kiosk registration, permission change, message sending or private data export.
- Real iPhone/installed-app authenticated end-to-end acceptance remains pending; synthetic tests are not counted as that acceptance.

The accompanying M+ schedule theme fix disables late legacy skin insertion only for M+ and applies green to the active navigation, export introduction and service-date cards. SHiNE colors and schedule data/export handlers are unchanged.

Rollback: revert the M+ home route change to restore its previous school destination; the original independent school site needs no recovery. Revert the accompanying theme changes independently if necessary. There are no schema/data migrations.
