# 10/25 主日預告 Instagram 發布恢復

## 正式環境證據

- 10/25 M+ 社群預告 `de00fee7-0d4d-4f7b-9b9e-d0730cf37f6f` 於 2026-10-21 15:08:53 UTC 核准，版本 1。
- Instagram 工作於 15:08:54 UTC 建立，容器 `17907066123571420` 已取得，但 15:09:41 UTC 記為 `failed / instagram_api`，沒有 Instagram media ID。
- 原函式最多等約 40 秒，且將 `instagram_timeout`、`instagram_processing` 等錯誤都折疊成 `instagram_api`；目前無法由舊紀錄判斷實際子原因。
- 已核對公開影片可播放：8 秒、720×1280、H.264、AAC 48 kHz、3,050,625 bytes。資料庫存放路徑及影片網址可用。

## 修正

- 失敗重試先檢查並沿用原 Instagram 容器；若容器已標示 `PUBLISHED`，停止重送，避免重複發文。
- 保留逾時、影片處理失敗等具體錯誤代碼；記錄 Meta 數字錯誤碼與子碼，不記錄權杖。
- 牧師／師母在已核准預告中可讀取真實 Instagram 發布狀態，失敗時可按「重試發布 Instagram Reel」。核准提示不得當成 IG 已發布證明。
- `publication_status` 同時開放原有編輯者與審核者查詢，保留既有權限。

## 驗證與剩餘門檻

- `node tests/instagram-weekly-resume.mjs`：通過，驗證重用原容器、只呼叫一次正式發布。
- `node tests/instagram-weekly-media-preflight.mjs`：通過。
- `node --check weekly-bulletin-review.mjs`、`git diff --check`：通過。
- 正式 Edge Function 部署曾被自動審查拒絕；本變更尚未在正式環境部署，也尚未實際重試 Instagram。部署後須從審核頁查看容器狀態，再只執行一次重試並以 media ID 與 IG 畫面確認。
