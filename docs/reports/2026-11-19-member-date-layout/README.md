# 家人登錄日期欄位手機超框

會員資料更新的日期 input 在手機 LINE/WebKit 原生呈現時可能受內建最小寬度影響而超出表單。於 newcomer.html 限定會員更新與身分核對區塊的欄位 border-box、min-width:0、max-width:100%；日期 appearance:none 並限制 WebKit 內部日期文字區寬度。保留 type=date、原生選擇器、欄位值與儲存流程，不以 overflow:hidden 掩蓋欄位。Worker 更新至 20261119-member-date1。

隔離測試使用實際 newcomer.html、member-welcome-ui.mjs、頁面 Tailwind 執行檔，只有身分資料客戶端替換為合成 approved 狀態。Chromium/WebKit 375、393、430、1440 CSS px 共八組：生日左右邊界在卡片內、和電話欄寬相同、24px 放大文字、日期修改與清空、送出的四個欄位格式通過，無 JS 錯誤。所有外部請求阻擋，沒有正式資料寫入。Worker 回歸 27 項通過。實體 iPhone/LINE 原生日期彈窗尚待驗證。

回退：還原本 PR 的 newcomer.html 與 Worker，不需資料庫或登入變更。截圖與完整結果留本機 local-operations/member-date-layout-20261119。
