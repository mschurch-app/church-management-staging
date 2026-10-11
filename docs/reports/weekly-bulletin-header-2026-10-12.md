# 週報引導頁版頭與服事人員帶入
日期：2026-10-12

## 原因與影響範圍
- 週報引導頁原版頭過高，標題對比不足；共用按鈕樣式使進度導覽出現紅色大色塊。
- 改用淺色精簡標題列、日期標籤及四欄進度導覽。樣式限於 #weekly-wizard，未改動全站按鈕、堂會 Logo 或共用頁首。
- 第二步主日程序讀取既有 get_website_weekly_data 的當週 schedule；只在可編輯的草稿空白欄位自動帶入。保留已有文字並提供手動帶入。
- 敬拜、禱告、信息、司會依對應角色；其他項目需有同名且唯一的服事角色。未使用下週排班，未修改資料庫或權限契約。
- 儲存後重新載入不再次自動補回使用者刻意清除的內容；日期切換保留原內容並更新當週人員提示。

## 資源版本
- website-maintenance-management.mjs、weekly-program-autofill.mjs：20261012-schedule1
- weekly-bulletin-wizard.mjs、weekly-bulletin-wizard.css：20261012-bulletin1
- website-maintenance.html 更新以上載入版本。

## 檢查與待驗收
- 三個 JavaScript 模組語法檢查通過。
- 以獨立示範資料在 Chrome 呈現 402 × 874 與 1440 × 1000 版頭預覽，載入現有共用配色與一致性樣式，已人工檢視截圖。
- 未操作真實週報儲存、送審或通知，未執行測試套件。
- Mac Safari 與 iPhone 17 實機、真實帳號權限與資料流程仍待驗收；不宣稱整體達標。
