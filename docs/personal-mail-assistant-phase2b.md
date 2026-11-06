# 第二階段 B：實際 PostgreSQL 隔離驗證

日期：2026-11-06。延續 PR #306 與 feature/personal-mail-assistant-v1。

## 本次已解除的阻礙

先前環境沒有 PostgreSQL／psql。現在已新增 GitHub Actions 的臨時 PostgreSQL 17.6 服務，不需 Mac 上的 Codex 執行；沒有使用正式 Supabase 連線或讀取任何真實信件。

首次實際執行證據：
- 提交：c59a6b00dc254b49f7b5b1f95546c4aa4864b5ce。
- Actions run：42150027262，job：127670725996，結果 success。
- https://github.com/mschurch-app/church-management-staging/actions/runs/42150027262
- Node 22.16.0 同次重跑 core 與 api：112 passed，0 failed。
- `run-postgres.mjs` 在真實 PostgreSQL 17.6 內成功執行候選 SQL 與全部既有隔離斷言。
- 後續獨立查詢確認 auth／church_auth／personal_mail 三個測試 schema 全數回滾，未留存測試資料。

這是使用虛構身分、模擬 JWT claims 與最小既有結構 fixture 的**真實 SQL 執行**，不是正式 Supabase 登入／PostgREST／Edge Functions 的端對端驗收。

## 接續強化（本提交）

- 把本機測試連線防護獨立為 `local-test-db.mjs`：只接受本機測試資料庫，釘住 loopback hostaddr，忽略外部 PGHOSTADDR、PGSERVICE、PGOPTIONS、PSQLRC 與正式連線環境值。設定 query／lock timeout。
- 新增 16 項連線防護測試，已在本機 Node 22.16.0 執行，16 passed／0 failed；runner 語法檢查通過。
- SQL 斷言改用 IS DISTINCT FROM，缺少 JSON 欄位／NULL 不再有機會讓測試誤判通過。
- CI 改為重跑本模組全部 *.test.mjs；PostgreSQL image 固定為首次通過時的 digest。
- 本提交更新後仍須看該提交自己的 CI 結果，不能用前一個提交的綠燈取代。

## 安全與部署界線

工作流程只有 contents:read，checkout 不保留憑證，不接正式 secrets，不部署、不寄信、不發 LINE，不使用 pull_request_target。postgres 密碼只用於當次即丟的虛構測試容器，不是教會 OS 密碼。

本次改動限於測試與文件；沒有修改正式應用程式、正式資料庫、現有 LINE 推播、排程或 main。PR 繼續 Draft。

已覆蓋：本人列表與分頁、不同同工隔離、設定衝突、錯誤時間、他人信箱修改拒絕、直接表讀寫拒絕、偽造 user_metadata 權限無效、核定別名對應、歧義身分拒絕、停權／試用停用／模組停用／session 撤銷，以及匿名與 service_role 使用者 RPC 拒絕。

未覆蓋：完整正式結構相容性、所有既有 RLS／函式授權、真實 JWT 驗證與登入、並行寫入壓力、Deno runtime、服務商 OAuth、Gmail／iCloud 收信、AI 分析及 LINE 端對端發送。不能因此直接合併或開啟功能。

## 後續開發入口

先核對正式登入與隔離部署設定，再實作 Gmail OAuth 的啟動／回呼與帳號憑證保存。沿用同工身分，回呼綁定本人與一次性 state／PKCE；不要挪用現有共用行事曆 token，也不要要求同工把主要密碼貼到對話中。真實授權完成後再測試單一 Gmail 摘要與既有個人 LINE 傳送。

官方依據：
- https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers
- https://www.postgresql.org/docs/17/libpq-envars.html
- https://supabase.com/docs/guides/database/postgres/row-level-security

Supabase changelog Markdown 本次仍回傳工具不支援的 content-type；已讀取 HTML changelog，但頁面可見公告截止 2026-07，不能據此聲稱核對了截至今日的全部變更。本次沒有升級正式 Supabase 相依套件。
