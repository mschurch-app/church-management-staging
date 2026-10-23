# 教會 OS 共用元件接入方式

第二階段，2026-10-09。適用後續功能開發與改版；與 `interface-framework.md`、`device-acceptance.md` 一起使用。

## 唯一功能來源

`app-function-definitions.mjs` 提供 42 個功能的名稱、說明、路由、分類、搜尋別名與 SVG symbol（2026-10-10新增M+生命樹節慶預覽）。`FUNCTION_GROUPS` 為收納分類，`SETTINGS_GROUPS` 為設定的四類。權限名稱、角色建議、可配置首頁 key 與舊導覽亦從這份來源取得。

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


## 可讀性與控制用途（2026-10-12）

- 主要資料操作沿用主要按鈕。清單選取與設定分頁明確指定 `data-app-control="surface"`，共用層提供白底深字、懸停與已選取樣式；用 `aria-pressed`／`aria-selected` 同步選取狀態。
- 已有完整場景樣式的特殊控制（例如禱告光圈、圖卡縮圖、週報步驟列）使用 `data-app-control="custom"`；共用主要按鈕規則不得覆蓋它。此標記只分配樣式，不能授予權限或取代事件處理。
- 公開頁的深色內容區明確指定 `data-app-surface="dark"`，文字與背景成對設定。不要讓全域標題色覆蓋深色區內的標題。
- 檢查實際有資料、選取後、懸停、編輯與詳情狀態；空清單通過不能代表卡片可讀。執行 `tests/readability/audit.mjs`；所有 API、LINE 身分與資料均由測試攔截，不連接正式寫入。
- 對比檢查需合成透明背景和漸層的底層顏色；圖像、影片、實際裝置顯示與完整操作仍需人工驗收。自動對比通過不等於完整產品品質達標。

## 版面試點（2026-10-22）

六個常用工作區以 `body[data-app-layout="workspace"]` 接入 `app-workspace-layout.css`，使用既有語意 tokens、系統字體、圓角與 44 px 控制。影響首頁／功能中心、排班、信息、靈修、週報審核及奉獻登錄；其他頁面不會自行套用。

- 桌面將選取清單與正文並排；審核、靈修的篩選移入選取區，保留原 ID、事件與權限處理。
- 手機使用可橫向捲動的紀錄列，保留所有項目及鍵盤操作；功能中心維持每列三項。
- 排班與奉獻的儲存操作維持表單流，避免遮住欄位；奉獻提供明細、確認、儲存區段連結。
- 選取與懸停狀態成對設定前景／背景，避免舊樣式轉場產生短暫不可讀文字。WebKit 下拉選單明確指定 appearance、padding 及最小高度。
- 前後截圖由既有 HTML／模組加合成資料產生；完整本機畫面位於忽略的測試輸出。公開報告保留摘要及對照圖；實機驗收仍另計。

## 講道社群審核工作區（2026-10-23）

`sermon-social-review.html` 以 `body[data-app-layout="social-review"]` 接入 `sermon-review-workspace.css`，沿用共用語意色、系統字體、表頭及 44 px 控制。這頁的 `.review-list` 是可編輯的講道段落，因此使用獨立工作區樣式，避免套入週報佇列的側欄樣式。

- 桌面素材與基本資料／IG 文案並排，手機依序閱讀；文案提前至基本資料後，大綱、重點與應用仍完整保留。
- 分區使用原生錨點與可聚焦目標，保留輸入；只顯示有內容的素材與 YouTube 入口。送審區提供返回分區連結。
- 圖片選取使用既有 radio；候選圖橫向排列，保留下一張露出、焦點框及鍵盤選擇。
- 儲存與核准維持單一原表單、正常文件流；所有實際結果仍由業務處理器回報。IG 核准不再停用獨立的 YouTube 作業；上傳完成後恢復對應控制。
- 貼文長度提示沿用既有 maxlength 的 UTF-16 計數方式，僅提供編輯提示，不推定外部平台已接受內容。

## 會友、小組與出席工作區（2026-10-23）

`members.html`、`groups.html`、`attendance.html` 以 `body[data-app-layout="people"]` 接入 `people-workspace.css`，沿用現有品牌、語意色、系統字體、表頭與底部導覽。頁面專屬導覽回到正常文件流，避免手機編輯標題被遮擋。

- 1100 px 以上在編輯時將表單與清單並排；較窄視窗採單欄。名冊的精簡清單也適應編輯區旁的寬度。主要表單與選取控制至少 44 px。
- 名冊進階篩選使用原生 `details`，沿用欄位 ID、查詢、選取、分頁、匯出與身分恢復邏輯。卡片選取以完整標籤包住 checkbox，擴大可點擊範圍。
- 小組名稱／負責同工／地點搜尋與出席的小組／類型篩選都在已載入資料內執行；出席明示最多最近 100 筆，統計只計入目前顯示的紀錄。
- 點名姓名搜尋只切換標籤可見性，儲存仍收集全部 checkbox；歷史紀錄中的姓名一併保留。搜尋是檢視狀態，不標記為資料修改；切換小組前確認會清除既有勾選。
- 小組與出席沿用 `editorDraft`／`lockControls`。取消、換筆、重新讀取及封存先處理未儲存變更；只有服務明確確認後才清除草稿。已存成功但重讀失敗時提供重新讀取，不要求重複新增。
- 草稿保護為目前頁面內的離開確認，不提供關閉 App 後的持久草稿恢復。既有資料服務、後端權限與通知規則未變更。

## 成員調動與關懷工作區（2026-10-23）

`group-members.html`、`newcomer-care.html`、`binding-review.html`、`member-audit.html`、`prayers.html` 以 `data-app-layout="care"` 接入 `care-workspace.css`。沿用兩堂品牌、語意 tokens、正常 164 px 表頭與 44 px 控制；手機單欄，桌面依用途並排成員／調入、案件／編輯、代禱／編輯。綁定核對與操作日誌採卡片網格。

- 篩選限於已載入資料。小組當前成員與可調入名單分開搜尋，調入必須明確選人；操作日誌以動作及完整會友編號篩選，最多最近 100 筆，不顯示變更前後私人欄位值。
- 新朋友一次只編輯一筆。換筆、取消、套用篩選、重新讀取先經 `editorDraft`；姓名查詢以按鈕或 Enter 套用，避免每輸入一字就觸發放棄確認。代禱的清單篩選保留旁邊的編輯草稿。
- LINE 綁定搜尋只切換卡片可見性，保留人工核對狀態；姓名或候選人改變時清除確認。每筆查詢帶序號，忽略早於目前姓名的回應，仍須人工選人及確認身份。
- 儲存採忙碌鎖定，失敗保留內容。已確認寫入與後續清單讀取分開回報；讀取失敗時停用舊案件寫入或清除舊操作，提供只讀重試。代禱新增沿用原有冪等請求編號與私密欄位。
- 新朋友初始化須容許共用品牌模組已移除重複導覽連結。時間欄位保留台北時間，再轉為原有 ISO payload。登出忽略尚未回來的讀取，權限拒絕清除先前載入清單。
- 沿用既有資料服務、後端權限、資料庫與通知；本批沒有正式資料寫入。草稿保護不代表關閉 App 後的持久恢復。iPhone 主畫面與 Mac Safari 實機仍另行驗收。

## 場地、設備、物品、關懷訊息與教材工作區（2026-10-23）

五頁使用 `data-app-layout="operations"` 與 `operations-workspace.css`。桌面依內容並排清單與編輯，手機單欄；以既有品牌、語意色、表頭與觸控規格統一呈現。

- 搜尋與篩選只作用於已載入清單，不修改旁邊的草稿；場地預約明示最近 100 筆、關懷訊息明示最近 200 筆。設備使用中／停用分開查看；教材呈現日期與實際公開狀態。
- `operations-workflow.mjs` 沿用 `editorDraft`／`lockControls`。確認離開、送出鎖定、讀取重試與登入失效處理共用。儲存回報由業務函式決定；已確認寫入後的重新讀取失敗，不要求重複送出。
- 物品保留原生 dialog、原有資料服務及各單位權限；增加數量與狀況篩選、浮窗取消／Escape 的草稿確認、明細回應序號與清冊刷新保護。表單儲存時不能關閉或再次提交。
- 關懷訊息進入背景時遮蔽私人工作區；返回後重新授權讀取成功才顯示，原頁草稿保留。登出或換身分清除資料。此保護不代表關閉 App 後的持久恢復。
- 教材寫入沿用原資料表與 RLS；更新／刪除附帶 M+ 與 `group_resource` 條件，必須回傳一筆 id 才確認成功。沒有新增後端函式或更動通知路由。
- 新資源與 Worker 版本同步為 `20261023-operations1`。實機鍵盤、相片上傳、列印、多人正式流程仍待驗收。

## 經文、圖卡、字幕與協會消息工作區（2026-10-23）

五頁以 `data-app-layout="content"` 接入 `content-workspace.css`：給今天的你、把愛傳出去、牧養圖卡、YouTube 字幕詞庫、協會最新消息。三個內容庫在桌面編輯時並排清單與表單；手機依序閱讀。字幕採卡片網格與原生 dialog；協會消息維持發布表單與最近清單。顏色與導覽選取沿用兩堂 tokens。

- `content-workflow.mjs` 共用草稿確認、送出鎖定、授權讀取與實際結果回報。篩選保留草稿；換筆、取消、清空或重新載入先確認。祝福情境表單與內容編輯一次開啟一個。
- 已確認寫入後先清除表單，再讀取清單；讀取失敗提供只讀重試。寫入結果不明時鎖住重送，重新載入核對。登入失效清除內容並忽略舊回應。
- 教牧內容寫入保留原來的堂會條件與 RLS；網路不確定結果及缺少回傳紀錄分開回報。協會消息新增以回傳一筆 id 確認；表單清空使用原生 prototype，避免 `reset` 按鈕名稱遮蔽方法。
- 字幕的待確認／已確認篩選限定啟用中的詞彙，並保留目前集數；dialog 支援 Escape 草稿確認、送出鎖定與視窗內重新載入。
- 最新消息搜尋限於最近 20 則已發布清單；三個內容庫搜尋限於已載入資料。沒有資料庫遷移、後端更新或通知路由變更。
- 新資源標籤 `20261023-content1`。截圖與互動預覽僅留本機；公開報告保留文字測試證據。實機相片選取、鍵盤與正式發布仍待驗收。
