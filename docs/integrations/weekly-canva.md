# 週報後台 Canva AI 宣傳圖整合

## 需求與範圍

2026-10-10 使用者明確要求：每週依主日日期、信息主題、經文出處與講員姓名，透過 Canva AI 創作全新不同的宣傳圖。新工作使用 AI 設計生成，不再要求建立、選擇或填入固定模板。入口仍為 `website-maintenance.html` 的「宣傳圖片」，沿用既有週報編輯權限、儲存、審核及發布。

每次按「Canva AI 生成本週全新宣傳圖」建立一筆本週工作，分別創作官網橫式圖與 IG／Reel 直式圖。這是依每週內容操作的製圖入口，沒有排定無人值守的週期任務，也不會因開啟頁面而使用 AI 額度。

前一版本採用模板填版，已於 PR #73 上線。使用者其後完成 Canva OAuth，正式資料庫可讀到 M+ 的授權連線。新版保留加密授權及歷史工作；不刪除既有週報、圖片或測試手札。

## Canva AI 開放狀況與限制

官方 REST API 已提供 `POST /v1/generations` 及 `GET /v1/generations/{jobId}`。此介面為 **Preview**：可能無預告變更，使用此介面的 public 整合目前不能通過 Canva 公開發布審核。新版明確標示試行；僅供 Canva 所允許的應用擁有者開發驗證範圍使用，不宣稱已具備對所有同工開放的正式發布資格。

AI 生成目前支援 `presentation` 與 `doc`，未直接支援任意海報尺寸。因此每種用途各請 Canva AI 創作單頁可編輯設計，確認只有一頁後，透過 Canva Resize 建立 1600×900 與 1080×1920 的副本，最後匯出 JPEG 並檢查實際像素。直式重排、中文正確性及視覺品質仍必須人工預覽；不能用檔案尺寸通過推定排版正確。

- AI 生成需要帳號具備 `design_generation` 能力；方案名稱不足以保證團隊已開放。未開放時顯示具體錯誤，不以簡易排版冒充 AI 結果。
- 尺寸調整需要 `resize` 能力，通常為 premium 方案功能。若未開放，保留已生成的設計供查看。
- 每筆全新工作會送出兩次 AI 生成要求，依 Canva 計費方式扣用已連線教會帳號的 AI 額度；不假定一次工作固定扣兩點。
- 查詢既有生成工作、重新匯出相同設計不會再次呼叫 AI 生成；在 Canva 人工使用其他 AI 功能仍依 Canva 規則計費。
- 額度用完與冷卻期分開處理；不自動重送 AI 生成。
- 本對話的 Canva 連接器與教會 OS 自有 OAuth 是不同連線。對話中的示範圖不能證明網站的 AI 生成權限或完整流程已通過。
- 目前未接入 Canva MCP；不需要為本版另開 MCP 開關。

官方依據：

- [Create design generation job](https://www.canva.dev/docs/apps/rest-apis/reference/generations/create-design-generation-job/)
- [Get design generation job](https://www.canva.dev/docs/apps/rest-apis/reference/generations/get-design-generation-job/)
- [Create design resize job](https://www.canva.dev/docs/apps/rest-apis/reference/resizes/create-design-resize-job/)
- [Get design resize job](https://www.canva.dev/docs/apps/rest-apis/reference/resizes/get-design-resize-job/)
- [Get user capabilities](https://www.canva.dev/docs/apps/rest-apis/reference/users/get-user-capabilities/)
- [OAuth authentication](https://www.canva.dev/docs/apps/rest-apis/authentication/)

## 授權與設定

沿用使用者已完成的應用及 secrets，不需重新產生密鑰。

- OAuth callback：`https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/weekly-canva/callback`
- 新授權只要求 `design:content:read`、`design:content:write`、`design:meta:read`，用於生成、尺寸調整、匯出與編輯連結。原本包含品牌模板權限的授權已含上述三項，可繼續使用；不強制重連。
- 正式 Edge secrets：`CANVA_CLIENT_ID`、`CANVA_CLIENT_SECRET`、`CANVA_TOKEN_ENCRYPTION_KEY`。加密金鑰不可任意更換。
- 本版不增加 `profile:read` 權限，因此不呼叫需要該權限的 capabilities 端點；以實際生成／尺寸調整介面的明確拒絕回應判定功能未開放。連線狀態成功不代表已取得 AI 生成能力。
- 不將 secret、OAuth tokens 或下載暫時網址放入前端、Git 或聊天。

## 每週操作

1. 在原週報工作區填寫主日日期、主題、經文與講員；副標與聚會時間依既有欄位提供。
2. 按「Canva AI 生成本週全新宣傳圖」。提示清楚說明使用 AI 額度；請求需包含此次 AI 操作標記，舊版填版請求不會意外觸發新 AI 費用。
3. Canva AI 依本週信息重新發想背景、意象、配色與布局。程式輪替創作方向並避開最近方向，方向只作提示，不是固定模板；AI 隨機結果的美感及差異度須人工確認。
4. 生成、單頁核對、尺寸調整、匯出與保存分步進行。等待超過本次查詢期限時按「繼續查詢製圖結果」，接續同一筆工作。
5. 兩圖皆完成、檢查 JPEG 尺寸並下載成功後，才一起帶入原週報預覽。
6. 核對日期、主題、經文、姓名、中文與直式排版；可開啟 Canva 微調。儲存後回後台按「帶回 Canva 最新圖片」，不重新生成。
7. 儲存週報，再依既有流程送審。圖片生成不直接發布。

新週報尚未儲存時使用前端 UUID；主動放棄並重新建立的週報 UUID 不同。建議先儲存草稿，保留穩定工作入口。

已送審的週報會鎖定移除、上傳與製圖。圖片區顯示原因；具週報核准權限的帳號可按「退回修改，再更換圖片」，填寫原因並確認，沿用原審核流程退回後再更換圖片。一般編輯同工請審核人退回，再按「確認最新狀態」。移除會先清除橫式與 IG 圖的預覽，儲存週報後生效；也可以直接生成新圖取代舊圖。已發布週報仍僅供檢視。

## 錯誤與恢復

生成只接受單頁結果。多頁結果保留 Canva 設計供查看，停止自動套用，不偷偷選一頁當成完整成品。生成未開放、額度不足、內容未接受、尺寸調整失敗與匯出失敗均顯示具體提示，原有圖片與輸入保持不變。

遠端 POST 前先保存階段。若連線中斷、伺服器錯誤或本地保存失敗，不能證明遠端未建立；封鎖自動重送，提示先查看 Canva。只有明確的未授權／限流拒絕會回復待處理階段，限流至少延後 30 秒再允許遠端操作。輪詢每筆 AI／resize 工作至少間隔 5 秒，匯出至少 3 秒；以伺服器紀錄限制重複查詢。

已生成但尺寸調整失敗時，可開啟原設計查看。只有兩個最終設計均存在才提供重新匯出；不會把重新匯出變成重新生成 AI。

## 權限、資料與共用介面

- 所有 POST 逐次驗證 JWT、目前堂會及 `get_weekly_bulletin_review_profile`；只有原週報編輯同工能製圖，只有原週報審核管理員能連結教會 Canva。
- 工作限定操作帳號、堂會與週報，已送審／發布狀態禁止更換圖片。
- 沿用原三張 service_role 專用表及租約 RPC，RLS 與 anon／authenticated 撤權不變；本版無 schema 變更。
- OAuth PKCE、一次性 state、AES-GCM tokens、刷新租約沿用。沒有擴大前端資料存取權。
- 匯出後端僅下載 Canva HTTPS 網域、拒絕重新導向、最大 12 MB，驗證 JPEG 與實際像素。永久圖片沿用網站媒體 bucket，兩圖仍走既有 pending blobs 與版本條件儲存。
- 舊填版工作的 JSON 保留相容讀取／接續；新版不提供新增模板工作入口。
- 共用管理表頭不變，Canva 區沿用系統字體、語意色、44px 操作與 Mac 雙欄／手機單欄預覽。移除已不適用的模板選擇欄位。
- HTML、模組、CSS、callback 及 App 快取同步更新至 `20261010-canva-ai2`。

## 驗收狀態

本次未新增或執行功能測試。語法解析、差異格式及正式部署資源讀回只代表提交／部署狀態，不等同於生成、權限與資料流程通過。

以下保持待驗收：正式帳號 AI 介面 eligibility、兩次生成及額度回應、單頁約束、中文校對、Canva Resize 後直式排版、兩圖保存與送審、斷線恢復、OAuth 過期、堂會與帳號隔離、Mac Safari／Chrome、iPhone 17 Safari／已安裝 App。沒有真機證據，不宣稱達到 99%。
