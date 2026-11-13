# 教會 OS 感恩節功能接續（2026-11-13 最新）

只在本接手對話 01a1d392-1404-7522-8778-8614c6eecd26 繼續，不要再分支其他對話。完整測試及限制先讀 README.md。正式 repo mschurch-app/church-management-staging，Issue #315、draft PR #316。

使用者最新決策：
1. 奉獻回報只發私人 LINE，不要 Email 通知，也不用 SMTP 憑證。
2. 最後仍要寄一封可轉寄的代禱信到 james@tcsc.org.tw，另製作可在 LINE 轉傳的精美版本。
3. 已解釋 Supabase Auth 內建郵件限驗證／邀請用途；使用者明確回答「可以，請直接代寄這一封」，允許用已連接教會信箱單次寄出，不需要使用者操作 Gmail。
4. 所有未提交工作、Auth／邀請信、正式帳本與原有排程均需保護。

本對話 Chrome 已連上。已唯讀確認 Auth 自訂 Google SMTP 啟用，smtp.gmail.com:465；既有密碼隱藏不可讀回。使用者沒有原密碼，因此後續取消自動 Email 通知；不要再要求填 OFFERING_SMTP_* 或重設登入／信箱。曾準備但未儲存 Secret 名稱，沒有新增寄信 Secret。

現況：
- 隔離 LINE-only SQL 17 組、HTTP／entry 12 組、公有／後台各 4 個瀏覽器設定、catalog 20 組與 Deno check 通過。
- 新 offering_response schema／service RPC、兩個本功能索引與 thanksgiving-offering-response Edge v1 已部署；enabled=false，沒有 cron，前端未合併／未設定 endpoint。
- 私有收件人與 Auth 已匹配，worker key 存 Vault，不得讀出或貼到對話／GitHub／log。
- 真正主機 service_role 同筆合成回報只建立一筆回報、一個 LINE job；TG26-AB3007589C044EE2，NT$1，00123，is_test=true。不得記帳。
- 真正 LINE 受理 ID d201d78e-c6bc-430e-a074-d2c607082ea4，worker HTTP 200；使用者已確認看到通知，勿重寄此測試。
- 財務 RPC 金額不符拒絕與人工核對經 rollback 測試，不改正式帳本。實際 HTTP GET405、公有提交503、錯誤 worker403。
- LINE 分享版／封面／長圖／QR 與轉寄 Email 草稿已完成；尚未發布分享頁、寄出代禱信或把分享圖發到使用者 LINE。
- 真實 iPhone Safari／LINE 內頁、Mac Safari 操作未驗收。不要聲稱實機或 99% 通過。需向使用者呈現具體結果並確認發布安排，不能悄悄忽略這些未驗收項目。

來源路徑：/Users/james-codex/Documents/Codex/2026-11-10/new-chat/church-os-thanksgiving-offering-20261113

最後寄信：教會 Gmail church@tcsc.org.tw，link_id=link_6aed17c101788191bd758aed4243914f。收件 james@tcsc.org.tw。只寄一次，先驗證正式 URL、圖片與回應入口可用。可用教會 Gmail connector，不能把此 connector 憑證塞進後端。

預定正式 URL：
https://mscos.mchurch.online/thanksgiving-2026.html
https://mscos.mchurch.online/thanksgiving-2026-line.html

回退依 release-runbook.sql。先關閉本功能／專用 cron，保留全部資料與受理回條，不全面還原、不刪 session、不改 auth.json。
