# LINE 同工群組選單與常用工具

在既有同工 LINE 群組輸入 `help`，回覆六格 Flex 選單。備忘、出勤請假、照片歸檔與行事曆按鈕會開啟既有教會同工 LIFF；會友關懷按鈕不會把個資帶回群組。此設計不新增 LINE 群組。

## 已實作功能

- **備忘錄**：個人備忘預設只有建立者可見；同工共用備忘限同單位已授權同工；可設提醒日期與封存。
- **出勤請假**：同工可每日上、下班打卡，檢視本人紀錄及請假狀態；牧師與管理者可檢視近七日出勤、核准或退回請假。打卡不記錄 GPS 或背景位置。
- **照片歸檔**：上傳 JPG、PNG、WebP，單張最大 10 MB；直接傳至管理者選定的 Google 共用雲端硬碟資料夾，資料庫只存照片索引，不存公開副本。
- 以上功能以既有 LIFF LINE ID Token 在 Edge Function 驗證同工與單位權限。資料表啟用 RLS，anon/authenticated 沒有直接權限。

## Google Drive 設定

照片歸檔以最小權限 `drive.file` scope 執行，不會擴大既有日曆 OAuth 權限。牧師或管理者從照片頁面按「授權 Google 雲端硬碟」時才會發起增量授權，之後使用 Google Picker 選取共用資料夾；上傳採 `supportsAllDrives=true`。

正式環境的 Edge Function Secrets 需設定 `GOOGLE_PICKER_API_KEY` 與 `GOOGLE_CLOUD_PROJECT_NUMBER`，且在 mbot 的 Cloud 專案啟用 Google Drive API 和 Picker API。OAuth Consent 同意 `drive.file` 後，管理者需選一次資料夾。必要時先確認 mbot 在該資料夾有編輯權。

## LINE 群組設定與既有 webhook

- 只接受 `LINE_COWORKER_GROUP_ID` 指定的單一既有同工群組。電腦版群組訊息不一定包含個人 user ID，因此以群組 ID 作入口白名單；非此群組及一對一聊天不會收到回覆。
- 驗證 LINE HMAC 簽章；無 channel secret 時回覆 503，拒絕處理。
- 需要 `LINE_CHANNEL_SECRET`、`LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` 與 `LINE_COWORKER_GROUP_ID` 三個 secrets。
- LINE Developers Console 需允許官方帳號加入群組。註冊 callback 前，先核對原有 webhook；不可直接覆寫未知用途的 URL。若已有 handler，應將兩種事件路由合併。

## 正式環境狀態

Coworker-tools migration 已套用到正式環境，Edge Function 已部署並通過 Supabase 部署編譯；資料表目前只供 Edge Function 使用。Google 日曆一般授權仍只要原本的日曆 scope；新的 `connect-drive` 動作只在管理者主動點選照片授權時要求 Drive 檔案 scope。

群組選單 Edge Function 已部署但尚未設定 LINE secrets，也沒有修改或註冊 LINE webhook。網頁和選單路由目前在此 PR 分支；合併後才會由既有靜態網站流程上線。

## 測試建議

1. 用核准同工 LINE 登入 LIFF，確認個人備忘只由本人看見、同工備忘可共同檢視。
2. 測試同日重複打卡、未上班先下班、重疊請假、一般同工嘗試核准等拒絕條件。
3. 用牧師／管理者帳號授權 Drive、選擇一個測試資料夾，確認照片進入 Shared Drive，其他同工可開啟但不能變更資料夾設定。
4. 設定 LINE secrets 後，以既有同工群組測試 `help` 與三個 LIFF 工具按鈕。
