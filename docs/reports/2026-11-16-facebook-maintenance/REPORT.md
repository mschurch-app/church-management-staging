# Facebook 長期連線維護

教會、協會兩個固定粉專均經 Meta 偵錯工具核對為 Page 憑證、有效、到期日「永不」。它們由長效使用者憑證重新換取，經既有一次性入口分開加密保存。未保存使用者憑證，未增加粉專範圍、未公開貼文。沒有固定到期日仍可能遭撤銷；本次不宣稱永遠有效，也不以定時重複交換60天憑證充當自動續期。

每天台灣時間09:00執行 facebook-connection-maintenance，唯讀核對粉專身分與讀取貼文能力。實際發文權限以 Meta 授權核對為證，本次不發測試貼文。無效憑證、權限不足立即通知指定牧師／師母；暫時失敗需連續三次才通知。通知在教會 OS，沿用既有 App 推播；不是 LINE 投遞承諾。同一事件去重、恢復通知、30/14/7/1天效期提醒均經隔離測試。此次兩個憑證沒有固定到期日，因此不需定期延長。

另於台灣時間13:00由獨立 SQL 排程檢查是否超過36小時沒完成檢查。服務中斷仍可能影響通知投遞；不能宣稱任何故障都保證送達。

狀態表與記錄函式僅服務端可操作。檢查結果用憑證更新時間核對，拒絕舊憑證檢查覆蓋新狀態；重新連線後效期資訊須重新驗證。API 不回傳原始憑證、加密值、錯誤訊息或私人貼文。後端無 Facebook POST 發布操作。

驗證：SQL16項，API5組，Chromium/WebKit393/1440四組管理頁，Worker27項通過。正式部署後讀回原碼比對，首次真實檢查與排程狀態另存本機操作回執。實體iPhone/Mac Safari全流程未驗收。

回退：停用 facebook-connection-health-daily、facebook-connection-health-watchdog 兩個排程，停用新增 worker，還原此 PR 的管理頁與Worker快取。保留現有可用的兩個粉專憑證、故事與通知資料；不需刪表或回退已驗證的新憑證。Meta企業整合工具可撤銷指定粉專，但此動作會中斷發布，需另行確認。

官方規則：https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived
