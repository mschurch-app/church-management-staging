# 十月生命樹補讀後端修復

日期：2026-10-10（Asia/Taipei）

## 現象與原因

使用者截圖顯示10/9補讀的「連線暫時中斷，請稍後重試／重試記錄10/9」。查得前端將未知後端錯誤統一映射為此訊息，因此畫面不能證明是使用者網路問題。

實際部署的專用October Edge Function版本6與Git原始碼逐字一致：mark_read及water_tree在非今天日期檢查七天期限時呼叫shiftDate，但整份程式未定義此函式。JavaScript短路運算讓今天路徑不受影響；合法補讀會拋ReferenceError，catch統一回503 unavailable。這也讓部分應回400的過期補讀變成503。資料庫completion_type允許on_time和makeup，並非枚舉或constraint不符。

唯讀查詢13:15–13:30（台北）該函式版本6的POST有3次503、3次200，OPTIONS有5次200。沒有記錄request body，不能將某次請求斷言為截圖使用者，但來源碼和隔離重現已確認可確定的補讀缺陷。報告不保存LINE subject、IP、Token、姓名或手札。

## 修正

只在同一Edge Function補上UTC日曆日期位移函式；保留台北今日、最近七天、加入日期、LINE驗證、本人範圍、唯一鍵及原澆水時間。沒有更動前端、頁面布局、讀經分數或2027正式入口；已開啟的頁面仍可用原重試按鈕呼叫修正後服務。

## 驗證

- 新增backend.mjs，直接執行production handler，隔離外部SDK、LINE和DB，不把handler的回應換成成功fixture。Node 22.23.3內建stripTypeScriptTypes只移除型別，不是typecheck，也不是Deno runtime實機。
- 修正前15項：8通過／7失敗，包含10/9記錄、七天補讀、過期日期、加入日期、重複提交等；baseline.tap保留失敗證據。
- 修正後15項全部通過，fixed.tap。包含10/9讀經與澆水、10/3–10/9七天、今天、過期／未來／非法日期、加入日期、重複提交保留原讀經與澆水時間、無法代他人澆水、未驗證／未加入拒絕、DB失敗不假造完成。
- 既有82項隔離瀏覽器回歸全部通過、無未捕捉例外，browser-results.json。先前瀏覽器測試攔截API回應，沒有執行實際後端日期檢查，因此漏失此錯誤；今後後端測試列為必跑。
- git diff、JavaScript語法及11份異動檔的secret pattern檢查通過；搭配人工檢視原始碼差異。Lint、完整Deno Typecheck、Build：未執行；靜態前端無root build腳本，環境無Deno。Mac Safari與iPhone／LINE實際帳號操作待驗收，不能據隔離測試宣稱使用者已存檔。
- 參考Supabase官方changelog（已讀2026-10-10）及Edge Function testing文件：https://supabase.com/docs/guides/functions/unit-test 。此修復未變更SDK版本或平台設定。

## Git與部署

修復分支codex/life-tree-makeup-backend-fix，基於origin/main 065ee7692b312c5b6a94994578410cf6e30a256b。修復commit 76885ebd2dc881723c198c7aabb1d34fc0df4cb7已push，PR #58已合併main為92bbde691aa7994f067d043d085d4fa320e5b016。專用同名函式已部署版本7 ACTIVE，verify_jwt維持false且原LINE驗證不變。13:34:37（台北）讀回source逐字符合修復來源，SHA-256 cdaa72fbe2cdca149dbae6d8976109d5b8a5dafa6d005046fe68807001c6ef4c。直接對讀回source再跑15項全部通過（deployed-v7.tap）。無token的真實HTTP請求回401 login_required，正確CORS（hosted-auth-check.json）。發布證據由codex/life-tree-makeup-backend-release文件分支同步。

## Database

本項今日無資料庫結構異動。只唯讀檢查專用專案svwgfgyxxgbqabosriom的constraint及服務日誌；部署後唯讀確認5位參與者、43筆讀經，completion_type及日期constraint、本人與日期唯一鍵、參與者外鍵維持。沒有SQL寫入、schema、migration、RLS、Postgres function或trigger修改，不代使用者補紀錄。這不是個別使用者成功存檔的證明。Edge Function程式修正與部署另列，不把它當成無後端變動。未操作主靈修專案或舊資料庫。

## 回復與後續

回復可用已保存於Git的版本6程式重新部署原函式，不需任何資料刪除；但會恢復補讀失敗，應優先前進修正。已讀回完整source比對並重跑相同15項，確認版本與LINE驗證設定；只用無憑證請求檢查未授權仍被拒絕，不模擬或取得真實LINE token、不替真人寫入資料。由使用者原頁點重試，確認10/9記錄後再澆水。
