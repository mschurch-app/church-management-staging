# LINE 登入選項與同工帳號申請

首頁移除 Email／密碼／忘記密碼表單，新增 LINE 帳密登入、LINE App 自動登入與同工帳號申請。預設帳密入口在 LINE 授權請求傳入 `disable_auto_login=true`、`prompt=login`；選用 LINE App 的入口不傳這兩項限制。兩個入口共用等待、取消與到期控制，不能互相覆寫登入。有效登入狀態由原有本機 Auth storage 接續，不承諾永久免登入。

申請先驗證 LINE，必填真實姓名、堂會、預計事工，手機與說明選填。沿用 `church_auth.mplus_staff_applications`，保留舊資料與舊表單相容性；新版不要求或回傳生日。申請本身不新增管理帳號、權限或會友。已授權者不重複申請。

帳號管理頁可核准新同工、明確確認同一人後連結既有帳號，或退回補件。新同工權限初始全不勾選，選定功能後操作預設只查看。核准透過既有原子帳號儲存函式驗證，失敗連同新帳號整筆回復。審核採版本比對，拒絕覆寫新資料或重做已完成的決定。原有管理員／堂會隔離不變。所有申請與審核均有私有稽核紀錄。

此為既有帳號管理功能的申請流程，公開申請頁不在內部工具收納盒另加功能權限。待審核項目只建立既有 App 內通知；測試不送出 LINE 或電子郵件。

## 驗證

- `tests/coworker-applications-db.mjs`：23 項本機 PostgreSQL／PGlite 合成帳號測試，涵蓋無權自審、他人資料隔離、重試去重、版本衝突、跨堂會注入、原子回復、退回補件與既有帳號連結。
- `tests/coworker-applications-browser.mjs`：45 項 Chrome／WebKit 手機與桌面檢查，外部請求全攔截。
- `tests/pwa-line-scope.mjs`：80 項 Chrome／WebKit 合成授權回程、錯誤拒絕、一次性狀態、雙入口與取消競態檢查。
- `tests/phase1/email-login.mjs`：12 項既有身分連結與新版首頁相容性檢查；`tests/phase1/handoff.mjs`：11 項交接回歸。
- 快取 worker 與功能目錄檢查通過。完整舊品質閘門仍有既有功能數量預期與測試套件環境缺口，未宣稱整體 99% 或所有舊套件通過。
- 正式 Supabase 結構、RPC 呼叫權限與未登入拒絕已核對，安全建議掃描沒有新增項目。
- 無登入 302 探測確認 Supabase 將兩組選項正確傳至 `access.line.me`；沒有進行真實帳號登入。

## 待實機確認

iPhone 主畫面 App 的帳密登入已獲使用者回覆可用。本次 Chrome／WebKit 模擬不等於 iPhone 實機；「使用 LINE App 自動登入」可使用手機已登入 LINE 的授權，但跨 LINE／Safari／主畫面 App 的自動喚回仍未獲實機驗收，不能宣稱 iOS 保證自動返回。保留 App 畫面及安全交接，回到原 App 時會驗證並接續。

新 migration 由 Supabase CLI `migration new` 產生並經本機驗證，再以 MCP SQL 原子套用到正式專案。此工作區沒有執行中的 Supabase CLI 本機資料庫，`db pull --local` 無法連線；不以空白 diff 冒稱同步完成。migration 保留可重跑的明確 SQL。
