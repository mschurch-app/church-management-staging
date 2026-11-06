# 智慧郵件助理 1.0 — 第一階段開發紀錄

日期：2026-11-06。分支：`feature/personal-mail-assistant-v1`。
基準：`e2a68e071801540adef4f21cefac72a850970c02`。

## 本次交付與界線

本次是**可操作的設定精靈原型與純函式規則基礎**，不是已可收信的正式服務。
僅新增檔案；沒有修改 main、部署 Edge Functions、執行資料庫遷移、設定 Cron、讀取真實信件或推播 LINE。
預覽標示清楚，全部帳號使用 `example.invalid`，內容不保存於瀏覽器；CSP 禁止資料連線與表單提交。
沒有密碼欄位、OAuth redirect 或網路讀信程式。

檔案：
- `personal-mail-assistant.html`：獨立開發預覽入口。
- `personal-mail-assistant.css`：頁面專用樣式，沿用既有設計語意變數。
- `personal-mail-assistant.mjs`：三步驟介面、多帳號示範、返回與稍後設定。
- `personal-mail-assistant-core.mjs`：資料最小化、帳號去重、涵蓋狀態、個人接收者與啟用條件的純函式。
- `tests/personal-mail-assistant/core.test.mjs`：50 項本機單元測試。

純函式測試不等於後端驗證完成。瀏覽器傳入的 principal、providerIdentity、LINE binding 均不能當作可信身分。

## 已確認的產品方向

每位同工自行、自願連接自己的多個 Gmail／iCloud Mail；不是共用牧師信箱。
Outlook 不在第一版範圍。排除一般廣告，保留重要待辦、教會、協會、個人及系統警示。
一位同工、多個信箱、一份個人摘要；每件事項註明來源信箱。
預設時間 07:00、Asia/Taipei；**通知預設未啟用**，需本人確認及後端查核通過才啟用。
不使用 Google Apps Script，不另造 LINE 官方帳號，不改動其他事工的推播。

引導：
1. 先連一個信箱；成功後可「再加入一個」或繼續。不強迫一次完成，也不把信箱數寫死為一個或五個。
2. 確認本人 LINE 與通知時間。已綁定者不必再次輸入 ID；未綁定者回既有綁定流程。
3. 顯示第一份真實預覽，明確確認後才啟用。可稍後完成、暫停或移除個別信箱。

## 與現有教會 OS 的接入契約（尚待實作）

依 `AGENTS.md`、`docs/design/interface-framework.md`、`device-acceptance.md` 與 `component-contract.md`。
目前 `FEATURE` 只提供候選 metadata，`enabled:false`；**尚未加入正式功能目錄**，避免沒有後端的入口提前出現。
正式接入時將定義放入 `app-function-definitions.mjs`，透過 `app-function-catalog.mjs` 篩選已啟用且在試用名單的同工。
沿用 `app-ui.mjs`、`app-icons.mjs`、共用表頭與登入，再同步版本與 Service Worker。不要靠常用捷徑授予權限。
本次預覽故意不載入登入及 PWA 模組；它不使用實際資料，不代表正式登入整合已完成。

既有部署盤點線索：
- `pastoral_staff` 的同工／App 使用者／LINE 身分關係及 `pastoral_staff_access`，需解析為唯一、穩定的同工 owner。
- `app-push` 主要處理 App 通知，也有個人 LINE 發送程式；不是所有通知都會送 LINE。
- 先前讀到 `app-push` 的一般待送流程於台灣時間 08:00 前延後處理。**不能直接把郵件摘要丟進該佇列，就宣稱 07:00 已完成。**
- `line-group-daily-summary` 是群組流程；不得將私人摘要寫入其群組資料表或沿用群組收件者。
- 只共用已驗證的個人 LINE 身分解析與傳送能力；新增個人摘要類型及排程特例，不全面取消原有夜間安靜政策。

下一階段須重新讀取對應原始碼與實際排程，確認 GitHub 與部署版本差異，再接入。

## 必須完成的後端安全規則

1. 每個 API 從已驗證工作階段解析 canonical staff owner，重新確認啟用狀態；不可接受前端自稱 owner／admin。
2. 每張信箱、摘要及工作表有 owner 外鍵；伺服器 SQL 同時限制 owner 與 account。RLS、GRANT、RPC 及 service-role 路徑都需隔離驗收。
3. 教會 OS 的管理員角色不提供他人郵件讀取權。維運資料只回傳狀態與錯誤碼。這不是對持有資料庫或解密金鑰者作「絕對無法存取」的承諾。
4. 帳號唯一性以 owner＋provider＋經服務商驗證的身分判定；別名 email 不可作身分證明。重新授權更新原紀錄，不重複新增。
5. Token、App 專用密碼與加密金鑰僅在受保護的後端；不進 public DTO、前端、Git、日誌、通知、AI prompt 或 URL。
6. 取消授權、停權或離職，停止同步、取消待送工作；發送前再次查核本人狀態。移除後依保留政策清除副本與憑證。
7. LINE 接收者從可信、有效且已驗證的本人綁定取得；須驗證 LINE Login 與 Messaging API 身分屬於相同 Provider。拒絕群組／聊天室 ID，不提供任意收件者欄位。
8. 摘要唯一鍵按 owner、日期、管道與版本；資料庫鎖定工作，持久化 UUID retry key，重試不改內容／收件者。LINE 接受請求不等於使用者已讀或一定收到。
9. 每個信箱獨立同步與分頁；一個失敗不阻擋其他信箱。未讀完／斷線要標示涵蓋範圍，不能冒稱「全部查完／無重要信件」。
10. 信件與附件視為不可信資料，不執行其中指示，不讓摘要模型呼叫發信、轉寄或系統修改工具。AI 服務、保留政策與資料用途須在連接前說明並取得同意。

## 服務商授權：管理端一次設定，同工循序引導

Gmail 申請最小必要 `gmail.readonly`；不用 `gmail.modify` 或完整信箱權限。
這是 restricted scope，管理端必須核對正式 OAuth 驗證與安全評估適用要求；不能讓同工自行建立 Cloud project 或要求略過未驗證警告。
OAuth state／nonce／PKCE／callback owner binding、重放防護與 token refresh 尚未實作及測試。

iCloud 先核對本應用是否能使用 Apple 支援的直接授權；不能把一般 Sign in with Apple 誤當郵件讀取授權。
採 App 專用密碼時，分步引導 Apple 帳號設定，絕不收主要密碼。IMAP 讀取以 TLS、EXAMINE、BODY.PEEK 等唯讀操作實作，不開 SMTP、不修改旗標。
App 專用密碼本身不是嚴格的「僅讀郵件 scope」；產品唯讀限制需由服務端實作與測試，不可誤導。
IMAP 執行環境連線能力尚待測試，未定案前不宣稱 Edge Function 已能讀 iCloud。

ChatGPT 的既有信箱授權不能移植給教會 OS；現有 ChatGPT 每日摘要任務保持不變。本次不聲稱已接通 LINE 摘要。

官方參考（2026-11-06 查閱）：
- Gmail scopes：https://developers.google.com/workspace/gmail/api/auth/scopes
- Apple App 專用密碼：https://support.apple.com/en-us/102654
- LINE retry：https://developers.line.biz/en/docs/messaging-api/retrying-api-request/
- Supabase security：https://supabase.com/docs/guides/database/postgres/row-level-security

## 測試證據與發布門檻

已執行：`node --test tests/personal-mail-assistant/core.test.mjs`，50 passed／0 failed。
已執行：`node --check personal-mail-assistant.mjs`。
已執行：Chromium 記憶體內 DOM 模擬，390×844 與 1440×1000，各 11 項：七信箱、三步驟、返回保留、確認門檻、時間設定、稍後設定、無水平溢出、無密碼欄位、不寫 local/session storage、無外部請求、無 JS 錯誤。
首次 Playwright 預設瀏覽器執行檔缺失；改用環境既有 Chromium。因測試環境禁止 localhost 導航，改為載入記憶體內 HTML／CSS／JS，不解除瀏覽器政策。
因此**沒有驗證真實 URL、CSP／module loader、共用 App 樣式整合、登入返回、OAuth、真實資料庫隔離、排程、LINE 傳送**。
未執行：真實 iPhone／Mac Safari／LINE 內開啟。不能以模擬測試宣稱實機或整體 99% 達標。

發布前必須完成：後端身分／資料隔離、Gmail 多帳號真實授權、iCloud 連線、本人 LINE 端對端測試、07:00 排程及去重、權限撤銷與刪除、隱私告知、正式功能目錄與共用介面接入、回歸與實機驗收。
本分支不得在這些門檻通過前合併發布。
