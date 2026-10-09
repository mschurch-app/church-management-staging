# 第四階段發布檢查

固定依賴使用 Node 22.23.3、puppeteer-core 25.12.0、PGlite 0.3.14。安裝與啟動：

```sh
cd tests
npm ci --ignore-scripts
npm run serve
```

另開終端機，執行固定完整清單：

```sh
cd tests
npm run quality:gate
```

可設定 `CHURCH_TEST_ORIGIN`、`CHROME_EXECUTABLE`；預設本機來源 `http://127.0.0.1:8769` 與 Mac Google Chrome。使用 `node quality-gate.mjs phase4/worker.mjs phase4/browser.mjs` 可只重跑指定清單，這不代表完整驗收。

清單包括前端語法、41 個功能目錄／權限定義、登入與 LINE 返回、管理員、公開服事登記與恩典腳蹤、四個業務工作區、35 個管理頁版面及文字對比、裝置恢復／更新。每份結果與 log 置於被忽略的 `phase4/results/`；固定清單有一項失敗就傳回非零 exit code，保留成功與失敗輸出。

## 第四階段個別驗收

- `worker.mjs`：Node VM 合成 Worker／Cache／fetch。明確更新、離線與 HTTP 失敗、不快取敏感導航、不排隊寫入、快取失敗不阻斷正常回應、通知先導航再聚焦。
- `browser.mjs`：獨立 Chrome profile，所有 Supabase Auth／RPC／Storage／Edge Function 用合成資料攔截，其餘外部請求封鎖。只檢查已讀標記的合成呼叫，不寄送真實通知、發文或修改會友／排班。
- 六頁 390 CSS px 一般字體及 200% root font-size；正常表頭 164 px，放大後容許長高，不能整頁橫向溢出。讀取資源 decodedBodySize 預算每頁 800,000 bytes，屬於此合成內容條件，排除正式媒體／API 內容與真實網路速度；不作為完整效能成績。
- 通知焦點／背景／浮窗／減少動態效果暫停、鍵盤略過導覽、連線提示、未儲存／忙碌／輸入中更新保護、下拉與邊緣返回取消。
- 真正 Chrome Service Worker 的安裝、離線原址恢復、重試、等待更新與明確接管。CDP 同時對頁面和背景 Worker 模擬斷線，避免只有頁面斷線而 Worker 仍能連網。
- 第四階段 Chrome 真實 Worker 測試仍是桌面 Chromium；不等於 iPhone 主畫面或 Mac Safari。Safari WebDriver 未允許遠端自動化時保留待驗收，不修改使用者系統設定。

新功能必須另加自己的真實業務與角色情境。合成 viewport／API 不能宣稱全部操作、真機、真實 LINE 或 99% 已完成。
