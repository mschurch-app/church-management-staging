# 服事預排：姓名搜尋與手動安排

日期：2026-10-11

## 需求及變更

- 點「安排人選」或「換人」後顯示姓名輸入欄；保留已登記本日服事候選人。
- 以姓名包含文字搜尋同教會、未封存會友，輸入一字即可開始；增加字數可縮小範圍。
- 每次最多顯示 30 位名冊候選人，超過時提示繼續輸入；顯示小組、本季主日服事量及安排限制。
- 完整姓名不在名冊時，可選「安排名冊外同工」。資料儲存在既有正式班表姓名欄位，不新增會友或偽造登記意願。
- 選擇人選先修改記憶體預排，確認套用才寫入；一般失敗保留預排，連線結果不明時要求重新載入確認。
- 使用 native dialog、系統字體、16px 輸入欄及既有暖紅按鈕；處理中文組字、180ms 搜尋延遲、舊回應失效、關閉時恢復焦點、搜尋失敗重試及手機安全區域。

## 資料及權限

新增 migration：`supabase/migrations/20261010235451_service_matching_name_picker.sql`。

新增 RPC：

- `get_service_signup_member_candidates(text,bigint,text)`：檢查有效帳號、教會、管理權或服事類別範圍；僅傳回候選姓名、小組、服事日期數計算所需日期與同日衝突布林值。
- `service_signup_apply_match_draft(text,bigint,bigint[],jsonb)`：同一交易套用登記候選與手動安排。重新驗證成員、名額、類別權限、候補待回覆及同日衝突，鎖定名額與班表，保留既有正式安排。

兩支函式使用空 `search_path`、拒絕匿名呼叫，函式內再驗證帳號和業務權限。已於正式 Supabase `aqanuwilmvdtlzuqlrau` 套用 migration；回讀 pg_proc 確認上述設定及 authenticated 執行權限。

Security advisors 列出這兩支 authenticated 可執行的 SECURITY DEFINER RPC；此為有意設計，需透過內部權限檢查執行管理作業。未變更其他既有 advisories 涉及的功能。

## 版本與影響範圍

`20261011-match-names1`：服事管理 HTML、管理模組、配對工作台 JS/CSS，以及 PWA / Service Worker 快取版本。其他頁面布局不變；更新全域資源版本以避免手機沿用舊的工作台資源。

## 已執行與待驗收

已完成：

- 四支修改的 JS 模組 `node --check`。
- `git diff --check`。
- migration 套用、函式權限與搜尋路徑回讀、security advisors 檢視。

本次未執行功能測試或使用真實會友寫入排班。Mac Safari、Chrome 相容性及 iPhone 17 實機仍待驗收；未宣稱整體 99% 或核心流程全部通過。

待驗收：一字／多字／中文組字搜尋、同名人選、名冊外完整姓名、關閉及重試、換人、取消預排、確認套用、無權／跨堂會存取、同日衝突、候補待回覆、多人同時安排與手機鍵盤遮擋。
