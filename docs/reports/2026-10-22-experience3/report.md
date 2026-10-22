# 教會 OS 第三批操作體驗修正

## 這次改善

- 審核頁在後端未回傳審核資格、或明確僅供檢視時，顯示原因並隱藏決定區；操作處理器也檢查資格。原後端權限與禁止自審保持不變。
- 主日預告與週報清單其中一份載入失敗時，指出尚未載入的清單，保留可讀部分；不把不完整空清單當成全部無待辦。重新載入成功後移除警示。
- 審核已保存後，若原項目所屬清單無法讀回，維持安全恢復狀態，只允許讀取確認，不重複送審。
- 補齊「協會網站」設定入口的 ID 與分類。
- 私有首頁偏好寫入函式補上既有 `association_news`、`sermon_preparation`，與前端 33 個可設定捷徑一致。偏好不增加功能權限；仍保留 owner、帳號存在、堂會、數量與未知 key 檢查，私有函式不對 anon/authenticated 開放。
- 更新相關資源版本與 App 快取版本。登入流程沿用上一批版本。

## 驗證

| 檢查 | 結果 |
| --- | --- |
| 新增審核回饋：Chromium / WebKit，390 / 1440 CSS px | 52 項通過；包含可審、false/缺欄唯讀、取消、部分讀取、恢復、對比與無溢出 |
| 隔離 PostgreSQL 帳號與偏好 | 44 項通過；兩個捷徑可保存、驗證別名同步、權限不增加、未知 key 回滾、非 owner 拒絕 |
| 同工申請資料庫回歸 | 23 項通過 |
| 功能 definitions | 20 項通過 |
| 功能目錄 | 18 項通過，47 個功能 / 7 組 |
| Service Worker | 22 項通過 |
| JavaScript 語法與 diff 空白檢查 | 通過 |

測試全部使用隔離合成帳號與 API，不寄送真實 LINE、不發布主日內容、不寫入正式業務資料。畫面證據保留於本機 `tests/phase3/results/feedback/`。

正式資料庫只更新私有函式定義，已唯讀確認兩個 key、空 search_path、caller 檢查及 anon/authenticated 無 EXECUTE；沒有新增或修改任何帳號、奉獻、週報紀錄。安全 advisors 與修改前相同：168 項 RLS 無 policy 資訊、4 項 anon definer、36 項 authenticated definer 既有警告；不是零警告，這批未新增。參考 https://supabase.com/docs/guides/database/database-linter 。

## 尚未完成的固定驗收

- 舊 phase3 完整測試已修正審核 fixture 缺少 `canDecide` 的誤報。新負向情境通過後，舊週報編輯測試仍嘗試點擊已由雙軌頁籤取代的隱藏側欄；目前固定測試不能宣稱全數通過。保留失敗檢查與診斷，不移除門檻或開放隱藏控制。
- phase2 瀏覽器在設定頁表頭高度檢查失敗（145.8125 px，規格 164 px）；`mplus-theme.css` 的現有覆寫需於下一批統一處理，本批未改此樣式。
- 真實 iPhone 17、已安裝主畫面 App、LINE 返回及 Mac Safari 完整流程仍待實機驗收；WebKit 引擎不等於 Safari 實機。
- 尚未達成整體 99% 驗收，這份紀錄只說明本批變更與已完成檢查。

## 重現方式

於 repository 根目錄啟動 `node tests/serve.mjs`，執行：

```sh
node tests/phase1/database.mjs
node tests/coworker-applications-db.mjs
node tests/phase2/definitions.mjs
node tests/app-catalog.mjs
node tests/phase4/worker.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/weekly-review-feedback.mjs
```

Playwright 與 WebKit 使用既有本機測試 runtime；可用 `PLAYWRIGHT_BROWSERS_PATH` 指定已安裝的引擎。完整固定 gate 的未通過項目維持上述狀態。
