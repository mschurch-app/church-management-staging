# 主知名多筆奉獻修復

日期：2026-11-14（Asia/Taipei）
基準：正式 main `f4349e11e97b458ea3e5e95197eae7271bfb2556`。

## 問題與變更

主日奉獻頁的新增事件使用 `some(group => group.anonymous)` 阻止第二筆匿名現金，第二次點擊沒有新增，也沒有說明。

移除單筆限制，按鈕改為「＋ 主知名」，週報顯示的匿名選項文字改為「主知名」。各筆使用「主知名一、主知名二……」獨立名稱；一般、轉帳及線上奉獻不占用這個序號。儲存的 `bagName` 與卡片名稱一致，保留 `anonymous` 及原有財務分類與權限。十、十一及更大的序號使用中文數字。

重開已儲存草稿後，從現有最高序號接續新增；移除其中一筆不更改其他已編號名稱。這個序號用於同一份當週紀錄，不是跨紀錄的會友身分或正式收據編號。

舊匿名紀錄在畫面顯示為主知名，單純查看不會寫入資料；若使用者明確儲存可編輯草稿，才隨草稿保存新名稱。已送審／入帳紀錄仍鎖定。沒有批次改寫歷史金額、資料庫 migration、Edge Function 或既有週報快照。

HTML 模組、主知名命名模組與 App 快取版本一併更新。沒有變更共用外觀、登入流程、原有點收或審核規則。

## 驗證

- `unit-database.log`：中文編號、舊資料相容、移除／追加、現金／電子款分流、原子保存、四筆主知名完整儲存與複審入帳、未授權直接 RPC 拒絕及既有週報隱私檢查。
- `browser-results.json`：Chromium／WebKit × 393／1440 CSS px。測試多筆新增、保存重開再加、失敗保留輸入、獨立金額、現金合計、刪除不重編、舊資料查看無寫入、保存後本人點收送審、送審鎖定、唯讀權限及無水平溢出。
- `payment-browser.log`：既有現金／轉帳／線上款、寫入成功但讀回失敗時鎖定重送、恢復只讀不重寫、一位點收後送審與另一位補勾回歸。其測試帳號已補上正式既有的 `counter` 權限，並依目前程式先存草稿再確認；這是修正過時測試資料，未改正式點收規則。
- `worker.log`：27 項既有 App 快取、導覽與離線恢復檢查。
- `cash-*.png`：合成資料畫面截圖，保留於本機報告目錄。

隔離 SQL 為 PGlite；瀏覽器 API 為本機測試資料，不是正式帳號。真實 iPhone／LINE 實機與正式帳號送出未執行，沒有以代理登入或建立真實奉獻驗收。不能宣稱已達全系統 99% 或真機驗收。

重跑命名及 SQL：`node --test tests/finance-anonymous-offerings.test.mjs tests/finance-payment-methods.test.mjs tests/finance-cash-offering.test.mjs tests/finance-bulletin.test.mjs`。
瀏覽器依賴：既有 `tests/package-lock.json` 的 Puppeteer；新測試可透過 `PLAYWRIGHT_MODULE` 指定已安裝的 Playwright Core，並以 `WEBKIT_EXECUTABLE` 指定 WebKit。未改正式依賴。

## 回退

回退本次 PR 的四個正式資源：`finance-cash.html`、`finance-cash.mjs`、`finance/anonymous-offerings.mjs`、`church-os-sw.js`，並使用新的快取版本發布。無須清除登入、快取資料或資料庫紀錄。已保存的多筆奉獻仍為原有支援的獨立袋資料；回退後舊畫面無法再加第二筆，但已存資料仍可讀取。不可回滾或刪除實際奉獻資料來回退介面。
