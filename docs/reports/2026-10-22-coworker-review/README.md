# 同工申請審核：角色範本增減功能後無法儲存

## 證據與原因

正式服務唯讀查核顯示審核請求收到 HTTP 400 / P0001，申請仍為待審。P0001 本身不包含具體驗證原因，不能單憑這個代碼認定使用者當時的全部勾選內容。

本機已重現一條會出現相同畫面與提示的確定路徑：選「行政管理」範本，再勾選「熱火籃球營」，送出時仍帶 administrator 角色；PostgreSQL 審核／帳號儲存函式正確拒絕 `role_grants_mismatch`。原先前端將此錯誤隱藏成「操作尚未確認完成，請保留資料並重試」。舊瀏覽器測試以成功回應取代實際儲存，沒有涵蓋這個組合。

## 修正

- 增減功能後，若不再符合所選角色範本，立即改為「自訂權限」，在選單旁明確說明原因；保留目前功能與各項操作勾選；手動選擇自訂也不清空勾選。只改操作權限時仍保留匹配的角色範本。
- 送出前再次核對角色與功能，避免舊畫面或程式調整留下不一致狀態；只送目前明確勾選的功能，不補授其他功能。
- 區分審核欄位錯誤與申請欄位錯誤，對角色、堂會、功能、版本變更及不存在的申請提供明確修正方式。未知伺服器詳細內容仍不直接顯示。
- 儲存成功後若帳號名單刷新失敗，明確顯示「審核結果已儲存」，不誤報儲存失敗，也不重新提供同一筆核准按鈕。
- 更新審核／API／帳號與申請頁引用及 App shell cache 為 `20261022-coworker-review1`。沿用待發布的 LINE 記住帳號更新；本次沒有更換 Auth、放寬後端驗證或改動資料庫結構。

## 驗證

| 項目 | 結果 |
| --- | --- |
| 新瀏覽器 → 本機 PostgreSQL 完整審核 | Chromium / WebKit 30 項通過；UI 產生的 payload 直接送進既有 public review、private save 與稽核函式 |
| 明確錯誤訊息單元測試 | 5 項通過；包含未知私有錯誤不外露 |
| 原同工申請資料庫測試 | 23 項通過；版本比對、同人連結、堂會隔離、無權自審、原子回復、去重與稽核 |
| 原同工申請／審核瀏覽器 | 45 項通過 |
| LINE / PWA 登入回程 | 82 項通過 |
| Worker | 22 項通過 |
| 變更程式語法、引用、diff | 通過 |

新增測試涵蓋加功能、減功能、只調整操作、未變動範本、版本衝突保留文字與勾選、只授選中權限、不得成為 owner、一次稽核、成功後刷新失敗不能誤報儲存失敗。所有帳號及資料均為合成，沒有正式帳號核准、真實通知或權限寫入。

正式服務僅查詢錯誤摘要、RPC 定義、角色設定及待審筆數；沒有讀取申請人姓名、聯絡方式或代為審核。安全建議為既有項目，本次沒有 DDL 或權限異動。實機 iPhone 與 Mac Safari 仍待驗收；本機 WebKit 不等於實機驗收，不宣稱全站 99%。

## 重現測試

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/coworker-review-flow.mjs
node --test tests/coworker-application-api.test.mjs
node tests/coworker-applications-db.mjs
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/coworker-applications-browser.mjs
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/pwa-line-scope.mjs
node tests/phase4/worker.mjs
```

[Supabase PostgREST 錯誤碼文件](https://supabase.com/docs/guides/api/rest/postgrest-error-codes)說明 P0001 是 PostgreSQL raise 預設代碼，需結合具體驗證訊息判讀。

此修正尚未發布。與待發布的 LINE 記住帳號修正合併核對範圍後，另請使用者確認完整發布範圍；不沿用第五批 48 檔授權。
