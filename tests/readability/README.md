# 可讀性檢查

使用 Node 22、puppeteer-core 與本機 Chrome。`audit.mjs` 啟動本機服務，攔截業務 API、外部 LINE SDK 與身分；不使用正式憑證、不寫入正式資料。畫面巡查停用 Worker，Worker 行為由第四階段測試另驗。

```sh
PUPPETEER_MODULE=/path/to/puppeteer-core/lib/puppeteer/puppeteer-core.js READABILITY_TAILWIND=/tmp/tailwind.js READABILITY_OUTPUT=/tmp/readability READABILITY_SCREENSHOTS=1 READABILITY_ENFORCE=1 node tests/readability/audit.mjs
PUPPETEER_MODULE=/path/to/puppeteer-core/lib/puppeteer/puppeteer-core.js node tests/readability/contract.mjs
```

`READABILITY_TAILWIND` 是事先取得的公開 Tailwind CDN 腳本本機副本，供既有今日經文頁使用；不將下載內容寫入產品。`READABILITY_ROOT` 可指向固定舊版本資料夾，`READABILITY_FILES` 可用逗號指定補驗入口。比較前後須使用相同的合成資料。

`audit.json` 記錄每個入口、實際到達網址、尺寸、狀態、文字對比、表頭、溢出及可見控制。對比不是完整無障礙或業務驗收；詳見本次報告的限制。`contract.mjs` 則以實際共用 CSS 驗證主要按鈕、次要按鈕、白底選取控制、特殊場景及深色區，防止共用規則再次覆蓋用途。
