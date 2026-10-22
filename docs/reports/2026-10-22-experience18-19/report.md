# 教會 OS 第十八、十九階段：每日靈修版本保護與衝突核對

本機基準為第十六、十七階段 `c6783dbefde5845cd451710e5ba0a28eb0fc055e`；正式主分支仍為 #247 `4a4e05b975d314ef32c5a94ed472b2e0784bf9d5`。本輪完成兩階段本機程式、隔離驗證及發佈方案，未套用正式遷移、部署 Edge Function 或上傳新程式。第十六至十九階段均待發布授權。

## 第十八階段：保存與核准的原子版本檢查

- 先唯讀核對正式兩個既有 RPC 的定義，與倉庫直接核准遷移一致；未讀取靈修正文或同工業務資料。
- 以 Supabase CLI 2.81.3 的 `migration new` 產生 `20261022144927_devotional_versioned_writes.sql`，增加兩個 v2 RPC。依 id 主鍵定位 M＋／2027 年紀錄，在同一交易內鎖定、比較預期版本，再執行既有內容更新／審核及稽核寫入。版本不符不修改資料。
- 核准／退回也增加版本，讓後續編輯能辨識審核狀態變動。保留指定終審人、退回原因、直接核准及經文授權資料控制公開的原規則。
- RPC 維持 security invoker、固定 search_path，PUBLIC／anon／authenticated 不可執行，僅沿用服務端 service_role。沒有新增資料表、擴大使用者權限或改變既有 RLS。
- Edge 處理器新增 `content_update_v2`、`content_review_v2`，要求整數預期版本；使用伺服器驗證的使用者作為操作者，不採信請求內自填身分。舊寫入動作回覆需重載，不走無版本檢查的保存。
- 新讀取回應標示版本保護契約。衝突／刪除回覆 409，缺少遷移回覆 503 並保留失敗狀態，不改呼叫舊 RPC。新動作名稱讓新介面遇到回退的舊後端也不會被當成舊保存動作。
- 本機提交 `c300299` 保存此階段。

## 第十九階段：保留輸入、核對差異、再重新編輯

- 每次儲存與核准都傳送開啟紀錄時的版本。缺少版本或後端未提供版本保護時，暫停儲存與核准，保留閱讀、編輯及副本取回。
- 版本衝突時停用舊版送出，保留欄位與未儲存標記；讀取最新版只做比較，不覆蓋或重送。裝置草稿的前置檢查若先找到衝突，也使用同一條恢復動線。
- 差異依原有 11 個欄位顯示本頁未送出內容與最新正式內容。桌面兩欄、手機單欄；純文字呈現，不解析 HTML。繼續整理本頁時會更新比較文字。
- 選擇「以最新版重新編輯」會再次讀取，若又有新版本則要求重新核對。存在未儲存修改時先確認放棄；取消會保留輸入，確認後用最新內容建立新的編輯狀態，不把舊文字換上新版本號送出。
- 紀錄刪除、讀取失敗及登出期間延遲回應均保留必要恢復動線。既有副本可繼續取回，不自動重建被刪除的紀錄。
- 重開最新版保留日期排序；鍵盤 Enter 核對後回到仍存在的操作按鈕，避免 DOM 重建造成焦點遺失。沿用原工作區、語意色、44 px 控制與大字規則。

## 隔離驗證

| 清單 | 結果 |
| --- | --- |
| 真實 SQL 與 Edge 原始處理器 | **35 項通過**；PGlite、角色 ACL／RLS、版本、審核、稽核回復與不降級保存 |
| 衝突介面 | **79 項通過**；Chromium／WebKit、390／1440 CSS px、鍵盤、觸控尺寸、200% 字級與文字對比 |
| 新檢查合計 | **114 項**，不將重跑重複計數 |
| 原編輯／裝置草稿／副本回歸 | **91／81／87 項通過** |
| 固定品質清單 | **15 組通過、204 個前端程式語法通過** |
| 全站對比 | **41 頁、1513 個文字檢查，零失敗**；實際衝突比較另由新專項涵蓋 |
| Mac Safari | macOS／Safari 27.0.1，本機合成保存觸發衝突、查看兩版本、取消放棄保留輸入、確認後開啟最新內容 |

SQL 測試套用真實既有表結構及新舊 RPC，在 PGlite 內驗證；Edge 測試執行真正 TypeScript 處理器經 Node 移除型別後的程式，只以合成 SDK／Auth 與該隔離 SQL 取代外部服務。兩個同基準請求恰有一個成功；這是單一嵌入式資料庫的序列化驗證，沒有宣稱已完成正式 PostgreSQL 兩個獨立連線的鎖等待／多同工實測。

瀏覽器攔截全部外部請求，API、帳號及正文均合成；Mac Safari 也只開啟本機 fixture，沒有正式保存或通知。固定清單的寫入均為 mock。測試依賴版本沿用前批；CLI 最初找到的另一 runtime 嘗試寫入沙箱外 telemetry 而失敗，改用既有官方 CLI 2.81.3 完成遷移檔建立，沒有新增系統設定或放寬權限。

品質清單開始後，Mac 目視補齊日期排序、鍵盤審閱補齊重新建立按鈕後的焦點；最後以修正後來源完整通過 79 項專項及修改模組語法檢查。固定清單本輪全部通過。既有 fixture 補上真實 API 已有的版本、新版能力標記及寫入動作，原有失敗保留、取消、欄位與未知回應斷言維持，沒有降低門檻。

證據：[checks.json](checks.json)、[手機差異核對](conflict-mobile.png)、[桌面差異核對](conflict-desktop.png)。完整結果置於忽略的 tests/phase4/results 及 checks.json 記載的 gate 目錄。

## 已核對的安全邊界

正式 Advisors 僅作唯讀基準：既有無 RLS policy 資訊 169 件、anon 可執行 security definer 警告 4 件、authenticated 同類警告 37 件，回傳中無這組靈修 RPC 的發現；沒有更動其他功能。參考[無 policy 說明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)、[anon 執行權說明](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)、[authenticated 執行權說明](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)。新 RPC 尚未部署，因此正式 Advisors 不能當成本機新遷移已通過遠端稽核；本機已驗證 invoker、search_path、角色拒絕與既有 RLS，發布後需再查。

依 Supabase 與 Postgres 技能核對[資料庫函式](https://supabase.com/docs/guides/database/functions)及[列鎖定](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)，沿用釘選 SDK，不用 user_metadata 決定授權，不新增 security definer 或用戶可執行服務權限。既有 v1 RPC 保留服務端相容性；正式 Edge 切換新版後，所有公開靈修保存動線要求 v2。

## 發布順序與待驗收

1. 將第十六至十九階段一起準備到既有公開儲存庫；本批依賴尚未發布的前兩階段，不能僅抽出新的 HTML／模組部署。
2. 套用本輪新增兩個 v2 RPC 的遷移，唯讀核對函式定義、ACL／RLS 及 Advisors；不以真實業務寫入作煙霧測試。
3. 更新 daily-devotional-admin Edge Function，核對版本契約及未登入／舊動作拒絕行為。舊頁面將需重新開啟才能保存，不清除登入或草稿。
4. 後端就緒後才合併前端，核對 Pages 成功、正式來源及 Worker `church-os-shell-20261022-experience19`。新增四個版本資源，合計 **84** 個去重快取項目。
5. 若需回復頁面，保留版本保護 RPC／Edge，維持舊客戶端禁止無版本寫入；不以退回無版本保存作為自動恢復。

仍待：正式遷移與 Deno／Edge 部署、遠端 Advisors、PostgreSQL 獨立雙連線及實際多人流程、iPhone 17 主畫面／Safari／LINE 入口、讀屏、弱網與原生存檔。Mac Safari 的本機 UI 驗收不代表正式多使用者資料驗收，也未宣稱全站 99%。目前智慧體足以完成此工作，沒有切換模型。

交付狀態：第十八、十九階段本機完成；前批第十六、十七階段亦尚未發布。待四階段合併公開上傳、資料庫／後端更新及正式上線授權。

