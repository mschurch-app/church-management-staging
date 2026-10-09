# 第四階段優化與驗收

日期：2026-10-09。教會 OS 正式環境；延續第三階段已發布的 72f430a。此階段處理裝置恢復、更新時機、文字放大、鍵盤及發布回歸。

發布狀態：本機驗收完成，正式站發布與檔案比對待記錄。

## 已實作

1. **更新時保護內容**：新版本提供明確的「更新」按鈕。未儲存需確認；操作中不重載。確認更新後又輸入、開始操作或切到背景，仍等待使用者再按更新。
2. **離線恢復**：保留原網址顯示恢復頁，連線後重試原頁。連線失敗與登入失敗分開；OAuth callback／一次性返回網址不作為導航快取。沒有離線自動重送資料。
3. **手勢與導覽**：下拉避開表單、浮窗、內部捲動、橫向及取消手勢。返回手勢保護未儲存與忙碌狀態。鍵盤第一個 Tab 可跳到主要內容；底部導覽留白依實際高度計算。
4. **文字與通知**：六個主要工作區以 200% root font-size 驗收，表頭依內容長高，正常字體仍為 164 px。常用標籤與通知內容隨文字放大。通知每三秒輪換；聚焦、懸停、浮窗、背景或減少動態效果時暫停，只有目前項目可取得焦點。
5. **載入與固定驗收**：週報網站預覽展開後才載入，審核圖片延後載入及解碼。新增可重跑的固定發布檢查、逐組 log、非零失敗退出及正式資源 SHA-256 比對工具。

共用裝置行為放在 `app-runtime.mjs`，接入既有 iOS 模組；未修改業務 API、資料庫、Auth storage key 或既有帳號對應。版本引用已沿依賴同步，避免同一模組以不同舊 query 載入。

## 本機驗收

使用 Node 22.23.3、Chrome 150、puppeteer-core 25.12.0、PGlite 0.3.14；靜態來源 127.0.0.1:8769。固定清單分批執行；所有 Supabase／LINE 回應均為合成資料。沒有真實寄信、LINE 通知、發文或會友／排班寫入。

| 檢查 | 結果 |
| --- | --- |
| 第四階段 Worker 隔離檢查 | 21 項通過 |
| 第四階段瀏覽器、真正 Chrome Worker 離線／更新 | 73 項通過 |
| 四個工作區正常、失敗、取消、慢回應、重複及結果不明 | 80 項通過 |
| 功能目錄／定義與首頁權限 | 18＋20 項通過 |
| 第二階段介面／常用／分類回歸 | 49 項通過 |
| 登入、App 返回、Email 綁定、LINE provider | 11＋11＋12＋12 項通過 |
| 帳號與權限資料庫 | 43 項通過 |
| 公開服事登記與恩典腳蹤資料庫 | 48＋19 項通過 |
| 35 個管理頁 | 手機／桌面表頭 164 px、無整頁橫向溢出、無未捕捉 JS 錯誤 |
| 35 頁可見文字對比 | 手機合成內容 1,291 個文字節點，無不合格；四個工作區另有手機／桌面對比回歸 |
| 前端語法 | 114 個模組／腳本通過 |

對比採 computed style、透明度與漸層端點近似；未涵蓋所有照片、placeholder、焦點及正式動態資料。200% 是 root font-size 的合成驗收，不能推定所有頁面或 iPhone 系統文字設定均已通過。

### 驗收發現及修正

- 通知焦點原先透過不可靠的 onfocusin／onfocusout 屬性處理；改為實際事件監聽，輪播每次切換前也檢查閱讀與背景狀態。
- 原先返回手勢在 submit 當下就清掉未儲存標記；改為依明確儲存／重設狀態判定。
- 新增的空白預覽 iframe 會執行隔離測試初始化；測試的 Worker 清理需處理不具有效來源的空白 frame。僅修正測試清理，不忽略產品 JS 錯誤。
- Chrome 頁面斷線模擬不一定涵蓋背景 Worker；測試同時對兩者設定 CDP 網路條件，確實走到離線 fallback。
- 完成所有斷言及關閉瀏覽器後，部分測試命令仍因測試工具的剩餘 handle 不退出；CLI 現在於完成證據寫入、斷言與關閉後明確結束。失敗仍傳回非零結果。

## 效能紀錄

本次六頁在合成資料下的資源 decodedBodySize 均小於預先設定的 800,000 bytes；新增恢復能力使靜態資源略增。未據此宣稱真實網路載入更快。

| 頁面 | 資源解碼大小 | 200% 表頭高度 |
| --- | --- | --- |
| admin-dashboard.html | 631.3 kB | 312.1 px |
| church-settings.html | 504.7 kB | 312.1 px |
| daily-devotional-admin.html | 519.9 kB | 285.2 px |
| weekly-bulletin-review.html | 512.5 kB | 322.3 px |
| website-maintenance.html | 549.1 kB | 453.1 px |
| service-signup-admin.html | 536.8 kB | 349.2 px |

此大小不是 gzip 傳輸量，不含真實 API／媒體內容或初次安裝 Worker 的預快取。網站預覽確認在未展開時不發送 iframe 導航；實際使用者速度仍需固定網路與實機記錄。基準值及本次值分別保留於 baseline.json、browser-local.json。

## 實機與後續驗收

- **iPhone 17：待驗收**。主畫面、Safari、LINE 返回、鍵盤、安全區域、系統文字大小與背景恢復仍需真機證據。
- **Mac Safari：待驗收**。本機 Safari 17.6 WebDriver 回應未允許遠端自動化；未更改系統設定。Chrome 不代替 Safari。
- **整體 99%：未宣稱達成**。依 device-acceptance.md，未執行項目不能算通過。
- 正式動態內容、媒體上傳／下載／發布串接及實際體感效能保留實機驗收；現有隔離測試不作為這些結果的替代。

## 維護與恢復

依 `tests/phase4/README.md` 啟動本機伺服器與 `npm run quality:gate`，固定檢查共 15 組加前端語法。單獨重跑一組不等於完整產品驗收。新功能依共用元件契約加入自己的資料、角色及失敗情境。

需要回復時，以第三階段 72f430a 為參考，使用新的修正／還原提交及新的 Worker／資源版本；不要改寫主分支歷史。此次沒有資料庫遷移，無資料回復步驟。

版本等待及明確接管依 [Service Worker lifecycle](https://web.dev/articles/service-worker-lifecycle) 與 [W3C Worker 規格](https://www.w3.org/TR/service-workers/)；減少動態效果參考 [WebKit 文件](https://webkit.org/blog/7551/responsive-design-for-motion/)。Safari 自動化條件參考 [Apple WebDriver 文件](https://developer.apple.com/documentation/webkit/testing-with-webdriver-in-safari)。
