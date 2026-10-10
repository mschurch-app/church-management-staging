# 四天挑戰輪替與未來日期隔離

## 要求與目前狀態

使用者要求再給每人一項挑戰，連續四天各體驗四類畫面。10/10唯讀盤點：5名參與者，今日各1筆，4筆active／1筆resolved；未來10/11–10/13尚無紀錄。

因每人每日唯一鍵且已有完成紀錄，已請使用者選擇：今天算第1天並保留今日紀錄，或另外新增可保留舊紀錄的測試輪次機制。尚未收到選擇，未執行新增挑戰。rotation.sql只有第一個選項獲確認後才能使用；不是migration或自動排程。

## 輪替預演（唯讀）

以今日各人既有類型為起點，依worm／wind／typhoon／trouble循環，每人未來三天各另一種類型。dry-run.sql確認5人均可有4筆／4種類，10/10–10/13每日5筆，共20筆；需新增15筆未來紀錄。僅適用目前5人，後加入者不自動納入。

rotation.sql具台北當日、5人、今日5筆、未來0筆及新增15筆檢查，單一DO交易只INSERT，不UPDATE／DELETE；任何條件改變需重新盤點。未授權清除已完成挑戰或移除唯一鍵。

## 必要修復

預先存在的未來挑戰原先會提前影響共同花園與管理統計，也可透過API提前完成。garden／overview改用challenge_date<=台北當日；resolve_challenge讀回日期並拒絕未到期挑戰。本人畫面既有未來日期過濾保留，舊的未完成挑戰繼續保留，請每日完成照顧；若有累積挑戰，按道具逐項完成可看見其他場景。沒有自動代完成或獎勵。

## 測試證據

- 修正前backend 23項：19通過／4失敗（baseline.tap）。
- 修正後backend 23項全通過（backend.tap）；含花園／管理未來隔離、台北午夜到期、四種道具本人範圍與舊17項回歸。
- 瀏覽器真實handler契約8項全通過（contract-results.json）。
- 完整82項瀏覽器回歸全通過（browser-results.json），四類手機場景與桌面截圖隨附。外部SDK、LINE及資料庫均隔離，不寫真人資料。
- Mac Safari及iPhone／LINE實機未執行；不宣稱整體99%或真實喇叭出聲。
- Lint、Typecheck、Build未執行；Node去型別執行不是型別檢查。

## 發布與資料

僅October專用svwgfgyxxgbqabosriom的tree-reading-october-test，PR #62已合併main（b1961955aee71d1098d04db9e205e1dfe989adc7）；已部署v8 ACTIVE，verify_jwt=false與原LINE ID token驗證保持。14:12:27（台北）讀回source符合Git，部署source重跑23項全過；真實無token請求401及CORS正確（deployment.json、deployed-backend.tap、unauthorized-probe.json）。無schema／migration／RLS／Postgres function／trigger修改。主靈修及舊資料庫未操作；沒有發送App／LINE／Email通知。前端資源無異動。

## 待辦與回復

日期隔離修復已發布及讀回驗證；部署後唯讀仍5人／今日5筆、1完成／未來0筆。待使用者選擇測試起點後，才可新增挑戰並驗證每人四種類、每日5筆及既有紀錄校驗碼不變。回復程式採Git revert／部署先前source，不刪除會員紀錄。未來新增挑戰若需要撤回須另核准精確範圍，不能自動刪除。
