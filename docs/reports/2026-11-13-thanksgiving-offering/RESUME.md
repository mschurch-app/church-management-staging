# 接續點：重開 App 後從這裡繼續

使用者已要求完成 Issue #315 / 草稿 PR #316，先隔離測試與驗收，再上線。最後寄一封方便轉寄給朋友的代禱信到 james@tcsc.org.tw，並在對話提供正式網址。不要把未接好後端的頁面當正式收件入口。

程式已在隔離工作目錄完成主要部分，草稿分支會保存本次接手內容。原有正式系統、Auth 邀請信與未提交專案工作未修改。新增 migration/正式 Edge/公開收件/cron **均未部署或啟用**。

預定頁面：https://mscos.mchurch.online/thanksgiving-2026.html

已完成：末五碼前導零、前後端驗證、同筆冪等重試、私有待核對入庫及兩個 outbox、私人 LINE 與 SMTP 獨立投遞追蹤、未知結果不盲重寄、登入後財務核對、權限隔離及回退 runbook。

測試：15 組隔離 service_role SQL、9 組 HTTP/投遞、3 組真實 TS entry 依賴注入、公開頁與後台各 4 個 Chromium/WebKit×手機/桌面設定、20 組既有 catalog 回歸，新增入口的 owner/finance/stranger/church gate 通過。Deno 2.9.6 對真實 index.ts 與 nodemailer 10.5.0 型別檢查通過，deno.lock 已生成。實機、正式主機與實際雙通道投遞尚未驗收。

重要更正：使用者記得先前已配置寄邀請信的 Email，明確要求沿用。先前只查 Edge env 的 SMTP 變數，不能據此說既有 SMTP 未配置。應讀取 Supabase Auth 的既有 SMTP 設定，沿用服務與寄件資料，不要求重新設定或變更登入邀請信。

已知目的地：正式資料確認吳俊璋牧師私人 LINE 已匹配 custom:line-web 身分，收件 Email james@tcsc.org.tw 已驗證。Gmail 連線有教會對外帳號 church@tcsc.org.tw，link_id=link_6aed17c101788191bd758aed4243914f，可供最後寄出轉寄信；這個 connector 不能直接當作正式 Edge 背景寄信憑證。

瀏覽器阻礙：使用者已在一般瀏覽器開啟頁面並回覆已開啟本機瀏覽器存取，但 CUA getBrowser/getState 仍回報 `Local browser use is disabled in Work settings`。reset 後仍相同，已完成 CUA completion_summary。CLI projects list 回報沒有管理 access token。MCP 未提供 Auth config 讀取，因此目前還沒讀到 SMTP host/user/pass，不能宣稱 SMTP 不存在或沿用已完成。使用者表示這種權限未刷新問題以前常發生，可能需關閉 App 重開。

最新接續（2026-11-13）：
- 已分支到接手對話 01a1d392-1404-7522-8778-8614c6eecd26，不要再建立其他對話。本對話的 Chrome 連線成功，已唯讀查看正式專案 Auth SMTP。
- 自訂 SMTP 開關為 true；host=smtp.gmail.com，port=465。寄件者名稱 M+大雅教會／火樂教會。未修改任何 Auth 設定。
- 密碼欄位明示 Stored password is hidden. Enter a new password to replace it. 不可假定可由 UI 讀回或已沿用成功，也不可用隱藏頁面狀態、瀏覽器登入資料或 session 取得憑證。
- 已詢問使用者是否仍保留原有 Google 應用程式密碼，僅需回答是否，不在對話提供密碼。可由使用者在 Supabase Edge Secrets 直接輸入 OFFERING_SMTP_USER 及 OFFERING_SMTP_PASSWORD，讓既有 Auth 邀請設定保持原狀；新增奉獻密碼 Secret 不代表需要重設教會信箱或 Auth。
- PR #316 仍為 draft，head 1a5008113afb15d872b9a50a13ca5c2ffe0d0391，base bf71a905613d46e3b366194d5039425a0b518e88。尚未新增正式 migration/Edge/cron，也尚未寄出奉獻驗收通知或代禱信。

後續：
1. 重新取得 CUA 文件與目前瀏覽器狀態；讀取已登入 Supabase 專案 aqanuwilmvdtlzuqlrau 的 Auth SMTP 設定。不要用 shell 或額外自動化繞過瀏覽器停用設定，也不要讀取瀏覽器 cookies/profile。
2. 核對既有設定如何安全提供給新 Edge（OFFERING_SMTP_USER/PASSWORD/可選 HOST/FROM）；憑證不進 chat/GitHub/log。涉及憑證輸入或權限擴大時遵循 CUA 交接／確認要求。
3. 先審查本次 migration/Edge/回退，保持 intake disabled；按 release-runbook 分階段測試真實 service_role、雙通道合成通知、收件匣與實機。不手動把通知狀態改為 sent 來越過啟用閘門。
4. 驗收確認後才設 endpoint、專用 cron、啟用收件並將 PR #316 轉 ready/合併。驗證 GitHub Pages、正式檔案及頁面，最後透過教會 Gmail 寄 forward-email.html 給使用者。

本次只部署過一個不讀憑證值的 SMTP readiness probe；已封存為回覆 410、verify_jwt=true。不要再使用它推論 Auth SMTP 設定。其他先前一次性 LINE helpers 也均已關閉。
