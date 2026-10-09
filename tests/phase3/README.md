# 第三階段工作流程驗收

沿用 tests 的固定依賴；啟動根目錄靜態伺服器 `127.0.0.1:8769` 後執行：

```sh
cd tests
npm run phase3:browser
```

可指定 `CHURCH_TEST_ORIGIN` 與 `CHROME_EXECUTABLE`。使用獨立 Chrome profile，攔截所有 Supabase Auth／RPC／Storage／Edge Function；其餘外部請求封鎖，沒有真實通知、發布或業務資料寫入。

- 四個工作區：每日靈修編輯／審核、週報上稿、週報審核、服事登記管理。
- 缺少 API 完成回應時不回報成功；共用 stylesheet 不重插，避免表頭載入跳動。
- 正常、空、失敗、未儲存切換、重複點擊、較慢讀取、寫入後載入失敗與不確定的斷線回應。
- 原審核角色、唯讀權限、事工範圍與撤銷存取。
- 原生 dialog 的取消、必填原因、背景捲動鎖定與焦點恢復。
- 375／390／430／1280／1440／1920 CSS px 版面、主要控制觸控範圍及 164 px 表頭。
- 手機／桌面可見文字對比採 computed style 與漸層端點近似；不是照片背景、所有焦點狀態或全部實機文字大小的完整驗收。

結果、合成畫面與瀏覽器 profile 寫入被忽略的 `results/`，精選證據另存 `docs/reports/2026-10-09-phase3/`。Chrome viewport 和合成 API 不代替 iPhone 17、LINE／已安裝 App、Mac Safari 或真實發布串接驗收。
