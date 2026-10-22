# 教會 OS 第五批：返回恢復與權限快取

## 重現與改善

合成測試確認原本模組層級的 `readAccess` 快取會被不同 client 共用：先讀 actor-a，再讀 actor-b，第二次仍取得 actor-a。這是隔離測試的證據，不是正式資料外洩事件的證明。

快取現以 client 為單位隔離，追蹤經原有驗證流程確認的使用者；登出、切換身分、token 更新及使用者更新時失效。同一身分的普通並行讀取仍合併，重複 focus 所引發的同身分 SIGNED_IN 不多發請求。舊讀取、逾時後才完成的讀取及較早的 fresh 讀取都不能覆寫較新狀態；重新驗證失敗也不恢復舊快取。Auth callback 僅同步調整記憶體狀態，不呼叫 Auth/RPC，不讀寫任何登入 storage。既有 LINE 核對、堂會、功能與後端權限判定保留。

返回恢復另補三個邊界：

- 離線時，手動「重新整理」會保留原頁與草稿，提示連線後再試，不先丟棄輸入。
- CSS 隱藏的 dialog 不會被當成開啟視窗而永久擋住恢復；實際開啟的視窗與進行中操作仍保護。
- 登入與付款等一次性回呼即使 DOM 空白，也不顯示會重播回呼的重新整理控制，由原回呼流程處理。

第三、四批保留的兩個 M+ 首頁舊靜態斷言已對齊現行功能，並新增實際瀏覽器檢查：五大入口、財務直接連結、其他分類浮窗及未授權功能不可見。沒有為了通過測試將財務移回舊浮窗。

共用模組與引用統一為 `20261022-experience5`，更新 App shell cache。多數變更檔只是引用版號；沒有資料庫 DDL、業務資料寫入、真實通知或新背景排程。

## 驗證

| 驗證 | 結果 |
| --- | --- |
| 權限快取單元測試 | 17 項通過；含 client／帳號隔離、切換與登出中的延遲回應、逾時、fresh 失敗、去重、RPC-only adapter、個人 metadata 不授權 |
| 首頁／主題／功能導覽單元測試 | 17 項通過；先前兩個過期首頁斷言已更新，沒有刪除對應檢查 |
| 新恢復安全測試 | Chromium / WebKit 共 22 項通過；離線、草稿、寫入中、可見／CSS 隱藏浮窗、一次性回呼及 storage 不變 |
| 現行首頁瀏覽器行為 | Chromium / WebKit，390 / 1440 CSS px，共 40 項通過 |
| 原有 iOS 模擬返回 | 20 項通過；普通返回、BFCache、blur/focus、草稿、操作保護、防循環、捲動座標恢復 |
| 安靜啟動更新 | 19 項通過；含實際本機 Service Worker 安裝、更新、重載與防循環 |
| LINE / PWA scope | Chromium / WebKit 共 80 項通過；合成 OAuth、錯 state、過期、換帳號、取消及一次性回呼 |
| 設定／權限／堂會／首頁回歸 | phase2 50 項通過 |
| 靈修／週報雙軌／審核／服事回歸 | phase3 89 項通過 |
| Worker | 22 項通過 |
| 變更 JavaScript 語法與 diff | 通過；44 個已追蹤變更模組語法檢查，並檢查新增測試 |

所有帳號、token 及 API 都是合成資料；新測試不使用正式憑證。執行 PWA 測試時第一次缺少預設路徑 WebKit，改指定既有 `/private/tmp/church-webkit` runtime 後，兩個引擎 80 項完成。沒有下載新依賴。

參照本次核對的 [Supabase Auth 事件文件](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)。已讀當日 changelog；本批沒有更換 SDK 或 Auth 登入方法。

## 實機驗收清單（尚未執行）

| 入口／操作 | 應確認的結果 |
| --- | --- |
| iPhone 主畫面圖示 → 既有 LINE 登入 | 完成後原入口能載入正確同工身分，不留白屏；若進入 Safari，需分開記錄，不能當成原 App 已恢復 |
| 編輯未送出的測試文字 → 切換其他 App → 返回 | 同一頁仍存在時，文字、操作狀態與捲動位置保留，沒有自動儲存或重複送審 |
| 離線 → 返回 → 按恢復 | 不重載、不丟棄輸入；連線後才能選擇確認丟棄並重載 |
| 關閉再開 App | 登入與已保存資料正常；尚未保存草稿目前只在頁面記憶體，OS 終止頁面後的續填不在本批保證範圍 |
| Mac Safari 重開、返回、兩倍文字 | 原流程可操作、沒有重載循環或被遮住的控制 |

WebKit 引擎、合成生命週期與模擬 iOS user-agent 不等於使用者 iPhone 或 Mac Safari。尚未宣稱已完全修復該手機的畫面繪製問題、原生 LINE App 自動喚回，或全站 99% 達標。全 quality-gate 尚未於本批重跑；上表個別列出已完成範圍。

## 重現

本機靜態站使用 `node tests/serve.mjs`，其餘測試使用 `http://127.0.0.1:8769`：

```sh
node --test tests/access-cache.test.mjs tests/mplus-shell.test.mjs tests/mplus-theme.test.mjs tests/mplus-function-nav.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/resume-safety-browser.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/mplus-shell-behavior.mjs
CHURCH_TEST_ORIGIN=http://127.0.0.1:8769 node tests/foreground-resume-browser.mjs
CHURCH_TEST_ORIGIN=http://127.0.0.1:8769 node tests/startup-update-browser.mjs
PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/pwa-line-scope.mjs
node tests/phase2/browser.mjs
node tests/phase3/browser.mjs
node tests/phase4/worker.mjs
```

新增證據位於本機 `tests/phase4/results/resume-safety/` 與 `tests/phase4/results/shell-behavior/`；原固定測試沿用各自結果位置，不上傳瀏覽器 profile 或私人資料。
