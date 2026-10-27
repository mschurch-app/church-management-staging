# 獨立自製相簿

行政 → 相簿進入 church-albums.html，在教會 OS 內切換教會相簿／課輔相簿、瀏覽既有 Google 資料夾、新增資料夾、預覽照片與批次上傳。手機的上傳照片使用 image/*、multiple，不使用 capture，保留從手機相簿挑選多張的能力。另提供任意類型檔案上傳，每個檔案 20 MB，說明選填。

視覺沿用系統字體、語意 tokens、自製 SVG 與五大底部導覽，表面控制標記 data-app-control 避免共用主要按鈕配色覆蓋；手機兩欄分類、三欄內容、兩欄操作，桌面保留寬版工作區。入口納入功能目錄並沿用 pastoral_workspace 指派條件，限 M+。

church-albums Edge Function 自行驗證 Supabase／LINE 登入與在職 M+ 同工範圍，verify_jwt=false 僅用於相容既有雙登入方式。每次 API 驗證目標位於核定類別根資料夾內，拒絕捷徑／外部資料夾越界，新增與上傳另檢查 canAddChildren。Google 憑證僅在後端，原檔只寫 Google Drive；照片預覽僅經記憶體傳送，不建立 SSD、資料庫或本機原檔副本。沒有變更分享權限、既有資料夾結構或出勤協作工具。

驗證：導航 5 項、功能目錄 20 項、後端 6 項通過。393／1440 px 隔離瀏覽器均通過分類、建立資料夾、多選兩張照片與空白說明上傳流程及橫向溢出檢查。正式 API 未登入請求回應 401。Google 真實帳號端對端上傳與 iPhone 照片選擇器尚未驗收，不以模擬結果代替實機驗收。

共用 quality-gate：231 個前端模組語法檢查通過，15 組回歸中 14 組通過；phase4/browser 的 update never displays unsolicited banner 在未修改基準 533865e 也同樣失敗，已隔離確認為既有問題，不宣稱全套通過。

## Google 授權讀取修正
2026-10-27 唯讀連線診斷確認：連線帳號為 mbot@tcsc.org.tw，兩個相簿 API 均回應 403 insufficientPermissions（Request had insufficient authentication scopes），並非可斷言的資料夾分享問題。新增管理者 status 與獨立相簿 connect-albums OAuth 流程；OAuth 增加 drive.readonly 用於讀取既有相簿、drive.file 用於建立本應用程式檔案，保留既有 calendar scopes。Google 的 read-only 授權範圍比兩個資料夾廣，授權前的介面清楚告知；後端仍逐次限制只存取兩個核定根目錄。未設定 Google Picker 的環境不要求使用 Picker。授權成功、取消及缺少 scopes 均返回獨立相簿，不跳協作平台。Google 新增授權必須由帳號持有人在 Google 確認，尚未完成前不宣稱實際上傳成功。

本次驗證：8 個相簿後端測試、4 個 OAuth 回呼測試、5 個導航測試通過，手機及桌面批次上傳回歸通過；新增缺少 scope 的手機管理者設定與失敗重試流程測試通過。暫時後端診斷程式已移除。

## 隔離相簿與 YouTube OAuth（取代上述合併行事曆權限方式）
使用者實際 Google 授權頁回覆 invalid_request，列出 drive.file、youtube.force-ssl、yt-analytics.readonly 不可合併。connect-albums 現在只請求 openid、email、drive.file、drive.readonly，明確設定 include_granted_scopes=false，不合併先前 Google 權限。既有 calendar 與 drive 舊流程維持原權限。

相簿獨立使用 Vault 的 church-albums-google-refresh-token。只有 service_role 可呼叫公開的 SECURITY INVOKER 包裝函式，實際 Vault 操作在未對 Data API 曝露的 church_album_private schema，並驗證 JWT role。原 pastoral-google-refresh-token 的 updated_at 在遷移前後一致，沒有覆寫、撤銷或複製既有憑證；相簿只有完成新授權後才有自己的憑證。

驗證：19 項相簿後端／OAuth／導航檢查通過，含不得合併 YouTube／行事曆、相簿憑證專用儲存、原行事曆 callback 相容；手機連線錯誤重試檢查通過。資料庫權限查核確認 anon／authenticated 不能執行憑證存取；安全 advisors 對照無新增 finding。新 Google 同意仍須由帳號持有人完成，未宣稱真實 Google 授權或相簿上傳成功。

## 已授權但 Drive API 未啟用
2026-10-27 09:28:19 UTC 相簿專用 Vault 憑證已由 Google callback 保存。之後唯讀後端探測確認 mbot@tcsc.org.tw 對兩個核定根資料夾均回應 403 accessNotConfigured：Cloud 專案 817689019280 尚未啟用 drive.googleapis.com。這是 Google API 服務設定，不是缺少 OAuth 同意或已證明的資料夾權限問題。前端現在獨立顯示 API 啟用說明與指定專案設定連結，不要求重複相簿授權；啟用後原重新讀取按鈕即可重試。Google Cloud 本機頁面要求帳號本人通過密碼金鑰驗證，啟用與實際讀寫驗證尚待使用者完成此步驟。

測試：後端將 accessNotConfigured 分類為 drive_api_disabled（503）；手機模擬驗證顯示設定連結、隱藏重複 OAuth 控制及保留重新讀取。15 項後端／OAuth、5 項導航、23 項 Worker 檢查通過。臨時連線探測碼已移除，未下載照片或暴露憑證。

## 分類下方的資料夾與獨立照片區
教會／課輔兩個分類卡片下方各自顯示該類別的 Google 資料夾，點選資料夾後在下方內容區顯示照片／檔案；資料夾不再混入照片格狀清單。巢狀資料夾沿選取路徑縮排顯示在同一分類下，麵包屑保留返回入口。新增資料夾對話框明示建立位置，仍使用目前分類與所選資料夾 ID；不移動或複製既有 Google 資料。

資料夾索引沿用既有授權 API，分頁讀取只到資料夾區段結束，版本檢查避免較早索引覆蓋剛建立的資料夾。手機與桌面維持兩欄分類、三欄照片。驗證：393／1440 px 合成瀏覽器通過分類歸屬、資料夾不混入照片、巢狀選取、正確父資料夾建立與無橫向溢出；原批次上傳回歸通過；導航、Worker 與 Google 錯誤恢復檢查通過。此次沒有修改正式 Google 相簿資料或後端。
