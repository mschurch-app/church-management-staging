# 2026 感恩節奉獻回應：隔離驗收與發布閘門

承接 Issue #315 與草稿 PR #316。公開預覽目前沒有設定正式 endpoint，新增收件設定預設為關閉。尚不可宣稱正式可送出、已完成實際雙通道投遞或已完成實機驗收。

## 實作範圍

- 保留年度見證、官方 LOGO、三張原始真實照片與指定銀行／線上奉獻資訊。
- 銀行匯款要求匯款人自己帳號末五碼，恰好 5 位數字，使用字串保留前導零；線上奉獻可不填。日期、整數金額、聯絡方式、同意及欄位白名單由前後端檢查。不接收完整匯款帳號、證號、卡號或上傳。
- 私有 schema 的待核對回報、私人 LINE 與 Email 各一筆 outbox、稽核在同一交易建立。UUID 冪等鍵、內容指紋及資料庫唯一約束保護重試；前端逾時保留不可變 payload 與同一鍵，鎖定編輯並提供同筆重試。
- 只有入庫且兩個通知任務建立成功才回 accepted。介面清楚區分已接收、已排隊、服務商受理、待核對與已核對；不宣稱已讀、信箱已投遞或款項已實收。
- LINE 只接受已與 Auth 身分核對的 U 開頭牧師帳號，沒有群組 fallback。Email 收件由私有管理設定決定，不接收公開表單的收件人指示。SMTP 憑證只在後端，寄件設定需沿用並核對既有 Auth SMTP，不能因 Edge 環境未設 SMTP 就認定既有邀請信未配置。
- 通知逐通道獨立 lease、嘗試次數、退避、provider ID 與結果。LINE 使用固定 retry key，超過可安全重試時限要求人工查證。SMTP 送出後失聯屬結果不明，不盲目重寄。已受理通道不因另一通道失敗而重發。
- 後台以既有財務角色及擁有者權限檢查讀取／核對。對帳需要入帳金額、日期、唯一交易編號及說明；不符列人工確認。這些回報不寫入既有收入帳、不開立收據。
- 回報、通知、稽核表開啟 RLS，anon/authenticated 沒有表或 RPC 權限。主要 service RPC 為 SECURITY INVOKER。兩個窄範圍私有身分 helper 為 SECURITY DEFINER，只開放 service_role 執行，用來讀取非公開 Auth／owner 資料，未擴大 service_role 對整個 Auth 表的讀取權。

## 已完成隔離測試

1. PGlite 真正 SET ROLE service_role：15 組，包括原子入庫／雙 outbox、冪等／衝突、末五碼、公開角色拒絕、未授權／停用帳號拒絕、財務角色讀寫分離、金額不符、交易編號重複、版本衝突、worker 身分及 lease、單通道重試、SMTP 結果不明、收件身分缺失與頻率限制。
2. API／投遞合約：9 組，包括欄位白名單、honeypot、Origin、大小、錯誤不洩漏、受理前必有佇列、LINE 私人目的地與 409 去重、SMTP 固定 Message-ID，以及單／雙通道失敗。
3. 真實 TypeScript entry 去型別後注入依賴：3 組，驗證 Google SMTP implicit TLS、真實 bearer actor、未配置不能啟用、錯誤遮蔽及網路來源不可逆摘要。
4. Chromium／WebKit × 393／1440：公開表單 4 個設定、管理介面 4 個設定，驗證斷線同鍵、前導零、連按鎖定、線上奉獻、原圖、對帳失敗保留、唯讀權限、XSS、登出清除與晚到回應、手機無水平溢出。

所有案例使用合成假資料。未向正式奉獻表提交真實個資，未寄出任何奉獻通知。測試結果 JSON 和截圖在本目錄。

## 尚待完成，未通過前禁止開放公開收件

- 讀取／核對現有 Supabase Auth SMTP 服務、寄件帳號及可安全沿用的設定。本機瀏覽器存取目前關閉、CLI 沒有管理登入；現有 MCP 沒有 Auth config 讀取能力。這是設定存取待解決，不是已證實原有 SMTP 未配置。
- Google SMTP 可用時採 465 implicit TLS；若既有服務為其他 SMTP，沿用其核對後的 host/from。不得變更既有邀請／登入信設定來配合本功能。
- 正式主機的新增 schema／RPC、service_role、Edge bundle 與依賴載入驗收。
- 對指定牧師私人 LINE、指定 Email 各寄一次合成驗收通知，取得獨立受理 ID，並確認 Email 信箱中可找到驗收信；既有邀請信回歸。
- iPhone Safari／LINE 內開啟與 Mac Safari 人工操作驗收（桌面 WebKit 模擬不能替代）。
- 確認後才配置正式 endpoint、開啟 worker 排程與公開收件並合併前端。

## 最後交付

預定正式頁：`https://mscos.mchurch.online/thanksgiving-2026.html`。驗收後以教會對外信箱寄出可轉寄的完整代禱信至使用者已驗證的收件信箱，信內附正式奉獻回應連結；目前尚未寄出。

## 回退

先關閉 `offering_response.settings.enabled`，停止本功能自己的 cron，再還原前端 endpoint 設定或前端提交。保留全部回報、outbox、受理回條及稽核，不刪資料、不重送已受理通知。回退不更動其他排程、Auth、同工帳號或財務帳本。已受理的 Email／LINE 無法收回，應以回條判斷後續處理。
