# LINE 會友辨識、新朋友登記與綁定（待核准發布）

目前僅完成本機隔離修改與合成測試，未更新正式資料庫、Edge Functions、GitHub 分支或正式站。已依使用者確認：沒有手機、生日可核對的既有會友，送同工確認後綁定。此流程只使用既有會友權限，不授予同工、後台或跨堂會權限；會友功能清單待使用者另補。

## 最終流程

1. LINE 登入後未有有效會友綁定，開啟新朋友表單。未填寫者每次重新進入仍會被邀請，包含公開功能；「稍後填寫」僅允許當次返回公開功能。
2. 姓名輸入以350ms debounce 從第一字開始，逐字縮小同堂會的姓名前綴候選。每次最多8名，只回傳姓名與10分鐘有效、綁定本次 LINE 身分的隨機 token，不回傳 roster ID、手機片段、生日或小組。更新輸入立即清除舊候選，遲到回應不覆蓋新查詢。
3. 選擇姓名，再確認「是本人」。後端優先選擇名冊有效完整電話核對，沒有有效電話才選完整生日（支援儲存的 YYYY-M-D / YYYY/M/D）。不傳答案至前端比較，也不能跳過手機改用生日。電話與生日都是既有資料核對，沒有發送簡訊 OTP。
4. 核對成功才帶出該人的基本登記資料；不顯示牧養備註、小組等非本表單欄位。送出前仍沒有綁定或開通會友功能。送出時原子補齊空白／無效的基本欄位並綁定原名冊，不另建新朋友，也不重複建立關懷任務。已有有效欄位保留。
5. 無可核對欄位或需要同工協助時，送出完整表單至私有審核紀錄，建立／沿用同一待審綁定申請，不帶出舊個資、不立即綁定。沿用現有同工審核入口；正常審核核准且選擇相同候選名冊後才補齊空白欄位。若同工選擇不同名冊，不將原候選的補填資料寫入另一人。
6. 沒有符合的候選，或使用者明確確認候選皆非本人，走新朋友建檔並綁定。重試維持同一 request_id。

## 保護與限制

- 必須先以官方 LINE 驗證或伺服器擁有的 OAuth identity 驗證身分，不採信 user_metadata 或前端 member_id／subject。
- 候選 token、核對結果、完成表單均綁定堂會、channel、LINE subject；有效10分鐘。核對後原始姓名、電話、生日變更時，必須重新核對。
- 每身分每日最多120次姓名查詢、5次核對嘗試（更換候選不重設），每天最多3筆人工審核表單；沿用入口與身分速率限制。
- 已綁定、停用、撤銷、被拒絕或已封存名冊不能透過自助流程靜默重新綁定。競爭同一名冊只能有一個有效綁定。核對失敗不暴露原資料。
- 新表格位於 church_auth 私有 schema，RLS啟用、撤銷 public/anon/authenticated 直接讀寫，RPC僅service_role可執行。無額外 staff 身分或權限授予。
- 登記／綁定／補資料／audit 同一交易完成；任一步失敗回退，不留半完成個資。
- 快速連按送出、核對重選與不確定結果維持保護，重選不抹除自行填寫的電話。

## 會友照片中的舊版問題

- pending曾隱藏新朋友表單；新版持續顯示可填寫的入口。
- 共用20秒watchdog無法判斷被替換DOM的查詢結果；member panel改由自身loading/error/result管理回饋，不把查詢當成重複寫入。
- 2026-11-10台灣07:35:59、07:36:06、07:36:15後端有三次 line-member HTTP401，與截圖時間相符；未由時間推定同一使用者，亦未斷言憑證過期。新版區別驗證未通過並提供重開LINE入口。LIFF內不呼叫不支援的login/logout；外部瀏覽器僅於使用者明確按重新登入後使用SDK。沒有改動Codex登入或auth.json。

## 本次驗證

- `node --test tests/member-claim-db.test.mjs tests/line-newcomer-http.test.mjs`：26項通過，含既有7項DB回歸、電話優先、生日備援、私有API、跨身分／堂會／request_id、資料變更、到期、重複、撤銷、競爭同一名冊、失敗回退、人工審核及無同工授權。
- `node tests/line-newcomer-browser.mjs`：Chromium/WebKit ×393/1440四組全部通過。包含未綁定邀請、延後一次後再邀請、新登記、OAuth堂會、公開入口、pending不誤報、401、逐字候選、電話／生日、重選保留輸入、連按只送一次、人工審核不開通。
- `node tests/pwa-line-scope.mjs`：82項通過。TypeScript entrypoints及修改的JS模組語法檢查通過。
- 皆為本機合成資料或完全攔截API的瀏覽器測試；未用真實會友帳戶操作，未寫入正式資料。實體Android／iPhone LINE尚待發布後驗收，未宣稱99%。

## 發布與回退

待明確授權將本次程式與資料庫修補推送至使用者現有公開repo `mschurch-app/church-management-staging`，並更新正式站。自動核准審查先前拒絕GitHub功能分支更新，尚無新PR。

1. 再次確認main、目前Edge版本與備份。舊準備commit b03025df不含本次修正，絕不可直接發布；須依最新review-files重建tree/commit及PR。
2. 依序套用 `20261110003239_verified_line_newcomer_onboarding.sql`、`20261110010236_verified_existing_member_claim.sql`。
3. 部署member-access，再部署newcomer-register，執行安全advisors及只讀權限檢查；任何正式合成交易採BEGIN/ROLLBACK，不送通知。
4. 發布前端及一致的 `20261110-line-claim1` 快取版本，確認Pages成功與正式檔案hash，再請使用者實機LINE驗收。
5. 需要回退時還原前端及保存的Edge bundles。若有真實資料已綁定／待審，保留新增會員、binding、candidate、receipt及review紀錄；不刪會友或session、不退回不相容舊constraint、不刪私有audit。停用自助入口即可保留資料並交同工處理。

前一版Edge唯讀備份保存在本機 `deployment-baseline/`，不包含於公開程式套件。原開發worktrees與未提交檔案未被本次工作修改。
