# LINE 會友綁定部署追蹤 — 2026-11-10

PR #308 已獲使用者核准並合併。兩份資料庫 migration 已套用，member-access v30、newcomer-register v36 已部署，部署後逐檔核對相符。

驗證：26 項本機 HTTP／資料庫測試、82 項 PWA／LINE 回歸、Chromium／WebKit 393／1440 四組合成流程通過。正式資料庫以 BEGIN／ROLLBACK 驗證電話優先、綁定、重試、撤銷、無驗證資料的人工審核及全新朋友建檔；未留下合成會友或送通知。正式 Edge 對無效合成憑證回傳 HTTP401。

前端 Pages run 42735577840 的建置成功，但第一次部署持續 syncing_files 後超過10分鐘被取消。只重試 deploy job 後沿用同一取消部署識別並立即失敗。此紀錄觸發全新 commit、建置 artifact 與部署識別，功能程式維持 PR #308 的已驗證內容，不修改資料庫、帳號或權限。

資料庫及 Edge 的回退版本保留於本機 deployment-baseline。新增的真實會友、綁定與私有稽核資料不得因前端回退刪除。實際手機 LINE 驗收仍待頁面正式發布後進行。
