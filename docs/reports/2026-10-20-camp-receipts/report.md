# 籃球營收據交付紀錄

範圍僅 2027 熱火籃球營。教會奉獻、協會其他奉獻與歷史匯入依使用者指示延後規劃。

- 編號 B116 + 台北付款日期（民國年月日）+ 四位當日序號；資料庫原子計數及唯一限制，重印沿用原號。
- production、已付款、金額與付款訂單一致、索取收據且抬頭完整才開立。已存在外部收據作業者停止，避免重複開立。
- 付款與報名同一交易完成後，延遲觸發開立。開立失敗寫入 audit_log，不回滾已接受的付款，可由下載入口重試。
- 退款將收據作廢；正式收據保存抬頭快照，禁止無痕修改。已下載／印出的文件不會遠端消失。
- 印章只有後端 bundle 與經驗證的收據回應包含。原 PNG 與產生的 seals.mjs 不進公開 Git；prepare-camp-receipt-seals.mjs 重建部署檔。
- 後台沿用啟用帳號、M+ 籃球營權限與匯出權限；家長沿用原付款查詢 UUID 憑證，僅 POST，完成頁暫存於同分頁 24 小時；沒有憑證需聯絡同工。
- 下載為含印章的 HTML 檔，可離線開啟，透過列印儲存 PDF。未新增寄信、紙本郵寄或稅務上傳自動流程。

## 驗證

- 7 項模板／編號測試通過。
- 本機 PGlite 0.5.10 的 14 項資料庫情境通過：自動開立、重印不重號、日期換日、未付款／測試／不索取排除、外部衝突、身分與 RPC 權限、快照保護、退款作廢、排除外部重複開立佇列、序號滿額阻擋。
- 正式資料庫以假資料交易驗證自動開立、同號重印、日期、金額、LINE Pay 方法與退款；全部 rollback，無扣款、無留下測試收據。
- 已部署 Edge 的未登入 401、無效 UUID 400、未知 UUID 409、非允許 origin 403 通過。
- 樣張在 Codex 瀏覽器顯示四章且下載成功。這是桌面瀏覽器證據，不是實體 iPhone 或 Mac Safari 的列印驗收；不宣稱 99%。
- Supabase advisor 新表僅出現 RLS enabled/no policy 資訊，為刻意拒絕直接讀取；RPC 僅 service_role 可執行。其他既有站台警告未在本次範圍更動。

## 重跑

`node --test tests/heat-camp-receipt.test.mjs`

`npm install --prefix /tmp/camp-receipt-db-test --save-exact @electric-sql/pglite@0.5.10`

`PGLITE_MODULE=/tmp/camp-receipt-db-test/node_modules/@electric-sql/pglite/dist/index.js node tests/receipt-database.mjs`

正式 migration：20261020030916。Edge：heat-camp-receipt。沒有修改背景排程或自動化。
