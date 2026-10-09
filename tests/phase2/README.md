# 第二階段隔離測試

使用合成帳號、API 回應與獨立 Chrome 設定檔，不寄送真實邀請、LINE 訊息或發布內容。

```sh
cd tests
npm ci --ignore-scripts
npm run phase2:definitions
npm run catalog
```

在 repository 根目錄啟動靜態伺服器於 `127.0.0.1:8769` 後：

```sh
npm run phase2:browser
npm run phase2:contrast
npm run phase1:db
npm run phase1:browser
npm run phase1:email
npm run phase1:line
npm run phase1:regression
```

可用 CHURCH_TEST_ORIGIN 與 CHROME_EXECUTABLE 指定測試來源與瀏覽器。結果寫入 `phase2/results/`，不提交 Chrome profile。

- definitions：功能 metadata、同一份角色建議、31 個既有伺服器首頁 key、分類／SVG／路由、權限與堂會。
- browser：四類設定、搜尋、唯讀／錯誤／儲存重試、常用移除／加回、長按滑動取消、實際 CDP touchcancel、鍵盤排序、空偏好、全部入口完整性、圖示配色、375／390／430／1280／1440／1920 CSS px。
- contrast：35 個管理頁可見文字，採 computed color 與背景／漸層端點計算；一般文字 4.5:1、大字 3:1，檢查表頭裁切。

對比計算是靜態近似，不能涵蓋所有照片背景、透明堆疊、焦點狀態、動態資料或真機文字放大。Viewport 模擬與合成 OAuth 不能替代 iPhone 17／Mac Safari 的實機驗收。
