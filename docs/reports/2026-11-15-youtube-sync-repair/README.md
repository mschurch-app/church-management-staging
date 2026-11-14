# 主日上稿 → YouTube 同步故障修復

日期：2026-11-15（Asia/Taipei）。來源 main：`8b2547ca7529c39a53d79a89e526dda8196ba608`。

## 使用者指定範圍

使用教會 OS 既有主日上稿資訊，恢復 YouTube 直播資訊同步；不是修改已結束的 11/8 歷史錄影。沒有取得任意新增公開場次的授權，因此這次測試與修復發布不執行真實 YouTube 同步，不重播審核、不送通知、不建立場次、不修改串流或金鑰。

## 已確認的斷點

正式主日資料中，11/15 的社群預告於 11/12 核准（預告版本 1），週報於 11/14 發布（週報版本 8），且兩者都勾選同步。當前 youtube-oauth v81 要求週報及預告都已通過；預告核准較早時會被拒絕。週報發布的 weekly-bulletin-review v27 又只有 `legacy` 才呼叫 YouTube，同一份新版上稿無法在週報發布時恢復執行。其間失敗不一定留下 publication 紀錄。11/15 沒有紀錄。

手動重試另外傳遞畫面週報版本 8，而正式同步端採核准預告版本 1，會遭 `bulletin_changed` 阻擋。這是版本來源不同，不能移除版本檢查掩蓋。

## 修復

- 週報最終核准發布時，若已存在 approved 預告且其快照勾選同步，重新接上既有同步流程，以預告的版本呼叫。Legacy 仍用原週報版本。未核准或停用的預告、初審、退回及其他堂會不觸發。
- 手動重試先讀取既有 weekly_status 的核准來源版本，才呼叫 weekly_sync。保留版本衝突、審核權限、載入狀態、重複點擊鎖定與頁面切換取消，沒有放寬後端。
- 主日上稿、審核頁、共用模組及 App 快取版本一致更新。沒有版面、資料庫、權限及 youtube-oauth 變更。

正式 weekly-bulletin-review 已讀回與 Git 基準相符；部署時保留它所有現有依賴和通知邏輯。正式 youtube-oauth v81 與 Git 中較舊的來源有差異，本次不部署或覆蓋該函式。

## 證據

- `baseline-handler-tests.log`：修改前來源會失敗，涵蓋這次漏觸發情境。
- `handler-tests.log`：實際 TS 入口經 Node stripTypeScriptTypes 執行，6 組通過，涵蓋先核准預告再發布週報、來源版本、legacy、停用與未核准來源、初審與退回、堂會／權限／版本／登入限制，以及同步失敗保留刊登結果並記錄 failed。
- `browser-results.json`：Chromium/WebKit × 393/1440，4 組通過。測試實際共用模組和主日上稿 HTML 區塊；確認版本 1、前置讀取失敗不寫入、連點一次、來源切換不使用過時回覆、核准欄位鎖定及權限保留。
- `worker-tests.log`：27 項 App 快取／登入回復／離線回歸通過。
- `deno-check.log`：Deno 真實相依型別檢查通過；檢查環境提供平台既有 EdgeRuntime.waitUntil 的 ambient 宣告。順便把已驗證存在的週報排班 overrides 收斂到 closure 外，避免既有 nullable 型別警告，沒有改變排班行為。

所有通知、外部 API 及資料為隔離 mock；無正式 YouTube 更新、無真實審核操作。實體 iPhone、YouTube 直播控制台與新直播實際套用尚未驗收，不能以此宣稱已完成當週直播設定或 99% 全系統驗收。

## 回退

回退本 PR 的前端資源並使用新的 App 快取版本；必要時依保存的 v27 全部檔案重新部署 weekly-bulletin-review。保留既有週報、預告及同步履歷，不刪資料，不清除登入，不修改 oauth 憑證或其他影片。
