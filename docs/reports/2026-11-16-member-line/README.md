# 會友 LINE 私人訊息與發送紀錄

會友名冊卡片頂部及個人資料編輯區提供「傳送 LINE」。選取情境範本後可修改全文，再預覽收件人與原文；按下確認才送出。支援 M+ 官方 LINE，未唯一綁定、封存或無權限時不可傳送。

系統設定 → 同工與權限 → 會友 LINE 傳送權限。開關預設僅吳俊璋、謝碧鳳、曾恩茹、邵鈺庭；其他帳號預設關閉。只有有效系統擁有者可調整。擁有者不自動繞過發送開關；帳號、有效登入 session、堂會名冊授權與 can_view 每次都由後端確認。

範本：新朋友歡迎、近況關心、主日聚會邀請、感恩節與餐敘邀請、生日祝福、聚會後關懷及空白自訂。範本不自動取得或聲稱任何活動時間，寄件人需填寫簽名、核對活動資訊。

## 發送紀錄

每位會友最近 10 筆，以及可按收件姓名、發送人、台灣起訖日期查詢的發送總紀錄（每頁25筆）。保留發送人姓名快照、內部 actor、收件人姓名快照、會友 ID、完整原文、送出與受理時間、狀態、平台 request ID。後續修改同工姓名不改歷史快照。平台受理明確區分於已讀。

名冊頂部可進入總紀錄；系統設定有總紀錄入口。檢視限有傳送權的同工與有效系統擁有者。LINE subjects、內部 claim token 不回傳瀏覽器，訊息原文不放入 public storage、service worker、localStorage 或 log。

## 防重送與恢復

同一 request UUID、actor、會友及全文不可改變。交易鎖避免競爭；同文換新 UUID 於23小時內也拒絕。LINE X-Line-Retry-Key 使用固定 request UUID，短期租約和23小時重試期限不超過 LINE 重試保護範圍。逾時保持 retryable，不誤稱成功；重試沿用同文／同 UUID，HTTP409 accepted回條視為先前已受理。儲存回條失敗可安全接續；accepted 直接回讀。改綁、撤權、停用與撤銷 session 立即拒絕下一次操作。沒有批次、群組、cron、AI自動發送。

## 證據

- `database-results.json`：24項隔離 PostgreSQL 權限、收件範圍、防重送、快照、搜尋及日期測試。
- `provider-results.json`：12項 mock LINE / auth / frozen payload / retry / history白名單測試。
- `browser-results.json`：Chromium/WebKit ×393/1440四組，實際名冊按鈕、範本、預覽、修改、未綁定禁用、確認送出、同 UUID 重試、撤權隱藏、設定入口、開關版本與歷史查詢。
- `syntax-results.json`：變更模組語法檢查。
- `live-unauthenticated-http.json`：正式端點匿名、無效 JWT 全部401。
- 共用回歸：catalog21、definitions20、Worker27、既有登入/權限資料44、LINE登入provider12通過。
- 瀏覽器截圖保存在本機同目錄；測試資料皆合成，LINE呼叫被攔截，沒有對真實會友做測試傳送。

真實 iPhone / Safari / LINE內頁、實際 Mac Safari 人工操作與新功能的真人傳送尚未驗證，不宣稱99%。目前後端已部署，前端發布與實際資源驗證以 deployment-receipt.json 為準。

私有 schema 三表 RLS 開啟且無 client policies，anon/authenticated 無 schema/table/RPC權限；這是刻意 deny-all。Security Advisor 的「RLS enabled no policy」為此設計的提示，不新增 client policies 來消除提示。固定 service-only RPC 由驗證使用者及 session 的 Edge 呼叫。

## 回退

先以系統設定關閉四位的傳送開關，保留發送紀錄與回條。前端用新 revert commit 回退本功能；保留獨立私有 schema，不刪既有 Auth、會友、綁定、訊息、帳本、通知與排程。不要 force reset main。
