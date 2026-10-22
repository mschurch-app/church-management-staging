# LINE 暱稱與同工姓名的身分核對

## 問題與修復

既有「核對 LINE 身分」僅能將 LINE 別名連結到另一個帳號，候選刻意排除目前帳號。獨立 LINE 同工已在名單中，仍被標記待核對，卻永遠無法在候選找到自己。

核對頁分別列出同工姓名、申請時填寫的姓名、LINE 暱稱。已啟用的獨立 LINE 同工可由擁有者向本人查證，再勾選「我已向本人核對」並確認。沒有申請紀錄時顯示「尚未提供」，不推測申請姓名。姓名相同或不同均不會自動核准身分。

僅確實有重複帳號時展開「已有另一個帳號？連結既有帳號」，保留原本的帳號連結流程、獨立同一人確認與權限變更提示。

## 資料與權限

新增私人 `church_auth.line_account_identity_confirmations` 核對回條，記錄 LINE 身分、同工姓名、核對擁有者與時間。資料表啟用 RLS，匿名與一般同工均無直接讀寫權。公開 RPC 為 security invoker，私人寫入 RPC 使用既有有效擁有者與 session 檢查、空 search_path 及既有帳號編輯互斥鎖。

新確認操作只新增回條，不更動帳號、堂會、角色、功能、服事、會友連結或擁有者權限。核對版本包含受保護帳號狀態、LINE 身分與申請資訊；資料改變必須重新載入。寫入時鎖定相關列。回條重試不重複新增；姓名或 LINE subject 改變後原回條不再滿足核對狀態。

舊有合併帳號流程不改寫，仍由管理員明確選定另一個來源帳號並確認。

## 驗證與限制

- 隔離 PostgreSQL：`tests/line-identity-review-db.mjs`，13 項通過。
- Chrome / WebKit，390 與 1440 CSS px：`tests/line-identity-review-browser.mjs`，49 項通過，結果見 browser-results.json。包含姓名差異、無自動寫入、舊版本、重試、成功後移除操作、返回名單、重複帳號連結、成功後名單更新失敗與延遲回應取消。
- 既有帳號設定頁：97 項通過。
- 既有申請與審核 PostgreSQL：23 項通過；帳號原子儲存／權限回歸：44 項通過；Service Worker：22 項通過。
- 畫面、姓名、帳號與 LINE 資料均為合成資料；測試封鎖外部請求，沒有核准或連結任何真實人員。
- iPhone 17 與 Mac Safari 實機驗收待執行；WebKit 自動測試不等同實機驗收，不宣稱達成 99%。
- Migration 經 Supabase CLI `migration new` 建立，並在 PGlite PostgreSQL 實際套用測試。CLI `db pull --local --yes` 因本機 127.0.0.1:54322 未運行而失敗，未宣稱 migration history 已同步。
- 使用者授權後，正式資料庫已透過帶有原函式雜湊前置檢查的單一交易完成 schema 更新；確認回條仍為 0 筆，未替真實同工確認身分。網站發布結果另存本機發布回條。

## 發布順序

取得本批網站與資料庫更新授權後，重新比對原有函式定義並以單一交易套用新增表格／函式與兩個讀取 RPC 的變更，再更新網站。發布前核對 GitHub main 的並行變更，只上傳本批明列檔案；發布後比對正式資源 SHA、查核資料庫權限／安全建議，進行無真實資料寫入的頁面煙霧測試。

發布合併檢查：以正式 main `5a32b95a79ce4087b1e022e41ace1a01e80d2291` 為基底，保留 #234 待審申請預讀與 #235 服事表優化；重疊帳號頁及 Worker 只合入本次核對修復。

正式資料庫複查：新表 RLS=true、匿名 RPC 執行權=false、authenticated 直接讀取權=false。安全建議只對這張私人表顯示預期的 [RLS 無直接政策 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)，維持全拒絕並只由受保護擁有者 RPC 存取；效能建議顯示新建外鍵索引尚未使用的 [Unused Index INFO](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)，保留以支援核對人外鍵。未為消除提示開放私人表。
