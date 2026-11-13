# 2026 感恩節奉獻回應：LINE 通知與分享版本

承接 Issue #315、草稿 PR #316。依使用者 2026-11-13 最新指示，奉獻回報只通知牧師私人 LINE，取消自動 Email 通知；原有同工邀請與 Auth SMTP 保持原狀。最後另寄一封可轉寄代禱信，使用者已同意由已連接的教會信箱代寄，無須設定 SMTP。

## 實作

- 銀行匯款必填自己帳號末五碼，恰好 5 位數字並保留前導零；線上奉獻可不填。Email／電話是奉獻者聯絡資料，至少提供一項，不會觸發 Email 寄送。
- 私有 schema 回報、唯一私人 LINE 任務與稽核原子入庫。UUID 同筆重試、不可變 payload、內容指紋及唯一約束防重複。沒有 Email 任務，資料庫也拒絕非 line 通道。
- 只接受已匹配 Auth 身分的牧師私人 U 帳號，沒有群組 fallback。LINE 使用固定 retry key、獨立 lease、退避、受理 ID 與結果；超過 23 小時的已嘗試通知要求人工查證。
- 財務以既有 owner／finance 權限讀取、核對。核對金額、日期、唯一交易編號及說明，不符轉人工確認；不寫既有收入帳、不開收據。
- 所有新表 RLS；anon/authenticated 沒有新 schema、表及主要 RPC 權限。主 RPC 為 SECURITY INVOKER，兩個私有 service-only 身分 helper 限窄查詢 Auth。未擴大 service_role 對 Auth 的讀取權。
- 正式開放仍需驗收閘門：實際私人 LINE 合成通知已受理且對應目前收件人、worker 已配置、後端 LINE 憑證 ready。不可手動改 sent 越過閘門。

## 已通過的隔離驗收

- 真正 SET ROLE service_role 的 PGlite SQL：17 組，包括單任務原子入庫、同鍵重試、前導零、Email 任務拒絕、未授權拒絕、核對不符、唯一銀行交易、通知 retry/lease/unknown 與啟用閘門。
- HTTP／投遞合約 8 組、真實 TypeScript entry 依賴注入 4 組，共 12 組；確認沒有 SMTP 讀取、沒有 Email 寄送，以及公有輸入不可控制 actor/recipient。
- 公開表單與財務後台各 4 個 Chromium／WebKit × 393／1440 設定，包含斷線同鍵重試、連按、唯讀、核對失敗保留、XSS、登出晚到回應與無水平溢出。
- 既有功能 catalog 回歸 20 組；固定 Supabase 2.102.0，Deno check 通過，已移除 nodemailer 與 lockfile 對應項目。
- 真正 Chrome 的 LINE 分享封面、長圖與 393 手機尺寸分享頁：原圖正常、版面不溢出、分享 URL 經 UTF-8 編碼；未代使用者選擇朋友或群組。

## 正式主機上已執行的受控驗收

新 migration、僅本功能的查詢索引及 Edge version 1 已部署；公開收件仍 disabled，沒有啟用 cron，也沒有合併前端。原有程式、Auth、帳本、收據與其他排程未修改。

- 真正 service_role：owner、私人收件身分與 worker ready；anon/authenticated RPC EXECUTE 均 false。
- 一筆 is_test=true 的合成回報 TG26-AB3007589C044EE2，金額 NT$1，末五碼 00123；同鍵兩次只保留一筆回報與一筆 LINE 任務。
- 2026-11-13 14:37:01（台北）LINE 平台受理，request ID d201d78e-c6bc-430e-a074-d2c607082ea4；worker HTTP 200，processed=1/sent=1。使用者已親自確認「已看到 LINE 測試通知」。這不是實際奉獻，禁止記帳。
- 真正財務 RPC 的不符金額拒絕、人工核對動作經 transaction rollback 驗證，未改任何既有財務紀錄。
- 正式 HTTP：GET 405、公開合成提交 503 unavailable、錯誤 worker key 403；保持收件關閉。
- Advisor 無新高等級／健康問題。私有表的 RLS 無政策是預期 service-only 設計；新表的兩個外鍵已補索引。新索引尚無正式使用屬預期，並非刪除理由。

## 分享與 Email

- thanksgiving-2026-line.html：手機代禱信、LINE 分享按鈕及圖卡下載。LINE 分享使用官方 https://line.me/R/share?text=，由使用者選擇對象後送出，不會自動發送。
- assets/thanksgiving-2026/line-cover.png：1200×630 分享封面。
- assets/thanksgiving-2026/line-letter.png：760×2851 長圖，保留三張真實照片、代禱、銀行資訊、網頁地址及 QR Code。
- forward-email.html：可轉寄完整 Email 草稿，尚未寄出。等正式頁面可用後，使用已連接的教會信箱單次寄給使用者；不借用 Supabase 邀請／驗證信寄一般文案。

## 尚待／發布

真實 iPhone Safari／LINE 內頁與 Mac Safari 人工操作尚未取得證據，不能把桌面 WebKit 模擬當實機或宣稱 99%。前端仍在草稿，未設定正式 endpoint。先向使用者呈現具體結果並確認發布安排，再啟用本功能 cron、收件及前端，核對實際靜態資源與鏈結，才發送正式分享信。

預定完整頁：https://mscos.mchurch.online/thanksgiving-2026.html
預定 LINE 分享頁：https://mscos.mchurch.online/thanksgiving-2026-line.html
以上尚非已發布證明。

## 回退

先將 offering_response.settings.enabled=false，停止 thanksgiving-offering-dispatch 專用 cron，再還原前端 endpoint／提交。保留回報、通知受理回條、稽核與合成驗收紀錄；不刪資料、不重寄已受理 LINE、不更動 Auth／其他排程／既有帳本。尚未收到正式奉獻回報，現階段僅一筆明確標示的合成資料。
