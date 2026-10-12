# Operations

## Seasonal Life Tree preview (2026-10-10)

Open `/life-tree-festivals.html?festival=christmas` for Christmas week, or `?date=2027-12-05` for the full-December decorated tree outside that week. All eight worlds and seven days can be previewed without sign-in. Settings and tools exposes the preview under content/publication for existing M+ tree administrators. There are no operational database writes or messages. Run `npm run life-tree:festivals` from tests for isolated interaction/calendar/audio regression, plus the standard quality gate for shared metadata and Worker changes. The December calendar is 2027-specific. Formal 2027 activation and content approval are not implied by this static preview deployment. Evidence and deployment hashes: `docs/reports/2026-10-10-life-tree-festivals/`.


## Local development

This is a static browser application plus Supabase services. There is no root `package.json` or repository-defined npm script at the time of review.

- Install: no frontend package installation is required for the static pages. Supabase CLI is needed for migration/function workflows; use the project’s approved CLI installation method.
- Run the static files locally with a local HTTP server, for example `python3 -m http.server 8000`, then open the relevant page. Authenticated Supabase requests still require valid project configuration and network access.
- Local Edge Function development depends on Supabase CLI and Docker; confirm those tools are installed before relying on local emulation.

## Verification

- 手札或補讀前端變更另跑 `node tests/life-tree/contracts.mjs`。瀏覽器經真正October handler處理me、journal_save、mark_read及water_tree，外部LINE／SDK／DB仍全部隔離；與17項backend及完整browser回歸一起執行。詳見tests/life-tree/README.md。正式API使用participant.line_subject，沒有id欄位，fixture不能自行增加欄位掩蓋契約錯誤。

- 十月讀經相關修復必跑 `node --test tests/life-tree/backend.mjs`（Node 22.13以上）。此測試直接執行原Edge Function handler，只有外部身分與DB隔離；前端browser.mjs模擬API回應不能代替後端檢查。部署後可用TREE_FUNCTION_SOURCE指向安全讀回的函式source重跑，確認部署的就是已驗證版本。
- October後端明確部署至專用專案svwgfgyxxgbqabosriom的tree-reading-october-test，verify_jwt維持false，因函式自行驗證LINE ID token；不可誤改為Supabase JWT或指向主靈修／舊DB。GitHub Pages發布不會部署此函式。2026-10-10修復補讀缺少shiftDate已部署版本7 ACTIVE，部署讀回source的15項測試皆通過；證據見docs/reports/2026-10-10-life-tree-makeup-backend/。

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

## Four-day challenge test

October date guards deployed as v8 ACTIVE on 2026-10-10 at 14:12 Taipei; source readback matched Git and 23 handler checks passed again. The 2026-10-10 user request remains pending their choice whether to count today as day 1. Do not execute `docs/reports/2026-10-10-life-tree-four-day-challenges/rotation.sql` without that choice. Recheck the October project, date, roster and existing assignments first. The proposed rotation inserts 15 future assignments for the current 5 participants and preserves today’s completions. A repeat same-day round requires a separately reviewed additive mechanism; never reset completed rows or remove the existing unique constraint. Future assignments activate by Taipei calendar date through normal reads; no cron or push notification is required. Daily care is still performed by the member; prior unresolved challenges may remain visible until completed.

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

## 十月節慶輪替測試

原同工入口 `https://liff.line.me/2011645391-9t2SxuSG`，不更換LIFF ID／endpoint或要求重新綁定。2026/10/10–27，每兩個台北日曆日依序元旦煙火、春節、復活節、聖靈降臨節、端午、中秋、光明勇士、感恩節、聖誕節；10/28回原景。日期表只在 `life-tree-festival-test-schedule.mjs`，無Cron／自動通知、無新資料表。若將來調整起日，更新版本與固定日期回歸後循PR發布。

改動HTML／控制器／共享SVG／動畫／CSS一起發布，版本 `20261010-season-test1`。樹圖下展開節慶日期可看本輪安排；資料儲存仍使用專用十月API。不得將 `life-tree-festival-preview.mjs` 的假進度接入此入口。正式2027與其他專案需另外接入，不推定本次已自動同步。
# 每日流量報告修正（2026-10-11）

正式 `daily-traffic-report` v16 與 `recent-traffic-report` v13 已更新；沿用既有 Vault cron 驗證、每日台北時間 21:00 排程、堂會及收件人設定。原本的正式來源保存在 commit `61c15bac21589556861723e7742a6bb181a3dd4f`，供必要時回復。沒有修改資料表、登入、網站追蹤 ID 或 App 共用資源。

- Google 回應沒有日期資料列時，標示 `awaiting_data` 或 `no_reported_data`，數值留空；只有實際資料列明確回傳 0 才呈現 0。讀取失敗與待更新分開，保留最後已取得的資料。
- 每次查最近 14 天的逐日資料，修正最近 7 天既有報告與通知。YouTube 註明平台資料日期，當天未就緒時顯示最近有資料的日期。Instagram 沒有回傳的互動指標不再預設為 0。
- 通知使用真正換行；修正已送出的通知保留 ID 與已讀狀態。`POST {"action":"refresh"}` 只修正既有報告與通知，不新增通知、不推送。正常排程只有成功建立當日通知的執行者才推送，重試避免重複推送。推送失敗仍需另行查驗推送服務。
- `recent-traffic-report` 從設定讀取 GA property，提供受同一 cron 驗證保護的 `diagnostics` 動作，只回傳彙整資料與公開設定，不回傳 OAuth token。所有讀取有期限，錯誤碼過濾避免將帶 token 的網址寫入報表。

驗證：25 項 Node 自動檢查通過；正式兩端點未授權 POST 均回應 401。正式靜默修正 7 份報告與 7 則通知，通知總數、ID、已讀狀態均保持；逐一回查換行與缺值，來源檔案與部署檔案一致。正式 YouTube 10/5–10/8 回補觀看次數為 61、25、21、36；10/9–10/11 仍缺資料，不補造數字。證據位於 `docs/reports/2026-10-11-traffic/`。

尚待確認：GA Data API 回傳最近 30 天 19 位 activeUsers、55 sessions、247 次瀏覽，逐日資料最後到 10/5，10/6 起未回傳資料列。官網目前 `G-VPZZCKQ41B` 有送出 `page_view`，Google collect 回應 204；同次觀察也有一筆 ERR_ABORTED，接收回應不等同資料已納入正確 property。Google Analytics Admin API 診斷回應 SERVICE_DISABLED；Data API 本身可以正常查詢，不能將 Admin API 停用當成沒有流量的原因。已請管理員提供資料串流評估 ID 與網址，以核對 property 對應、追蹤篩選及蒐集狀態；目前不宣稱追蹤缺口已排除，也不能還原未蒐集的歷史瀏覽。教會 OS 的使用不能直接當作官網流量。

本次未變更介面版型，Mac Chrome 僅查驗公開首頁追蹤傳送；沒有 iPhone 17 或 Safari 的本次實機驗收證據，不宣稱整體 99% 達標。


## 小樹週年慶配樂（2026-10-12）

依使用者指定，週年慶配樂換成〈生日快樂〉的自製鋼琴與鐘琴演奏編曲；90 BPM、3/4 拍、16 秒循環，音訊峰值維持 0.35。產生器的 `--only anniversary` 只更新該首，其他十首音訊不變。十月讀經入口與獨立節慶預覽的模組／音訊版本均更新為 `20261012-birthday1`。Worker 對腳本採網路優先，音訊不經 Worker 快取；沒有變更全域 Worker、登入、資料庫或排程。

使用者另指定棕樹主日採傳統〈和散那，和散那，和散那歸於至高神〉純演奏版、受難日採〈維亞多勒羅莎〉純演奏版。目前尚無可用音檔，這兩日的既有配樂與對應保持原狀，不能將既有 `passion.wav` 宣稱為上述曲目。待音檔到位，分別接入受難週第 1 日及第 6 日；同時更新十月輪替入口和獨立預覽，不改閱讀／澆水進度。

驗證證據與限制記錄於 `docs/reports/2026-10-12-anniversary-music/`。Chrome 以隔離 API 與模擬 LINE 身分檢查；缺少 iPhone 17 和 Mac Safari 實機試聽，不宣稱已完成實機驗收或整體 99% 達標。


## 物品與借用清冊易讀性（2026-10-12）

物品卡片原本被共用主要按鈕樣式套上紅底，內部品名與說明仍用深色，造成難以閱讀。現在物品卡片採次要導覽控制並使用頁面限定的語意樣式，白底配深色品名、次要文字及可用數量標示。手機 620px 以下採單欄橫向清單，桌面保留卡片網格；品名在前，分類與可用數量、規格、位置分層排列。無照片採既有自製物品 SVG，沿用真正照片與私有照片網址機制。單位切換使用可辨識的選取狀態。

`inventory.html` 在共用樣式之後載入限定的 `inventory.css`；CSS 與控制器版本為 `20261012-readable1`。未改共用主題、登入、權限、堂會篩選、資料庫、數量計算或借還契約。Worker 對 CSS／模組使用網路優先、HTML 使用網路讀取，本次不更改全域 Worker。

檢查使用合成登入與物品 API，所有編輯失敗與重試只寫入測試記憶體，不接觸正式庫存。證據位於 `docs/reports/2026-10-12-inventory-readability/`，可重跑 `tests/inventory/browser.mjs`。Mac Chrome 的手機尺寸模擬與桌面檢查不等於 iPhone 17 或 Safari 實機驗收；兩者仍待驗收，不宣稱整體 99%。

## 教會 OS 全頁可讀性（2026-10-12）

共用主要按鈕規則改為尊重 `data-app-control` 用途；清單／設定分頁採白底深字，特殊場景保留自身樣式。深色公開內容區使用 `data-app-surface="dark"`。修正登入、首頁摘要／通知、教材、設定、新朋友、協作側欄、週報步驟、LINE 預覽、代禱牆、每日靈修及生命樹相關文字對比。沒有變更 Auth、權限、資料表或正式業務資料。

CSS、控制器及直接／間接引用統一 `20261012-readable2`，Worker namespace 同步更新；更新仍由使用者明確操作後啟用，沒有強制接管。新增用途請沿用 `docs/design/component-contract.md`，檢查有資料、已選取與懸停狀態。

68 個 HTML 入口、206 次手機／桌面狀態、8,669 次文字量測均完成合併補驗，0 項已驗文字對比失敗／橫向溢出；不是全業務通過率。物品21項、庭園32項及Worker21項回歸通過。完整證據、既有品質測試未通過項與 Safari／iPhone 實機限制見 `docs/reports/2026-10-12-app-readability/`；不宣稱整體99%達標。
