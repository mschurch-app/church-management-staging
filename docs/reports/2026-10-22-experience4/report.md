# 教會 OS 第四批操作體驗修正

## 本批結果

- M+ 管理頁移除主題對共用表頭高度、內距及標題字級的衝突覆寫。一般字體回到 164 CSS px；兩倍文字使用自動增高，不裁切標題與身分。
- 表頭主要按鈕與返回連結至少 44 × 44 CSS px，修正手機舊樣式更高優先序造成的 32 px 點擊區。
- 加深底部導覽、週報說明及核准資訊欄位名稱，補足文字對比。
- 週報雙軌頁籤沿用主控制器的 working / needsRefresh 狀態。等待時顯示文字及轉圈、設定 aria-busy、暫停會衝突的操作；沒有虛構百分比。系統減少動態效果時停止旋轉。
- 「重新載入狀態」改為兩個頁籤共用，移除重複 ID；重新載入透過既有草稿確認，不強制覆蓋未儲存資料。
- 社群送審回應遺失、缺少完成回條、或送審已成功但狀態讀回失敗時，禁止再次儲存／送審，改查詢既有紀錄。
- 取消週報送審時不再重新載入並覆蓋未儲存文字；取消新增日期亦保留原內容。
- 頁籤支援左右方向鍵、Home / End，保留焦點與未儲存文字。
- 所有相關樣式、模組及 App shell 版本統一為 `20261022-experience4`。多數變更檔只是共用資源版本更新；本批沒有資料庫、登入憑證或權限規則異動。

## 隔離驗證

| 驗收 | 結果 |
| --- | --- |
| 表頭 / 主要點擊區 / 文字放大 | 96 項通過；Chromium、WebKit，M+ / SHiNE，3 個管理頁，375 / 390 / 430 / 1280 / 1440 / 1920 CSS px，並驗證 390 / 1440 的兩倍文字 |
| phase2 設定、權限、堂會、首頁 | 50 項通過；M+ 先確認轉向現行五中心首頁，舊常用功能增刪排序流程在仍使用該介面的 SHiNE 驗證 |
| phase3 靈修、週報審核、服事與週報雙軌 | 89 項通過；使用可見頁籤、日期、儲存、送審與共用重新載入控制；保留失敗／斷線／缺少回條／重複點擊／唯讀／草稿取消檢查 |
| 社群預告送審 | Chromium 22、WebKit 22 情境通過；包含正常、取消、拒絕、通知待確認、回應遺失、缺回條、送出後讀取失敗 |
| 主題及底部導覽單元檢查 | 10 項通過 |
| 功能定義 | 20 項通過 |
| Service Worker | 22 項通過 |
| 修改模組語法、diff 空白 | 通過 |

測試使用合成帳號、截獲 API 與本機測試站，沒有正式資料寫入、LINE 通知或內容發布。證據保留於本機 `tests/phase2/results/`、`tests/phase3/results/` 與 `tests/phase4/results/header/`。

第三批列出的表頭高度與週報隱藏側欄失敗現已解決。舊 phase3 直接點擊隱藏側欄及主題產圖的測試，改為實際雙軌日期切換與「沿用核准圖、不重新製圖」流程；Canva 選圖本身仍由既有專用測試負責。

## 仍需驗收

- `tests/mplus-shell.test.mjs` 有兩個既有靜態斷言不符合目前首頁：舊 `mplus-navigation.css` 版本字串及 `hub-tile` button 建構字串。兩個斷言所讀取的 `mplus-dashboard.html`、`mplus-navigation.mjs` 與本批修改前完全相同；保留失敗，不修改門檻來宣稱全測試通過。
- WebKit 引擎驗證不代表實體 Mac Safari。真實 iPhone 17、主畫面 App、LINE 返回與 Mac Safari 完整驗收仍待實機。
- 本批沒有宣稱全站 99% 或所有固定 gate 全數通過；上述檢查分別記錄，不合併重複計數。

## 執行

啟動 `node tests/serve.mjs` 後：

```sh
node tests/phase2/browser.mjs
node tests/phase3/browser.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/header-geometry.mjs
node tests/weekly-promo-submit.mjs
BROWSER_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/weekly-promo-submit.mjs
node --test tests/mplus-theme.test.mjs tests/mplus-function-nav.test.mjs
node tests/phase2/definitions.mjs
node tests/phase4/worker.mjs
```

社群預告測試使用既有本機 Playwright runtime；header 測試可透過 `PLAYWRIGHT_MODULE` 指定。所有頁面仍由原後端檢查實際授權。
