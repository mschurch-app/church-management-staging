# 沿用既有 Google SMTP：安全接續

已於 2026-11-13 透過新對話的 Chrome 唯讀核對正式 Supabase 專案：自訂 Auth SMTP 已啟用，smtp.gmail.com，465。原有同工邀請設定不需修改。頁面不提供讀回已儲存密碼的功能。

僅由持有既有應用程式密碼的使用者在同一專案安全設定填入，不把值交給聊天或公開 repository：

https://supabase.com/dashboard/project/aqanuwilmvdtlzuqlrau/functions/secrets

- OFFERING_SMTP_USER：與既有 Auth SMTP Username 相同。
- OFFERING_SMTP_PASSWORD：原有 Google 應用程式密碼；不是要求重設信箱密碼。
- OFFERING_SMTP_HOST 無須新增，本功能已固定預設 smtp.gmail.com 與 TLS 465。
- OFFERING_SMTP_FROM 無須新增，預設使用上述 Username；若既有寄件地址與 Username 不同，先確認該地址具 Google 寄件授權才另外配置。

不要更動既有 Secret，也不要在 Auth 的 Password 欄位輸入任何新值。若沒有原有密碼，保持收件關閉及草稿；未取得使用者明確決定前，不建立管理 access token、不更改原有憑證、不借用登入／邀請 Email 寄送奉獻內容。

設定後先驗證僅報告是否 ready 的檢查，再按 release-runbook 分階段驗收。任何 SMTP 錯誤僅保留遮蔽錯誤碼；不可輸出憑證值。正式 LINE／Email 測試須有各自真實受理紀錄並在信箱找到合成驗收信，才能往後進行。

Secrets 設定成功只代表憑證已存放，不代表 SMTP 登入成功、信件已投遞、實機驗收通過或功能已上線。
