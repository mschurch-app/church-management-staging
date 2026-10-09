# 教會 OS 共用元件接入方式

第二階段，2026-10-09。適用後續功能開發與改版；與 `interface-framework.md`、`device-acceptance.md` 一起使用。

## 唯一功能來源

`app-function-definitions.mjs` 提供 41 個功能的名稱、說明、路由、分類、搜尋別名與 SVG symbol。`FUNCTION_GROUPS` 為收納分類，`SETTINGS_GROUPS` 為設定的四類。權限名稱、角色建議、可配置首頁 key 與舊導覽亦從這份來源取得。

`app-function-catalog.mjs` 使用既有 `canOpen`、`canAction` 與當下的堂會、權限、啟用設定、擁有者能力和外部工具指派篩選入口。不要使用常用偏好授予權限；資料存取仍由後端檢查。

新增功能須提供唯一 key、title、description、file、group、symbol、searchTerms，依用途設定 permission、action、church、owner，以及 settingsId／settingsGroup。加入對應群組後，用固定角色情境驗證可見與不可見結果。

既有伺服器允許管理員配置的首頁項目為 31 個，definitions 的 `configurableHome` 與其相符；新 key 欲加入伺服器偏好，必須另以相容的資料庫遷移與隔離測試擴充。已有設定保留原 key，舊 `prayers`／`pastoral_inbox` 透過 canonical alias 對應。

## 建立功能入口

```js
import {createFunctionEntry,createSettingsEntry,setStatus} from './app-ui.mjs?v=20261009-stage2';

const entry=createFunctionEntry('members',{
  church:'M+',
  variant:'folder',
  control:{className:'folder-add-quick',text:'＋',label:'將會友加入常用',key:'members'}
});
container.append(entry);
```

呼叫者須先篩選權限，再掛接加入／移除事件；元件只建立 DOM，沒有資料操作權。入口內的真正連結 `.function-open` 與操作按鈕為兄弟節點；不要在 `<a>` 內放 `<button>` 或 role=button。純介面按鈕使用 type=button、actionFeedback=off，業務操作依實際結果呈現回饋。

`functionHref` 為內部路由加上目前堂會，外部工具保留原網址／query。設定入口使用 `createSettingsEntry`，保留工具的 ID 與名稱，便於搜尋、深連結及測試。

## 圖示、色彩與樣式

- SVG paths 僅置於 `app-icons.mjs`，功能對應的 symbol 僅置於 definitions。使用 `createAppIcon`／`applyAppIcon`；SVG 為裝飾且不取得焦點，操作名稱由連結或按鈕提供。
- 圖示漸層與語意變數置於 `app-design-tokens.css`。不要再用第幾張卡片決定配色，同一功能在常用、收納、設定與管理員編輯使用相同 symbol／配色。
- 主導覽圖示使用 currentColor 的單色模式，避免白色圖案在淺色導覽消失；功能圖示保留核定的彩色 App 圖案。
- 頁面沿用 `app-consistency.css`。覆蓋既有 CSS 時檢查實際 computed style，特別是舊 !important；只看來源順序不足以證明套用成功。
- 主要文字、次要文字、成功／錯誤／警示、留白、圓角與動效使用語意變數；新增色彩要驗證其背景上的對比。
- 加入／移除控制 hit area 至少 44 × 44 CSS px，視覺徽章可以較小。排列之外隱藏移除控制。

## 操作與狀態

首頁保留三欄常用，長按進入排列，正常滑動取消長按；touchcancel 清除拖曳狀態。桌面提供編輯按鈕、Alt＋方向鍵排序、Delete 移除、Escape 完成及焦點恢復；位置變更透過 live region 提示。

`setStatus(node,message,{tone,busy})` 更新語意狀態與 aria-busy。設定區區分初始化狀態與表單狀態；權限或資料載入失敗提供重新載入。儲存失敗保留欄位與可重試操作；成功只在實際資料請求完成後呈現。

本機個人常用目前依登入 Auth ID 與堂會儲存；不同瀏覽器／Email 與 LINE 的兩種 Auth ID 未自動同步個人排列。管理員配置的預設常用仍由伺服器提供。跨裝置個人排列同步須另設計資料與合併規則。

## 交付檢查

執行 `tests/phase2/` 的功能定義、介面與對比測試，以及第一階段核心回歸；新功能另外列出其資料操作和恢復情境。更新依賴版本與 Service Worker，不清除使用者登入。

Chrome 模擬資料與 viewport 檢查用於回歸；iPhone 17、LINE 內開啟、已安裝 App 返回、Mac Safari、文字放大與安全區域需另附實機證據。此框架不代表原生 iOS App，也不代表整個產品已達 99%。

## 業務工作區（第三階段）

`app-workflow.mjs`／`app-workflow.css` 提供目前步驟、下一步、未儲存保護、控制鎖定及審核浮窗。適用後台工作流程；公開會友服務依其既有版型接入必要能力。

- `workflowSummary` 只呈現業務處理器提供的狀態，不以網路結束推測成功。
- `lockControls` 保留原本 disabled 狀態，完成後還原；重新建立的控制須由業務狀態同步，不可將唯讀控制一律啟用。
- `draftGuard` 追蹤表單，切換前確認；已實際儲存、確定放棄或替換內容時才清除。每個工作區共用一個 guard，避免舊表單仍觸發離頁提示。
- `reviewDialog` 使用原生 dialog，具明確影響說明、選填／必填原因、Escape 取消、焦點還原與背景捲動鎖定。
- 清單選取按鈕使用 secondary 語意，與儲存／發布等主要操作區分，並核對實際 computed style，避免既有高 specificity 樣式覆蓋。
- 寫入與隨後讀取分別記錄結果。已收到寫入成功卻讀取失敗，或連線中斷結果不明，鎖住再次寫入，提供只讀的重新載入動線。
- 工作區使用 `data-action-feedback="off"`，由自身 status 顯示實際結果，避免通用網路推測回饋覆蓋審核或儲存結果。

第三階段接入四頁：`website-maintenance.html`、`weekly-bulletin-review.html`、`daily-devotional-admin.html`、`service-signup-admin.html`。新業務頁須另外驗收自己的 API、角色、上傳／發布與失敗情境。

共用樣式載入：iOS 補充樣式插入既有 `data-app-consistency` link 前面；不可移動或移除已載入的共用 stylesheet，以免重新載入期間短暫失去 token／表頭規則。
`apiResult` 驗證業務 API 的明確 `ok: true` 回應；僅 HTTP 2xx 不視為完成。缺少確認結果時先重新讀取，不自動重送。

## 裝置恢復與版本更新（第四階段）

`ios-experience.mjs` 接入 `app-runtime.mjs`，共用鍵盤略過導覽、放大文字偵測、底部導覽留白、連線提示及手勢保護。不要另建會自動清除登入或重送資料的恢復處理器。

- 表單 input／change 設定 `data-unsaved-changes="true"`；reset 或業務明確確認儲存後才清除。第三階段工作區由 `draftGuard.clear()` 清除；不得以 submit 或任何 HTTP 結束推定已儲存。
- 非同步操作期間在穩定容器設 `aria-busy="true"`，完成後還原。更新、下拉與返回手勢據此保護進行中的操作；其他頁面接入時須核對自己的忙碌狀態。
- `refreshApp()` 先檢查連線、忙碌與未儲存資料；使用者確認後發送 `church:discard-drafts`，由 guard 同步清除，避免同一次重新載入問兩次。
- `watchAppRegistration()` 只提供明確更新按鈕。Worker 安裝後等待，收到 `CHURCH_ACTIVATE_UPDATE` 才接管。更新期間若又輸入、開始操作或切到背景，完成後仍等使用者再按更新。
- HTML 導航、OAuth callback 與一次性登入返回網址不寫入 App 快取；業務 API 與 POST 不離線排隊。離線恢復頁於原網址顯示，再次開啟仍回原頁，保留連線與登入的分別。
- 文字放大時表頭可長高；正常字體維持 164 CSS px。底部留白依實際 dock 高度計算。新增固定底列須納入同一個量測契約。
- 通知僅當前項目可聚焦；聚焦、懸停、浮窗、背景與減少動態效果均暫停輪播。不要讓輪播用 live region 每三秒打斷閱讀。
- 網站預覽在 disclosure 打開後才設定 iframe src；審核圖片使用 lazy／async，效能改善仍以實測記錄為準。

發布前執行 `tests/quality-gate.mjs`，保留失敗與修正紀錄。版本變更需同步直接及間接引用，避免同一模組以多個舊 query 載入。詳細操作見 `tests/phase4/README.md`。模擬測試與實機驗收分開記錄。
