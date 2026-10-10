# 週報後台 Canva 宣傳圖整合

## 範圍與狀態

此整合位於 `website-maintenance.html` 的「宣傳圖片」，取用本週信息主題、經文、講員、日期、副標與聚會時間，產生官網橫式圖及 IG／Reel 直式圖。這是現有週報工作區的延伸，沿用 `website_weekly` 權限與原有儲存、審核、發布。

目前是待啟用的實作，尚未部署、未完成 Canva OAuth，未取得實際 Canva 製圖及 Mac／iPhone 操作證據。不要宣稱正式可用或已達 99%。

## Canva 方案與整合資格

使用者確認教會使用 Pro／教育／非營利方案。Canva 官方 2026-09-23 公告及現行 Autofill guide 已開放 Pro、教育、非營利、Teams、Enterprise 使用自動填版。這不等同於所有方案都可建立私人整合。

- 教會 OS 自有 REST 整合需要另外建立 Canva 開發者應用、啟用 REST APIs，取得 OAuth 用戶端並由教會帳號授權。
- Public 整合對外提供前須通過 Canva 審核；私人整合目前要求 Enterprise。Pro 的開發驗證不能直接當作已完成正式發布資格。
- 本對話的 Canva 連接器授權不能複製成網站的存取權杖。
- 不使用 Preview API：頁面尺寸直接檢查匯出 JPEG，避開仍為 Preview 的設計頁面 API。
- 本次透過 REST API 填版、匯出；沒有呼叫 Canva AI 自由生圖 API。背景來自已設計的情境模板。任意經文全新背景創作須另確認正式可用的服務及授權。

官方參考：

- [Autofill guide](https://www.canva.dev/docs/apps/rest-apis/autofill-guide/)
- [OAuth authentication](https://www.canva.dev/docs/apps/rest-apis/authentication/)
- [App quickstart 與 public/private 條件](https://www.canva.dev/docs/apps/quickstart/)
- [Canva REST API 定義](https://www.canva.dev/sources/connect/api/latest/api.yml)

## 開發者設定

1. 由教會 Canva 帳號建立合適分發方式的應用，啟用 REST APIs，依 Canva 要求啟用 MFA。
2. 設定 OAuth callback：
   `https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/weekly-canva/callback`
3. 開啟 scopes：`design:content:read`、`design:content:write`、`design:meta:read`、`brandtemplate:meta:read`、`brandtemplate:content:read`。
4. 在正式 Supabase 專案 `aqanuwilmvdtlzuqlrau` 的 Edge Function secrets 設定：
   - `CANVA_CLIENT_ID`
   - `CANVA_CLIENT_SECRET`
   - `CANVA_TOKEN_ENCRYPTION_KEY`：至少 32 字元的獨立隨機值。不可隨意變更；變更後既有授權需重連。
5. 不將 client secret 或 OAuth tokens 放入 HTML、前端模組、Git、操作紀錄或聊天。
6. 部署前先確認 Canva 分發與審核條件。正式多人使用不能以開發模式繞過 Canva 的審核或方案規則。

## 模板契約

建立兩個獨立 Canva 品牌模板，分別為 1600×900（16:9）與 1080×1920（9:16）。每個模板以第一頁作為輸出。中文字使用 Canva 內文字圖層，預留長講題及長經文空間。

必須透過 Canva 的 Data Autofill 設定把文字圖層標記為下列資料欄位。僅寫上大括號或欄位名稱不代表已設定可填入欄位。

| 欄位 | 類型 | 來源 |
| --- | --- | --- |
| TOPIC | text，必填 | 主日信息主題 |
| SCRIPTURE | text，必填 | 經文出處 |
| SPEAKER | text，必填 | 講員 |
| SERVICE_DATE | text，必填 | YYYY-MM-DD |
| SUBTITLE | text，選填 | 副標 |
| SERVICE_TIME | text，選填 | 聚會時間 |
| CHURCH_NAME | text，選填 | 伺服器依堂會指定 |

先設定一組「通用」模板，即可啟用製圖。其他可選情境為山與守護、活水與平安、光與盼望、生命與成長、聖靈與更新、道路與信心。管理員可為每種情境另外設定一組橫／直模板。程式依講題、經文關鍵字選用已設定的情境；無符合情境時使用通用模板。

截至本次唯讀查詢，連接器可搜尋到既有 `2026 weekly(42 x 29.7 公分)`；其 dataset 為空，不能當作自動填版模板，也不會修改該週報。

## 操作流程

1. 週報審核管理員在原工作區按「連結 Canva」，在新視窗完成 OAuth。原週報輸入留在原頁。
2. 如果 Canva 返回視窗沒有自動通知原頁，按「重新確認連線」。
3. 選擇並儲存兩個通用模板；需要時設定其他情境模板。
4. 同工填寫主日資訊後按「用 Canva 產生預告圖與 IG 圖」。
5. 產圖、匯出分步查詢，逾時後按「繼續查詢」接續原工作；不自動重建設計。
6. 兩張圖片皆成功匯出、驗證尺寸、保存並下載後，才一起帶入預覽。
7. 需要微調時開啟該設計，在 Canva 儲存後回原頁按「帶回 Canva 最新圖片」。
8. 儲存週報，再依既有流程送審。產圖不會自動送審或發布。

首次尚未儲存的週報使用前端 UUID；若主動關閉並放棄未儲存週報，無法在重新建立的新 UUID 下直接接續舊工作的預覽。應先儲存週報以保留穩定工作入口。

## 權限與恢復

- 所有 POST 由後端驗證 JWT 及目前堂會 `get_weekly_bulletin_review_profile`。
- 週報編輯同工可製圖；只有既有週報審核管理員可授權 Canva 與保存模板。前端隱藏不構成授權。
- 新三張表開啟 RLS，撤銷 anon／authenticated 的直接讀寫；只有 service_role 存取。兩個租約 RPC 同樣限 service_role。
- OAuth 使用 PKCE、不可預測且有期限的一次性 state。state 僅保存雜湊；verifier、access／refresh tokens 以 AES-GCM 加密，並綁定堂會與用途。
- Refresh token 更新有租約，避免並發消耗輪替權杖。
- 圖片工作綁定實際操作帳號與堂會，每筆工作使用同一 UUID 作為重試識別。
- 遠端建立前先保存階段；建立結果不明時阻止靜默重試。若平台中斷發生在遠端建立與本地保存之間，顯示需先查看 Canva 的提示。
- 匯出網址只在後端短暫使用，不作為網站永久圖片網址。只下載 Canva HTTPS 來源、拒絕重新導向、限制 12 MB，驗證 JPEG 與像素尺寸。
- 兩張圖仍走原本 `pendingHomeBlob`／`pendingReelBlob` 與週報版本條件保存，既有圖片在新圖完成前保持不變。
- 新版 HTML、工作區模組、Canva 模組／CSS、callback 模組及 App 快取版本同步。

## 發布順序與待驗收

1. 確認 Canva 應用、審核／發布資格、憑證及兩套可填版模板。
2. 僅於正式專案套用 `20261010121000_weekly_canva.sql`。
3. 部署 `weekly-canva`，gateway `verify_jwt=false` 只為 OAuth callback；POST 仍逐次驗證使用者及權限。
4. 發布前端資源。
5. 使用者授權測試後，完成下列驗收；現階段全數待驗收：
   - Mac Safari／Chrome、iPhone 17 Safari／已安裝 App 的 OAuth、取消、彈出視窗阻擋、返回及輸入保留。
   - M+／SHiNE 權限、無權限、未登入、不同帳號工作隔離、已送審週報鎖定。
   - 兩個正確尺寸模板、缺欄位、錯尺寸、長講題、中文斷行與講員資訊。
   - 產圖、微調後重新匯出、兩圖儲存、送審及原有 Reel 流程。
   - 慢網路、斷線、重複點擊、建立回應遺失、匯出失敗、圖片下載失敗與原圖保留。
   - 權杖過期、並發刷新、重新授權、模板變更與 Canva 限流。
   - 對外官網／IG 預覽及手機實際呈現。

本次未新增或執行測試，只有語法解析及差異格式檢查。資料庫遷移及 Edge Function 尚未部署，沒有寫入舊資料庫或修改現有週報。
