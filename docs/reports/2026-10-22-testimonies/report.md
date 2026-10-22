# 雲彩見證正式投稿與審核

## 發布範圍

M+ 教會網站先顯示「分享我的見證」入口。首頁見證區預設隱藏，僅在公開 API 回傳至少一篇核准稿件時呈現。沒有匯入沙盒示範稿、示範人物或示範影片。

- 公開投稿：文字／一支 MP4、MOV、WebM（50 MiB 以內）／最多八張照片（每張 10 MiB），可混合使用。
- 姓名與電話／Email 僅供審核同工；公開顯示分享名稱、真名或匿名，由投稿者選擇。
- 公開同意、媒體權利與人物同意均須確認。
- 私人 bucket `testimony-private`；未核准媒體沒有公開讀取權限。
- 教會 OS → 網站 → 雲彩見證投稿審核；亦可由教會設定「內容與發布」進入。
- 沿用 M+ `pastoral_chats`＋`website_weekly` 的啟用帳號與檢視權限；核准、退回、下架另核對 `can_approve`。權限由後端現查，沒有授權任何新帳號。
- 核准需明確勾選全文與附件核對；退回需說明。退回後由同工依私人聯絡方式聯繫補充，沒有自動寄送 LINE。
- 樂觀版本檢查及審核稽核紀錄；下架後停止新公開連結，先前簽發的公共附件網址最多再有效 60 秒。
- 前台上傳顯示實際傳輸百分比；私人儲存核對與送審另以文字回饋。中斷保留欄位，重試／同分頁重新整理沿用原投稿編號，狀態查詢不自動重送。
- 投稿以 UUID＋256-bit capability 管理上傳，不要求分享者建立同工帳號；capability 僅暫存該分頁。伺服器只存雜湊。檔案路徑由伺服器固定，不接受客戶端任意路徑。
- 首次建立上傳預約限制每 IP 每小時五筆、全站每天一百筆；保留加鹽 IP 雜湊，不保留原始 IP。支援格式、大小、數量、實際 Storage metadata 及檔頭均檢查；上傳不得覆寫。

## 驗證

- PostgreSQL（隔離 PGlite，執行實際 migration）：33 項通過。
- 內容／檔案驗證：14 項通過。
- Edge handler：23 項通過，含 JWT、實際角色來源、CORS、capability、媒體核對及公共 URL。
- Chrome／WebKit，390 與 1440 CSS px：88 項通過，含草稿、失敗重試、重新整理沿用編號、照片＋影片、審核勾選、空資料隱藏和 XSS 文字顯示。
- 共用功能目錄 20 項、Worker 23 項、網站導覽 5 項、功能導覽 4 項通過；官網 SEO 檢查通過。
- 截圖保留本機；此報告無真實投稿或個資。
- 真實 iPhone／Mac Safari 實機驗收仍待執行；不宣稱 99%。

## 正式後端回條

- SQL 於交易中套用；建立後投稿數為 0、bucket 為 private、匿名角色不能呼叫 service RPC。
- Edge `testimony-intake` v1 ACTIVE。公開入口自驗投稿 capability；管理動作另驗證使用者 JWT 與現行 DB 權限。
- 正式 GET 公開 API 回傳空清單；前台應只有投稿入口。
- 在正式環境新增測試稿件及上傳檔案的測試被自動核准審查拒絕，尚未執行，沒有測試資料需要清理。不可將隔離的上傳測試說成正式環境已實際上傳驗收。
- migration 檔由 CLI `migration new` 建立並保存；目前沒有可用的本機 Postgres，未執行 db pull，也未宣稱本機 migration history 已與正式環境同步。

## 維運界線

後台目前列最近 200 篇。資料表除撤銷客戶端權限外，另有明確的拒絕 RLS policy。Advisor 的新索引尚未使用提示是空資料表的預期狀態。

沒有 AI 自動核准、沒有新建監控／排程。未完成的上傳預約兩小時後不能提交；殘留檔案需由既有維運人工檢視清理，不自動刪除已送審或公開稿件。現階段不提供投稿者跨裝置登入編輯。

## 測試重跑

`node tests/testimonies/validation.mjs`、`node tests/testimonies/database.mjs`（指定 PGLITE_MODULE 或使用相鄰開發依賴）、`node tests/testimonies/edge.mjs`。
瀏覽器測試 `tests/testimonies/browser.mjs` 可設定 TESTIMONY_WEBSITE_DIR、PLAYWRIGHT_MODULE、CHROME_PATH、FFMPEG，使用隔離回應，不向正式環境送稿。
