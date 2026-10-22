# 教會 OS 第八批：長表單錯誤定位

原始開發基準：`5a32b95a79ce4087b1e022e41ace1a01e80d2291`。發布前整合已上線的 `42259ea59172f25ba75db4c577fa276b02c835e8`，保留 LINE 身分核對資源及版本；唯一重疊檔案為 App worker 的資源清單，已合併兩批資源並重跑 22 項 Worker 檢查。範圍為主日奉獻登錄及主日社群預告／週報雙軌編輯。

## 改善的操作

奉獻原有訊息只指出缺少姓名、金額或用途，無法辨識多位奉獻者、多筆明細中哪一筆需要修正。現在以可點選的清單列出「奉獻者 2 · 第 1 筆」等位置，欄位旁也顯示相同說明；點選後展開所在明細並定位輸入。涵蓋日期、兩位不同點收同工、姓名、待補奉獻編號、金額、指定用途及既有逐筆確認要求。原生必填、金額非負與整數限制改由同一份前端檢查呈現；後端檢查仍是寫入依據。

週報雙軌編輯在儲存／送審遇到日期或標題缺漏時會指出對應欄位，錯誤清單可切換至正確頁籤再定位。日期以使用者目前看到的日期欄位為準，避免日期已清空時仍保存原本隱藏欄位的舊日期。草稿仍可保留尚未完成的信息內容，沒有把所有信息欄位一律改成草稿必填。

兩個工作區沿用同一個 `form-guidance.mjs`：修正時清除該欄的舊提示；切換／重繪紀錄時移除過期提示；焦點在操作鎖定解除後移動。伺服器或網路失敗維持原有保存與只讀恢復流程，保留內容，不把有效欄位標成資料錯誤。沒有新增瀏覽器持久儲存。

錯誤連結沿用 component contract 的 `data-app-control="custom"`，避免被共用主要按鈕樣式覆蓋；點擊範圍至少 44 CSS px。HTML、共用模組、CSS 及 App shell cache 版本統一為 `20261022-experience8`。這批沒有資料庫、登入、權限或通知規則變更。

## 驗證

| 範圍 | 結果 |
| --- | --- |
| 新欄位定位測試 | Chromium / WebKit，390 / 1440 CSS px，共 104 項通過；合成奉獻與週報資料 |
| 奉獻兩人點收與恢復 | 34 項通過 |
| 社群預告送審 | Chromium / WebKit 各 22 項，共 44 項通過；取消、Esc、成功、儲存／影片／API 失敗、通知待確認、回應遺失及讀回失敗 |
| 週報、靈修、審核與服事固定流程 | 89 項通過 |
| Worker | 22 項通過 |
| 奉獻金額與既有狀態規則單元測試 | 2 項通過 |
| 修改 JavaScript 語法與 diff | 通過 |

合計 295 項相關檢查通過。新測試包括必填日期、重複點收人、多筆明細定位、展開收合內容、原值保留、負數／小數、補編號、逐筆確認、跨頁籤定位、修正後清除提示，以及伺服器失敗後有效欄位不被誤標與可正常重試。

既有送審 fixture 原先只模擬保存結果，沒有填入實際控制器本來會帶入的週報標題；此次補上有效標題，保留全部送審情境及原斷言。資料、帳號、API 回覆與截圖全部為本機合成；沒有正式資料寫入、真實通知或對外內容發布。

檢查清單：[checks.json](checks.json)。合成預覽：[奉獻手機](finance-mobile.png)、[奉獻桌面](finance-desktop.png)、[週報手機](weekly-mobile.png)、[週報桌面](weekly-desktop.png)。

可重現：

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/form-guidance-browser.mjs
node tests/finance-counter-confirmations-browser.mjs
node tests/weekly-promo-submit.mjs
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers BROWSER_ENGINE=webkit node tests/weekly-promo-submit.mjs
node tests/phase3/browser.mjs
node tests/phase4/worker.mjs
node --test tests/finance-cash-offering.test.mjs
```

phase3 先啟動 `node tests/serve.mjs`；瀏覽器套件沿用本機既有 runtime。

## 尚待驗收

這批新表單的真實 iPhone 鍵盤、讀屏、弱網及 Mac Safari 完整流程仍待實機驗收；WebKit 引擎測試不是 Safari 實機。先前使用者確認的 LINE 返回、切換 App 返回、完全關閉重開正常，屬於當時已發布版本的結果。未執行全站 quality-gate，不宣稱整體 99% 或全站優化完成。
