# 本人手札契約與補讀日期修復

日期：2026-10-10（Asia/Taipei）

## 使用者回報與確認原因

使用者三張截圖顯示手札「資料不完整」而鎖定、10/9讀完入口，以及選讀10/9時同區出現10/6已讀未澆水。

October實際me回傳participant.line_subject，沒有participant.id。手札卻檢查id並以它作草稿索引；正常LINE驗證和讀經紀錄也因此被拒絕。浮動靈修入口的關閉記錄也用了相同不存在欄位。先前瀏覽器fixture虛構id，使錯誤未被抓到。

10/6不是證明資料寫錯，而是另一筆待澆水。原waterTarget忽略目前選讀日期，退回其他待澆水紀錄；畫面因此把10/9閱讀與10/6操作混在一起。不得由截圖推定本人是否已儲存10/9或代補進度。

## 修改範圍

- 手札依真正回傳的本人LINE subject驗證資料與隔離同日草稿；不接受缺身分回應。維持伺服器LINE驗證，沒有靠前端欄位授權。
- 靈修浮窗關閉偏好使用相同本人識別；不更動音效或首次說明。
- 補讀期間只提供所選日期的樹下澆水，未讀完不退回其他日期；讀完返回時同步日期與完整生命樹定位。10/9完成澆水後，另顯示「另有10/6已讀完，繼續澆水」，明確點選後才切到10/6。
- 共用原有樣式與操作，沒有新增全域覆蓋。資源版本20261010-journal-contract1更新HTML、controller、October devotional shell、daily devotional controller及journal import；SVG、CSS和2027入口未更動。
- 測試共用fixture執行原production handler並投影真正欄位。完整browser的me不再虛構id；另有端到端契約測試讓瀏覽器讀取／寫入都經原handler。所有外部身分／SDK／DB隔離，不接觸真人或正式資料。

## 真實驗證紀錄

| 項目 | 結果 |
| --- | --- |
| 首次新測試工具 | 本機server路徑重複斜線導致403及Storage SecurityError，3項失敗且中止；harness-failure.json，非應用程式修復證據 |
| 修正測試工具後、應用修復前 | 7項中5失敗、2通過；baseline-results.json；重現手札拒絕及混用日期 |
| 契約瀏覽器最終 | 8項全部通過，增加跨帳號草稿隔離檢查；contract-results.json及兩張合成截圖 |
| 原handler後端 | 17項全通過，backend.tap |
| 完整隔離瀏覽器 | 82項全通過，browser-results.json；me來自原handler |
| JavaScript語法、git diff | 通過；24份異動檔完成secret pattern與人工差異檢查，沒有加入secret |
| Lint | 未執行 |
| Typecheck | 未執行，Node去型別不是Deno型別檢查 |
| Build | 未執行，靜態前端無root build腳本 |
| Mac Safari／iPhone 17 LINE | 未執行，待實機驗收 |

截圖只含合成資料，journal-contract.png顯示實際handler儲存後可編輯且已收藏；selected-makeup.png顯示10/9選讀區不混10/6。不能以隔離結果推定真人已存檔或達成99%。

## Git與發布

修復分支codex/life-tree-journal-contract-fix，基於origin/main 89431f68439dbd57157e60d707328ccb8ee2740d。Commit 68641060f6241d024c90e96146e492c6e93eb4b3已push，PR #60已合併main為526bc93d1ed42ee7da606a1089e91e589c9c7f51。發布證據使用codex/life-tree-journal-contract-release文件分支。13:58:03首次正式HTTP讀回9/15來源符合，六份修改檔仍舊版，保留hosted-check-pending-1.json，不當作成功。13:59:03最終15/15全部HTTP 200且SHA-256符合來源，hosted-check.json，確認原入口與手札依賴已發布。

## Database

本項今日無資料庫結構異動。沒有SQL管理查詢或寫入、schema、migration、RLS、Postgres function、trigger或Edge Function修改／部署。October專用服務仍是上一修復發布的v7；本人進度與手札仍由既有LINE驗證API處理。沒有操作主靈修或舊資料庫，也未寄送通知。

## 風險與下一步

發布後重新開啟原October LIFF，驗收本人手札可輸入、收藏、再次開啟仍保留，與10/9讀完回樹澆水、10/6額外提醒。若回復使用新revert PR恢復前端，不回滾或刪除會員資料。舊已開頁需重新整理才能取得修正，不能只重試舊journal module。使用者後續詢問姓名／LINE驗證／重新整理整張卡片是否必要，已建議改小型更新按鈕並收起技術資訊；本次僅提出建議，尚未實作該布局變更。
