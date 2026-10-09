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
