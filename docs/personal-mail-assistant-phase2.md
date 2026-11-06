# 個人智慧郵件助理 — 第二階段 A：本人設定 API

日期：2026-11-06。延續 `feature/personal-mail-assistant-v1`／草稿 PR #306。
前一階段：`docs/personal-mail-assistant-v1.md`。

## 交付狀態（不可合併發布）

新增後端程式與隔離資料庫候選稿，**尚未部署／套用**。既有原型仍是示範，沒有切換到新 API。
未修改 main、既有推播／登入程式、Supabase config.toml、正式資料表或 Cron；未新增收費服務。
沒有讀取真實郵件、輸入郵件密碼、設定 OAuth、產生 AI 摘要或傳送 LINE。

本次已寫入：
- `supabase/functions/personal-mail-assistant-api/handler.mjs`：HTTP 驗證、本人設定 API 與輸出欄位白名單。
- 同目錄 `index.ts`：使用原教會 OS Supabase 工作階段的 Edge Function 入口；預設關閉。
- `supabase/isolated/personal-mail-assistant/phase2-draft.sql`：私有資料結構與受限 RPC 候選稿，**不是 migrations，未執行**。
- `tests/personal-mail-assistant/api.test.mjs`：62 項 Node HTTP／RPC 契約測試。
- `postgres-fixture.sql`、`postgres-checks.sql`、`run-postgres.mjs`：僅允許全新本機測試資料庫的隔離驗收腳本，尚未執行 PostgreSQL 測試。

## 這次實際盤點的既有結構

唯讀核對正式專案 `aqanuwilmvdtlzuqlrau` 的欄位、函式定義、索引及排程名稱；沒有讀取同工資料列、Token、Vault 解密內容或 Cron command。

- `public.pastoral_staff.id` 是穩定同工鍵；`app_user_id` 有非空唯一索引，`line_subject` 有唯一索引。
- `church_auth.account_identity_links` 與 `church_auth.canonical_account`／`account_users` 已處理核定的登入身分關聯。
- `get_pastoral_staff_for_app_user` 目前以傳入 App user 直接比對。新候選 RPC 以可信 `auth.uid()` 解析既有身分關聯；若對應多個仍啟用的同工，拒絕猜測。
- `auth.sessions` 確有 `id`、`user_id`、`not_after`；候選 RPC 檢查 JWT session_id 是否仍存在及未過 not_after。
- 原同工工具 `supabase/functions/pastoral-coworker-tools/index.ts` 有 Supabase getUser 與 LINE 身分讀取方式。
- `_shared/dual-notification.mjs` 的 `notifyStaffDual` 可能同時寫 App 與送 LINE；不適合直接拿來傳私人郵件全文。
- 原 `app-push` 已知有 08:00 前延後的一般路徑；此次讀到 Cron 時區為 GMT。私人摘要 07:00 需要專屬政策，不得全面取消其他功能的安靜時段。

## 本次 API 範圍

只接受教會 OS 已有的 **Supabase access JWT**。不把 Gmail 登入信箱當作教會 OS 身分，也不接收前端自稱的 owner、staff、admin、LINE user ID。
首次 LINE 登入仍走原教會 OS 換發 App 工作階段；此 API 不接受裸 LINE／LIFF ID token。真實登入返回尚待整合驗收。

| action | 輸入 | 候選 RPC | 狀態 |
| --- | --- | --- | --- |
| `state` | 選填 cursor、limit（1–100） | `personal_mail_get_state` | 本人信箱列表、分頁、摘要時間、LINE 綁定線索 |
| `save_preferences` | time、expectedRevision | `personal_mail_set_time` | 只改自己的摘要時間，版本不符回 409，不自動覆寫 |
| `pause_account` | accountId | `personal_mail_pause_account` | 只暫停自己的單一信箱；他人與不存在的 ID 均回 404 |

時間預設 07:00、Asia/Taipei；一人多信箱，不限制為一個或五個。列表有明確分頁。
回傳只含必要帳號欄位，不含 provider subject、owner ID、Token、LINE user ID 或郵件全文。
LINE 只顯示 missing／needs_verification；查到格式正確的綁定不等於已驗證 Messaging API Provider 或實際送達。
**不提供新增／恢復／刪除信箱 API**：這些必須和服務商驗證、撤銷與資料清除一起完成，不製作假連線。

## 安全邊界

1. Edge 入口只使用 publishable／anon 專案金鑰和使用者 Authorization；不使用 service-role／secret key。
2. 每次請求呼叫 `auth.getUser(token)`；DB RPC 再由 auth.uid、工作階段、有效主帳號與唯一有效同工重新決定本人。
3. 不信任 user_metadata、姓名、email 或瀏覽器傳入的授權資訊。拒絕未知輸入欄位。
4. 私有 schema 的全部表啟用 RLS 並撤銷直接客戶端存取；沒有直接讀寫政策（default deny）。
5. public RPC wrapper 是 SECURITY INVOKER；必要的 SECURITY DEFINER 只放私有 schema、固定空 search_path、撤銷預設 PUBLIC 執行權，逐筆明確限制 owner。
6. 私有 helper 需同時通過 module_settings 與 pilot_access；資料庫全域開關初始 false，避免繞過 Edge 開關直接呼叫 RPC。
7. 角色為管理員或牧師不提供其他同工的郵件存取權。停權、停用試用名單、已登出 session 皆拒絕。
8. 已合併但仍被停用的別名帳號採保守拒絕；必須先核對現行身分合併語意，不為方便而放寬。
9. 儲存衝突回 409，前端應重新讀取，不自動重送。例外不回傳原始資料庫錯誤、憑證或私人內容。
10. delivery_enabled 有 false 限制，API capabilities 也保持 sync／connect／delivery 全 false；沒有「設定成功等於開始寄送」的混淆。

**注意：RLS 不能限制資料庫擁有者、擁有高權限的維運者或解密金鑰持有人。此設計是應用程式使用者權限隔離，不是端到端加密承諾。**

## 測試結果與限制

已實際執行：
```
node --check supabase/functions/personal-mail-assistant-api/handler.mjs
node --check tests/personal-mail-assistant/run-postgres.mjs
node --test tests/personal-mail-assistant/api.test.mjs
```
結果：**62 passed，0 failed**。包含未知欄位、偽造 owner、任意 LINE 收件者、錯誤授權、匿名帳號、錯誤網域、請求大小、設定版本衝突、分頁、帳號切換、輸出祕密欄位剔除與錯誤訊息最小化。

這些測試的 Auth／RPC 是模擬依賴，**不是已驗證真實 RLS、登入、資料庫隔離或 LINE 的證明**。Phase 1 原型檔未變更；本次沒有重新執行前一階段 50 項測試，不能將兩階段相加說成這次執行 112 項。
本環境沒有 PostgreSQL／psql、Deno，不能執行 SQL fixture、Edge runtime 或真實身分端對端測試。
既有 07:00 ChatGPT 摘要排程保持不變，本開發版沒有 LINE 摘要排程。

## Codex 接手順序

1. 讀取 `AGENTS.md`、第一階段與本文件；確認 PR #306 最新 head，保留 Draft。
2. 在新建的空白本機 PostgreSQL 測試資料庫執行以下檢查，**不得使用正式連線字串**：
```
createdb mail_assistant_test_v1
MAIL_ASSISTANT_TEST_DB=postgresql://localhost/mail_assistant_test_v1 node tests/personal-mail-assistant/run-postgres.mjs
```
Runner 限定 localhost／127.0.0.1／::1，資料庫名稱須為 mail_assistant_test_ 開頭；拒絕已有 auth、church_auth 或 pastoral_staff 的資料庫。全程 transaction，結尾 ROLLBACK。
測試場景：兩位同工隔離、同工多信箱分頁、設定版本衝突、冒稱管理員無效、核定別名一致、歧義對應拒絕、停權／撤銷 session／關閉模組拒絕、匿名與 service_role 不能直接呼叫使用者 RPC。
3. 修正 SQL／權限問題並取得真實隔離證據後，才透過 Supabase CLI 正規建立／產生 migration；不要直接把候選稿當作已核准 migration。
4. 在隔離環境驗證 Supabase getUser、JWT/session、直接 RPC 權限、Deno 入口與部署設定；補上速率限制。
5. 完成 Gmail 多帳號 OAuth、iCloud 連線及加密憑證儲存、隱私同意、移除／撤銷。回呼必須綁定本人、一次性 state 與 PKCE；不得挪用現有共用行事曆 refresh token。
6. 再接 AI 同步／摘要，逐信箱記錄涵蓋範圍。郵件中的指示視為不可信資料。
7. LINE 只重用現有同工綁定與官方帳號傳送能力；不得呼叫 notifyChurchDual／notifyLineGroup 傳私人摘要，不把內容放入共享通知。先補唯一工作鍵、原子領取、持久化 retry key、發送前停權查核與暫停後取消待送。
8. 最後接上真實設定精靈、功能目錄、07:00 個人排程及實機驗收。所有發布門檻通過前保持關閉，不合併 main。

參考官方文件（本次查閱）：
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/sessions
Changelog markdown 讀取失敗（工具不支援該 content-type），未取得完整 changelog；部署前須重新核對版本公告。本次沒有升級任何相依套件。
