# 第一階段隔離測試

所有帳號及 LINE 憑證皆為合成資料。測試使用本機 PGlite PostgreSQL、複製的資料表定義與實際同工同步觸發器，沒有正式個資，也不寄送通知、邀請或發布。

```sh
cd tests
npm ci --ignore-scripts
npm run phase1:db
npm run catalog
```

啟動 repository 根目錄的靜態伺服器於 `127.0.0.1:8769` 後，執行 `npm run phase1:browser`、`npm run phase1:email` 與 `npm run phase1:regression`。可用 `CHURCH_TEST_ORIGIN` 與 `CHROME_EXECUTABLE` 調整本機伺服器與瀏覽器路徑。

- 資料庫測試包含交易回復、同步觸發器回復、版本衝突、重複請求、跨堂會拒絕、權限撤銷及同名者不誤合併。
- 瀏覽器儲存測試接到隔離 PostgreSQL 執行真正交易。LINE 會友 API、OAuth 與憑證驗證使用隔離回應，無法替代真實 LINE／iPhone 驗收。
- `baseline-functions.sql`、`baseline-extra.sql`、`schema.json` 等為 2026-10-09 的測試基準，僅供隔離測試，切勿套用正式環境。
- 結果寫入 `phase1/results/`。PGlite 為單一連線，鎖競爭／多連線死結仍需獨立驗收。

使用 Node.js 22.13 以上執行 `npm run phase1:line`，可驗證 LINE 429／5xx／逾時／過期及跨 Channel 情境；此測試執行實際 Edge Function 原始碼，但所有外部服務回應皆為合成 fixture。
