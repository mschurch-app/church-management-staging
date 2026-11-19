# 代填改為前台四步驟多選流程

基準 PR337 merge 221fad53d68c9ee536de3f3f64c3a0151b112188。

## 問題與修正

使用者提供的空選單已對應正式狀態：最新3–4月期別仍為draft，原頁面卻預設選取最新期別；已開放的1–2月153個名額沒有帶入。未更動任何期別開放狀態。頁面初次載入優先已開放且有授權未過期名額的期別，代填另有明確的開放期別選擇，不再受旁邊檢視草稿期別影響。無可開放期別時提供原因，不顯示沒有說明的空下拉。

依使用者後續指示，以前台相同操作順序取代逐筆slot下拉：

1. 選期別、查詢並選定名冊會友，多選服事類別。
2. 多選服事項目；鍵盤、歌手與接待使用前台的群組名稱，不要求同工選第幾號。
3. 每項可多選主日，已選其他項目或既有其他項目的同日不可再選；額滿明確標候補。
4. 顯示全部日期與項目，確認本人同意後一次送出。失敗保留選擇，成功顯示實際筆數及候補數。

service-delegate-flow.mjs 接入原授權管理頁。名單、原安排、候補承接及權限撤回恢復保留。原先的單筆表單測試入口改為呼叫新版流程驗收，避免保留失效selector。

## 後端

新增service_signup_admin_register_batch RPC，透過migration staff_service_registration_preference_batch上線。最多60個不同主日，以同一交易處理全部偏好；沿用已驗證的service_signup_admin_register核對帳號／職務範圍／會友／開放日期、記錄代填操作者。會員及slot鎖定順序固定，滿額候補，群組項目優先分配尚有名額的位置。同筆同群組重試保留原登記；同日另一項目拒絕。後面任何一筆不符條件時整批rollback。

僅authenticated可執行，anon=false，security definer與空search_path；函式仍必須通過原get_service_signup_admin帳號及範圍驗證。沒有放寬名冊、資料表或LINE權限。此為刻意授權的definer RPC，與前次同類[安全檢查提醒](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)相同，須保留函式內授權防線。

## 驗收

- 四組Chromium/WebKit ×393/1440，使用合成資料：draft排在open之前的真實回歸情境、先選會友、多類別與多項目、每項多日期、同日互斥、整批一次請求、失敗保留選擇、滿額候補、撤權清空及無水平溢出，通過。
- temporary tables複製函式與整筆交易回退：多日期全部成功、整批防重、混合名額候補、後一筆錯誤不殘留前一筆、重複日期、跨堂會、職務範圍、群組名額分配及候補通過。首次測試fixture中JSON變數與SQL別名同名，修正別名後通過；沒有正式測試寫入。
- 正式讀回anon禁止、authenticated允許、definer及空search_path。以空登入claims核對正式批次函式拒絕forbidden，未觸發寫入。
- 原導覽5項、功能定義20項與Worker27項通過。語法與diff檢查通過。
- 實體iPhone／Android及真實同工操作仍待驗；不宣稱99%。本輪不改任何同工授權或既有登記，不發送LINE訊息。

## 發布與回退

前端五檔（管理HTML／CSS／MJS、新流程模組、Worker）統一版本20261119-delegate-flow1，合併後讀回正式檔比對。若需回退，還原前端至PR337並發布新的Worker版本，原單筆代填RPC仍保留；必要時撤銷新批次RPC的authenticated執行權。已建立的真實登記與代填稽核全部保留，無需資料清除。
