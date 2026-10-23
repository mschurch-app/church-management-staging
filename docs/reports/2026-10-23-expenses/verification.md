# 支出記帳與憑證拍照驗證

2026-10-23，整合正式分支6c73c13後接續支出功能。保留轉帳、線上與兒童主日學奉獻及週報更新。

## 功能與權限

行政 → 奉獻與財務 → 支出記帳。日期、分類、事工、受款人、用途、金額、預支／核銷、零用金／銀行、憑證或無憑證原因。可手機拍照或從相簿選擇，最多10張，每張JPEG/PNG/WebP 8MB。照片先暫存，儲存後隨該筆支出保存；歷史版本的照片仍可由有權人員閱覽。

提報 → 會計核對 → 師母審閱 → 牧師核准 → 付款登錄。退回須寫原因，修改後從會計重新送審；核准未付可沖銷，已付款不可直接更動。付款登錄要求日期與付款憑據，不會執行銀行轉帳。每次變更保留版本、操作者與快照。前端使用穩定requestId重試、後端原子交易與版本鎖，結果不明時保留內容並防止重複提交。

支出角色獨立於奉獻，由負責人在「支出人員權限」指定；負責人沒有自動取得記帳／審核／付款角色。本次沒有自行授予任何同工新的支出權限。提報人只看自己的紀錄，審核人員可讀一般支出。個別薪資不應放入此一般摘要。已付款與核准待付款分開加總，不作帳戶餘額宣稱。

資料存於非公開finance schema，五張表皆RLS，anon/authenticated無schema或RPC直接存取權。finance-expenses v1 ACTIVE；gateway verify_jwt=false，函式內逐次使用Auth.getUser驗證JWT並由伺服器傳入actor，拒絕未登入及停用別名帳號。照片private bucket、限制Storage直接存取，閱覽先檢查權限再發60秒簽名連結。

## 驗證

- 9項單元／PGlite資料庫測試：完整流程、付款鎖定、金額與憑證驗證、跨堂會／他人紀錄拒絕、退回原因、過期版本、重試冪等、照片歸屬與歷史閱覽、停用別名不可繼承權限。
- Chrome390與1440 CSS px各19項流程：拍照欄位capture、檔案暫存上傳、照片閱覽、斷線重試、按鈕避開底部導覽、逐關送審付款、加總、明確授權角色、無頁面溢出或腳本錯誤。browser.json與本地截圖留存。
- 導覽／權限／M+ shell16項；catalog18項；worker23項；語法及diff檢查通過。
- 正式唯讀檢查：5張表RLS、RPC僅service_role、照片bucket private且8MB、owner profile可運作；未登入正式端點HTTP401。正式支出筆數仍為0。
- 安全advisors未新增WARN/ERROR。finance私有表的INFO「RLS Enabled No Policy」是刻意禁止直接資料存取，透過service-only RPC檢查角色。參考：https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy。

未建立正式測試帳目、未發送測試通知。瀏覽器檔案測試不代表真實iPhone相機驗收；Safari與iPhone實機待驗收，未宣稱99%。
