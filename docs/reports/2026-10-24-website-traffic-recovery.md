# 官網流量讀取恢復

## 原因與修正

正式官網 Google tag 正常傳送 page_view（已驗證 Google 回應 204）；報表設定卻讀取另一個名稱接近、沒有資料的 GA4 資源。已於原生 Google Analytics 串流詳情核對 Measurement ID、網站網域及資源編號，再更正正式報表設定。真實數據與設定備份留在私人工作區，不提交儲存庫。

GA4 亦包含本機預覽流量，因此每日及近 7 / 30 天報表都改以 `hostName` 限定 `mchurch.online`、`www.mchurch.online`，以 Google 聚合結果計算使用者數，避免將每日使用者相加或混入 127.0.0.1。

本次以已部署的 daily-traffic-report v22 作為基準，將其既有 LINE 通知與去重邏輯同步回原始碼，保留停用 App 推播的行為。此批新增的是報表網域篩選；不再將較舊 Git 版本的 App 推播行為部署回去。

以既有 refresh 動作重新計算近期既有報告，保留既有通知與已讀狀態；refresh 不建立通知，也不重送 LINE。Google Analytics Admin API 尚未啟用，故這次串流對應以原生 GA4 詳情核對；Google Analytics Data API 已能讀取正確網站數據。

## 驗收

- 26 項報表與端點測試通過：實際 Google 請求的正式網域篩選、缺值與零區分、台北時區、上游失敗保留、無重送與 LINE 路由。
- 正式診斷已證明：更正資源後可讀取 mchurch.online 的歷史與即時數據；測試資料與實際訪客分開記錄。
- 資料庫無結構遷移，亦無帳務或見證內容變更。
