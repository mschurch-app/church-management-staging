# 補讀記錄按鈕停留等待狀態

## 使用者問題與原因

截圖是箴言第9章讀到末尾，補讀按鈕顯示「正在記錄讀經…」，下方同時有今日澆水後的靈修邀請。

程式檢視確認：markRead會改補讀按鈕文字為等待，但renderTree只重設今日按鈕文字，補讀文字未恢復；成功新增記錄後，populateMakeupDates移除已讀日期並清空選單，原按鈕處理器又依賴選單值；加上已讀紀錄的提早return，沒有後續導航。原隔離回歸只檢查資料及澆水，缺少成功後原按鈕文字／返回操作的斷言。

今日靈修邀請依今日紀錄顯示，原本未排除補讀另一日，容易混淆及遮住當下操作。

## 資料核對範圍

只讀十月測試專案svwgfgyxxgbqabosriom的近期進度聚合：10/8四筆、10/9三筆、10/10兩筆，這些筆數在查詢當時均有watered_at。未取得可唯一對應截圖當事人的LINE身分，因此不宣稱已確認本人那次寫入。沒有改寫、刪除或新增正式進度，也沒有重發挑戰。

## 修正與驗證

- 今日與補讀按鈕共用依實際狀態呈現的renderReadingAction：等待、原處錯誤／重試、已記錄前往澆水、已澆水回生命樹。選單移除日期後，以目前已載入的經文日期操作。
- 已有讀經紀錄的再次點擊只做導航；成功後直接帶到可見澆水入口，已澆水則回樹標題，沒有重複寫入。
- 等待中保護日期與經文展開／收合，取消舊花園切換；失敗、逾時在按鈕原處顯示回饋並解除busy。
- 200回應必須包含實際日期紀錄才宣告成功，移除原先自行補造前端成功紀錄的fallback；重新整理進度確認後清除舊錯誤。
- 補讀另一日且未完成澆水時暫收今日靈修浮窗，今日澆水後的邀請仍保留；首次說明、小喇叭及音樂恢復不變。
- 經文末端觀察只在目前日期生效並於解鎖後停止，避免已完成／失敗訊息被舊回呼覆蓋。

修正前新增斷言實際失敗，顯示補讀完成後仍為「正在記錄讀經…」，見baseline-results.json。修正後一輪65項通過；新逾時測試最初只縮短window.setTimeout，未縮短AbortSignal.timeout，350ms回應比正式15秒期限早，等待預期錯誤的斷言逾時，見first-fixed-results.json。已修正隔離測試為只縮短API的原生deadline，正式程式15秒保持不變。後續加入手機402px及重新整理確認已存資料後，最終65項全部通過，見results.json與兩張合成資料手機截圖。JavaScript語法、git diff及新增文字secret／私人識別掃描通過；Build、Lint、Typecheck未執行。

驗證皆為Chromium隔離虛構LINE／API／經文／天氣，不使用真實使用者憑證或寫入正式資料。Mac Safari及iPhone 17／LINE實機尚待驗收，不宣稱99%。


## 修改範圍、Git與回復

只改十月頁面的主模組、HTML資源版本20261010-makeup-save1、既有隔離測試及治理文件；CSS、圖示、藝術、音檔、API、登入與權限不變。分支codex/life-tree-makeup-save-state，基於main 75c561e1。Commit 1047d774eeac5b6abd764448f6213286e5c54610已push；[PR #52](https://github.com/mschurch-app/church-management-staging/pull/52)合併main為382c619cd7fc9e89e3500b6ad900027742c10d5a。11:50:11（台北）正式HTML及JS皆HTTP 200且SHA-256符合來源，見hosted-check.json；11:49:19首次仍為舊版，保留hosted-check-initial.json且不算通過。發布證據使用codex/life-tree-makeup-save-release文件分支同步。

回復可revert此PR並走既有Pages發布；沒有DB rollback或刪除使用者資料的需求。

## Database

本項今日無資料庫結構異動，亦無資料寫入。只讀十月近期紀錄聚合；無migration、schema、RLS、function、trigger或Edge Function部署。同日之前五筆挑戰與二月匯入各有獨立紀錄，不據本項推定整天無資料操作。
