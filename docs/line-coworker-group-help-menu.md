# LINE 同工群組 help 選單

此 Edge Function 提供第一階段原型：同工在既有官方 LINE 群組輸入 `help`，收到六格 Flex 功能選單；點選後收到簡短回覆。它不建立新群組、不更改目前 LINE webhook，也不把關懷或出勤個資貼到群組。

## 功能與邊界

- 只處理 `source.type = group` 的 webhook；不回覆一對一對話或其他群組來源類型。
- 只接受透過 `LINE_COWORKER_GROUP_ID` 指定的單一既有同工群組；不檢查發話者個人 ID，因 LINE 電腦版群組事件不保證提供 user ID。選單內容只包含一般功能入口，不回傳私人資料。
- 用 LINE webhook 簽章驗證原始 request body。
- `備忘錄` 與 `教會行事曆` 回覆既有同工工作台登入網址。
- `會友關懷` 會提醒使用私下管道。
- `出勤請假` 與 `照片上傳歸檔` 目前會明確標示仍未接通 LINE 群組。
- `教會管理系統` 保留既有登入方式；選單不會建立另一套管理員登入。

目前這是選單與路由提示原型，尚未讓六個功能都能在 LINE 對話中完成操作。照片功能接上 Google 共用雲端硬碟之前，仍需另外設計 Drive 權限與檔案歸檔流程。

## 部署前設定

在 staging Supabase Edge Function Secrets 設定：

- `LINE_CHANNEL_SECRET`：既有 LINE Messaging API channel secret。不要提交到 Git，也不要貼在聊天訊息中。
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`：既有 Messaging API channel access token。
- `LINE_COWORKER_GROUP_ID`：既有同工群組 ID，只允許此群組觸發選單。
- Supabase 專案預設提供的 `SUPABASE_URL` 及 service key。

函式在缺少 channel secret 時會回覆 503，不會接受未驗簽的 webhook。部署後 URL 為：

`https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/line-coworker-menu`

正式切換前，需要在 LINE Developers Console 核對目前 webhook 設定。若已有 webhook，應將該 URL 接入現有 handler 或採用支援多個 event handler 的架構；不要直接覆寫既有 URL。還要在同一 Messaging API channel 啟用「Allow bot to join group chats」，並由管理者把既有官方帳號加入目前的同工群組。此 PR 不會執行以上 LINE Console 變更。

## 手動測試

1. 在 staging 設好兩個 LINE secrets，部署本函式並確認 `verify_jwt = false`。LINE webhook 以 HMAC 簽章驗證，不使用 Supabase JWT。
2. 使用 LINE Developers Console 的 webhook 測試，確認錯誤簽章得到 401、缺少 secret 得到 503。
3. 確認未列入的其他群組及一對一對話不會收到訊息。
4. 在測試群組由已授權同工送出 `help`，確認六格 Flex 顯示、按鈕回覆及隱私提醒。
5. 完成測試後，才評估如何把 endpoint 接到既有 webhook；不可覆蓋未知用途的現有 callback。

LINE 平台在群組中送出的回覆會對群組全員可見。選單只回覆通用功能文字，不會將同工身份或會友內容發到群組。
