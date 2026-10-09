# 教會 OS 第一階段：登入、身分、權限與儲存穩定

日期：2026-10-09。範圍為正式教會 OS `mscos.mchurch.online` 的核心穩定性。手機與桌面的品質要求沿用 iPhone 17／Mac 共用框架。

## 交付狀態

核心修正與隔離回歸已完成；三項資料庫更新與 LINE 會友服務已套用正式環境。前端版本為 `20261009-stage1`，發布結果另見 `deployment.json`。

**完整實機驗收尚未完成，不能宣稱第一階段已全面驗收、所有按鈕皆通過，或已達 99%。**

## 本次修正

| 項目 | 實作與效果 |
| --- | --- |
| Email／LINE 身分 | 新增受保護的主帳號連結表。僅依擁有者明確核對連結；同名、同職稱、相同權限不會被當作同一人。Email 登入可辨識已核准的 LINE 別名，避免再次要求綁定。 |
| 同工名單／審核人 | 同工列表與初審／複審選單依已核對主帳號顯示一次。審核同一人的兩種登入身分不能分別擔任初審與複審。同名但未連結者維持分開。 |
| 名冊對應 | 主帳號可查到經核准的 LINE 會友綁定；身分核對不會自動核准會友資格，也不猜測姓名或 Email 對應。 |
| 完整儲存 | 姓名、職稱、啟用、堂會、角色、逐頁操作、常用、通知偏好與服事類別改成一次資料庫交易；中途失敗整筆回復。現有同工同步觸發器亦涵蓋於回復。 |
| 重試與衝突 | 每次操作有請求編號。回應遺失後，原內容重試回傳原結果；重複編號不能送不同內容。版本檢查拒絕覆蓋其他管理員較新的設定。 |
| 移除權限 | 同時撤銷主帳號與核准別名的後台資格、功能、常用及服事範圍；保留 Auth 登入帳號、會友與綁定資料。重複移除安全；擁有者不能被移除。 |
| 操作恢復 | 儲存失敗保留輸入並恢復按鈕。儲存成功先更新名單再關閉編輯，修正立即重開讀到舊版本的競態。服事類別載入完成前不允許儲存，切換堂會忽略舊回應。 |
| LINE／App | 取消登入後，延遲的授權回應不會再寫入 session。原 App 重開可接續未完成的加密登入交接；錯誤帳號、交接過期及資料驗證失敗均拒絕。 |
| 每日靈修／服事登記 | 支援有效 Access Token 的靈修登入；一般斷線、LINE 429／5xx／逾時保留憑證並提供重試，只有明確失效才重登。保留指定靈修日期。 |
| 權限檢查 | 管理交易由伺服器查當下啟用的擁有者資格、已接受邀請狀態與 Auth session；角色和首頁偏好不能授予權限。跨堂會及超出授權操作拒絕。 |

### 既有四個 LINE 身分需要人工核對

目前正式資料有 4 個舊 LINE 登入身分，曾取得後台權限但缺少可靠的主帳號連結紀錄。歷史 Auth 稽核資料不足以證明來源，因此本次保留原資料與權限，沒有自動合併。

擁有者進入「教會設定 → 同工帳號與權限」，在標示「LINE 登入身分待核對」的卡片選擇「核對既有同工身分」，明確選取本人既有同工並確認。核對成功後兩種登入共用一張同工卡片，審核選單亦合併。這 4 筆尚未核對前仍可能出現兩張卡片。

## 測試與證據

107 項可重現的隔離檢查已通過，另有 3 項正式 API 匿名拒絕測試通過。35 個管理頁於手機 390 CSS px 與桌面 1280 CSS px 檢查頁面載入、表頭高度與溢出；首頁另檢查 375／430 CSS px。

| 測試 | 數量 | 環境／結果 |
| --- | ---: | --- |
| [資料庫交易與權限](db-results.json) | 43 | 隔離 PGlite PostgreSQL、合成帳號與會友、實際遷移及既有同工同步觸發器。交易回復、版本衝突、重試、撤銷、名冊保留、同名隔離均通過。 |
| [管理表單與會友頁面](browser-results.json) | 11 | 獨立 Chrome。管理表單儲存／撤銷接到隔離 PostgreSQL；會友服務使用合成回應。遺失成功回應後重試只產生一筆操作紀錄。 |
| [加密 App 登入交接](auth-browser-audit.json) | 11 | 獨立 Chrome 的兩個分離 storage context，測試重開、取消、錯誤帳號、過期、封包修改與阻擋彈窗。OAuth 與 token 驗證為 fixture。 |
| [LINE 服務異常](line-provider-results.json) | 12 | 執行實際 Edge Function 原始碼，外部 HTTP 全部模擬。跨 Channel／過期拒絕，429／5xx／逾時可重試，ID 服務故障可使用有效 Access Token。 |
| [Email 登入與連結](email-login-results.json) | 12 | 真實登入介面、合成 Auth API。核准連結、未連結、無權限、斷線、重開及綁定頁重試均通過；個人 metadata 不能偽裝核准連結。 |
| 功能目錄 | 18 | 既有 `tests/app-catalog.mjs` 通過；41 項入口、6 類群組。 |
| [正式 API 拒絕測試](hosted-results.json) | 3 | 實際 Supabase API 拒絕匿名名單、匿名儲存及未驗證 LINE 請求；沒有真實個資變更。 |
| [管理頁回歸](browser-audit.json) | 35 頁 × 2 尺寸 | 合成 API。每頁正常字體表頭 164 CSS px，無橫向溢出、無未處理 JavaScript 錯誤；常用移除／加回、通知浮窗捲動、設定入口及服事領袖入口通過。 |
| [語法檢查](syntax-results.json) | 90 模組、21 inline script | 全部通過。語法通過不等同完成每一個功能操作。 |

[儲存失敗仍保留輸入的畫面](account-retry-390.png)、[手機首頁](dashboard-390.png)、[桌面首頁](dashboard-1280.png)、[管理員編輯](account-editor-390.png)、[審核設定](review-390.png)。截圖均為合成資料。

測試程式與固定依賴位於 `tests/phase1/`，執行方式見其 README。未寄出真實邀請、LINE 通知、付款或內容發布。

## 正式資料與資料庫檢查

核心遷移前後比對：12 個 Auth 登入帳號、11 個後台帳號、188 筆會友；後台帳號、授權、LINE 會友綁定的摘要雜湊一致。新連結、請求紀錄與稽核表初始皆為 0 筆。正式受保護讀取確認擁有者能力、帳號名單與審核設定可讀；沒有藉測試建立正式合成同工。

三個新增私有表開啟 RLS 並撤銷匿名／authenticated 直接讀寫，僅透過有當下資格檢查的資料庫函式操作。對私有表不建立瀏覽器可用的政策，因此其 [RLS 無政策 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 為刻意封鎖設計。新增外鍵索引已補齊。

[完整 Advisor 摘要](database-advisors.json)：可由 authenticated 呼叫的 SECURITY DEFINER 提醒由 38 降為 28；既有匿名函式提醒 1 項未變。這些仍須逐一檢查授權邏輯，不能把提醒減少當作整個系統安全認證。[authenticated 函式檢查](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)、[匿名函式檢查](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)。

既有 76 項外鍵索引提示、3 項 RLS InitPlan 警告及 1 項寬鬆政策警告本次未擴大；新增稽核索引尚無正式操作資料，因此會列入 unused index 提示。後續應按實際查詢逐項處理。[外鍵索引](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)、[RLS 查詢](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)、[政策整理](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)。

## 待驗收與剩餘工作

| 項目 | 狀態／所需證據 |
| --- | --- |
| 真實 iPhone 17 LINE 授權、回到已安裝 App、關閉重開 | 待驗收。分離 Chrome context 可驗證交接邏輯，但無法證明 iOS 自動跳回 App。現有 Web App 在 LINE／Safari 授權後可能需要使用者切回原 App；原生自動返回能力需另以實機技術驗證。 |
| 真實 LINE 每日靈修、生命樹、服事登記與會友審核 | 待使用者本人或指定測試帳號驗收。此次靈修與服事測試為有效憑證／服務回應模擬，沒有取得本人的 LINE token。 |
| 完整服事問卷填寫、認領與候補同時競爭 | 待隔離季別／測試同工資料驗收。本次只驗證載入、斷線與重試，沒有把整季登記認列完成。 |
| Mac Safari、iOS 鍵盤、大字與安全區域 | 待實機證據。此次 Mac 上 Chrome 使用隔離環境；不能替代 Safari。 |
| 多連線鎖競爭、死結、實際高延遲 | 待獨立 Postgres 測試環境。PGlite 為單連線；已設短交易、鎖期限及版本檢查，但沒有用正式同工做競爭寫入。 |
| 全部頁面的所有按鈕 | 尚未全部操作。35 頁載入與版面回歸，以及本次表單／登入／通知／捷徑動線通過；各頁邀請、上傳、下載、匯出與對外通知需另按固定清單驗收。 |
| 整個系統的資料權限與效能盤點 | 本次加強管理交易與審核設定；既有其他資料表政策、舊函式與查詢需逐項審查，不能推定已全部合規。 |
| 新共同元件、完整功能歸類與兩個官網美化 | 後續階段工作，沿用既定框架；本次核心穩定性修正不代表已完成整站重設計。 |

99% 的分母須包含待驗收項目，故上述 107 項全部通過不能轉述為產品整體 100% 或已達 99%。

## 發布與回復

- 保留正式 App 識別、既有 Auth storage key、LINE provider/channel、會友名冊與既有堂會資料。
- 前端與 Service Worker 採 `20261009-stage1` 版本；不清除使用者登入 storage。
- 前端前一版本為 `063538a`。如需回復，在新分支還原前端並遞增快取版本發布；避免對正式分支強制推送。
- 新增資料庫表為加法更新。回復前端時保留已核准連結與稽核資料；不能直接刪除 Auth 或會友，也不能直接清空連結。後端如需回復必須另寫保留資料的遷移並先隔離驗證。
- 遷移先以 Supabase CLI 建立，因 repository 已存在晚於本機 UTC 時間的人工日期遷移，三個新增檔案按既有依賴重排至 `20261009150001`～`20261009150003`。正式套用使用 MCP；不對現有正式資料庫執行 reset。
