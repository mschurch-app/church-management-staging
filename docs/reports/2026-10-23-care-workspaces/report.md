# 成員調動與關懷：五階段工作區優化

2026-10-23。本機完成，尚未發布。基準為已發布 PR #253：`8bf879970eae6ce9b03d184d6b4e617325770618`。

## 五個階段

| 階段 | 介面與操作改善 |
| --- | --- |
| 1. 小組／小家成員 | 目前成員與調入區分開，桌面並排、手機單欄；兩邊各有姓名／電話搜尋，可調入者也可搜尋原小組。明確選人後才能調入，移出及組長調整保留確認。 |
| 2. 新朋友關懷 | 精簡案件清單與單筆編輯區並排；新增姓名／負責同工查詢、顯示筆數、台北時間欄位及可展開歷程。換筆、篩選、取消、重新讀取時保護未儲存內容。 |
| 3. LINE 綁定核對 | 新增申請姓名／電話及狀態篩選；卡片與人工確認區更易閱讀、觸控。查詢姓名改變時清除候選與勾選，忽略較早查詢回應；候選人改變也須重新核對。 |
| 4. 會友操作日誌 | 新增動作及完整會友編號篩選；桌面雙欄、手機單欄。標示已載入及顯示數量，到最近 100 筆就停止「更多」，維持只顯示變更欄位名稱。 |
| 5. 代禱管理 | 統計、篩選、編輯與清單分區，桌面編輯與清單並排。新增、取消及重新讀取保護草稿；清單搜尋保留編輯內容。儲存失敗在表單內提示，保留原有新增冪等編號及公開／私密選擇。 |

共用改進：使用既有系統字體與品牌色、44 px 控制、正常 164 px 表頭、手機正常文件流導覽。資料操作期間標示忙碌，重複點擊不多送一次；寫入成功但清單重讀失敗時分開顯示結果，提供只讀重試。登出忽略未完成的讀取，服務回報權限拒絕時清除先前載入清單。

## 實際發現與修正

- **新朋友清單初始化中斷**：隔離基準重現 `church-brand.mjs` 先移除重複導覽連結，舊頁面在等待權限讀取後仍設定已不存在連結的 `href`，因而停止載入。改版容許連結已由共用導覽處理。前版圖片保留實際錯誤，沒有替換成假成功畫面。
- **新朋友時間空白**：台北時間字串改為 `datetime-local` 接受的格式，儲存仍傳既有 ISO 時間；測試確認台北 18:00 對應 10:00Z。
- **未儲存資料被切換清除**：新朋友與代禱接入既有 `editorDraft`，新朋友查詢透過按鈕或 Enter 套用，避免每輸入一字就跳出放棄確認。
- **成功與讀取失敗混淆**：收到實際寫入確認後清除已提交草稿；清單重讀失敗不再顯示成未儲存，也不提供舊案件的重複新增動作。
- **綁定候選回應過期**：查詢序號防止較早姓名的結果填入目前選單，仍保留人工選人及身份確認。
- **日誌更多按鈕無限停在 100 筆**：達服務上限後隱藏；讀取失敗保留最後成功筆數，不誤推進分頁。

## 畫面對照

以下使用相同合成資料與 Chrome，工作區圖片對齊資料或編輯區。

| 頁面 | 桌面 | 手機 |
| --- | --- | --- |
| 小組成員 | [前](before-group-members-desktop.png)／[後](after-group-members-desktop.png) | [前](before-group-members-mobile.png)／[後](after-group-members-mobile.png) |
| 新朋友關懷 | [前：初始化錯誤](before-newcomer-care-desktop.png)／[後](after-newcomer-care-desktop.png) | [前：初始化錯誤](before-newcomer-care-mobile.png)／[後](after-newcomer-care-mobile.png) |
| LINE 綁定 | [前](before-binding-review-desktop.png)／[後](after-binding-review-desktop.png) | [前](before-binding-review-mobile.png)／[後](after-binding-review-mobile.png) |
| 操作日誌 | [前](before-member-audit-desktop.png)／[後](after-member-audit-desktop.png) | [前](before-member-audit-mobile.png)／[後](after-member-audit-mobile.png) |
| 代禱管理 | [前](before-prayers-desktop.png)／[後](after-prayers-desktop.png) | [前](before-prayers-mobile.png)／[後](after-prayers-mobile.png) |

完整本機對照頁：`tests/phase4/results/care-workspaces/index.html`，可切換五頁、390／1440 px、兩堂品牌、Chrome／WebKit 及首屏／工作區／完整頁。完整圖與失敗紀錄位於 Git 忽略的測試輸出，公開報告只含合成資料截圖與摘要。

## 驗證

- **1,000 項專項檢查通過，0 項失敗**。`tests/care-workspaces-browser.mjs` 與 `tests/care-workspaces-scenarios.mjs`：40 個情境（5 頁 × 2 引擎 × 2 寬度 × 2 堂會），80 個有資料的清單／編輯畫面。
- 檢查一般寬度、164 px 表頭、文字對比、44 × 44 px 主要控制、200% root font-size、桌面另切至 1280／1920 px。沒有把這些模擬結果當成實機驗收。
- 操作檢查包括局部搜尋、確認取消、候選身份核對與重置、過期查詢丟棄、草稿保留、儲存失敗、重複送出、已成功但重讀失敗、只讀重試、關懷結案、最近 100 筆限制、私密代禱新增重試、權限拒絕及登出後忽略延遲讀取。
- **15 組固定品質清單全部通過，207 檔語法通過**，見 `quality-gate.json`。最後忙碌標記與權限清除調整另由最終專項及 8 個本批腳本的語法檢查確認。
- 最終專項見 `after.json`，含程式、HTML、CSS、Worker 及兩個測試檔的 SHA-256；交付整理時全部比對一致。`before.json` 保留基準量測及上述初始化錯誤狀態。
- 使用 Node 24.21.0、本機 Google Chrome 與 Playwright WebKit。資料服務全為合成替身，封鎖外部請求；正式寫入、LINE 通知均為 0。
- 首輪互動測試中，代禱新增表單的 select 標籤含選項文字，測試使用完全相等的標籤比對而找不到控制。已修正測試定位，最後全部通過；初輪失敗摘要保留在本機輸出。

## 版本、範圍與待驗收

五頁 HTML、五個 UI 模組、新 CSS 與 Worker 使用 `20261023-care1`。Worker 為 `church-os-shell-20261023-care1`，保留既有資源並加入六個本批資源，共 **101 個唯一預快取項目**，本機路徑全部存在。

資料服務、Supabase SDK、後端權限、資料庫與通知規則沒有更動，沒有資料庫遷移或後端部署。已依 Supabase 技能核對官方 [Auth 事件文件](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)、[getUser 文件](https://supabase.com/docs/reference/javascript/auth-getuser)及 [更新紀錄](https://supabase.com/changelog)；Auth 事件回呼維持同步處理，服務授權沿用原設計。

搜尋限於已載入資料；日誌不是完整歷史搜尋。草稿保護限於頁面內離開確認，不提供關閉 App 後的持久恢復。本批著重版面與操作可靠性，未將合成資料載入時間當作正式效能成果。

**尚未上傳、合併或部署本批。** 發布後須比對正式資源與新版 App 快取。iPhone 主畫面 App 的觸控、鍵盤及背景恢復，Mac Safari 的實際操作，正式角色與多人資料流程仍待驗收；未宣稱整體 99% 達標。
