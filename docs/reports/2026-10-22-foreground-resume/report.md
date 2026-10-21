# iPhone 背景返回白屏恢復

使用者回報：登入後切換其他 App，再返回 LINE 內開頁面顯示全白。僅憑截圖無法確認 WebKit 繪圖表面、凍結頁面還原或登入連線何者為實際根因；本次修正共用恢復流程，不變更驗證或權限。

- 一般 visibility 返回先觸發布局與重繪，不丟棄原 DOM、捲動位置或表單。
- iOS persisted pageshow（凍結／BFCache 還原）在乾淨、安全時重新載入；先前有內容而返回後主區域消失時，同樣有限次恢復。
- 未儲存表單、非 form 輸入、操作中、浮窗及離線情境不自動重載。登入／付款回呼與帶敏感交接參數的網址不自動重播。sessionStorage 不可用時也不自動重載。
- 自動恢復兩分鐘內最多一次。受保護的白屏提供明確手動恢復入口，不自動重送任何資料。
- 背景返回不再當作全新開啟而立即啟動版本更新；新開啟的安靜自動更新仍保留。移除返回後殘留的導覽進度／按下狀態。

## 驗證

使用 Mac 本機 headless Chrome、隔離合成頁面與 iPhone user agent；沒有使用真實登入憑證或寫入業務資料。

- foreground-resume-browser.mjs：14 項（正常返回、空內容恢復、session 保留、iOS 凍結還原、桌面快取還原、表單與非表單草稿、進行中、手動入口、防迴圈、回呼、離線、初次 pageshow）。
- startup-update-browser.mjs：19 項，含真實 Service Worker 安裝、等待版本啟動及重載防迴圈。
- phase4/worker.mjs：22 項，含導覽／Auth 不快取、API／POST 不重送及通知路由。

iPhone 實機、LINE 內瀏覽器、Safari 的實際切換與 WebKit 繪圖恢復仍待使用者驗收。模擬事件通過不代表已重現或證明解決原始 iOS 畫面問題，不宣稱 99% 達標。
