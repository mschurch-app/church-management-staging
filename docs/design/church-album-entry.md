# 獨立自製相簿

行政 → 相簿進入 church-albums.html，在教會 OS 內切換教會相簿／課輔相簿、瀏覽既有 Google 資料夾、新增資料夾、預覽照片與批次上傳。手機的上傳照片使用 image/*、multiple，不使用 capture，保留從手機相簿挑選多張的能力。另提供任意類型檔案上傳，每個檔案 20 MB，說明選填。

視覺沿用系統字體、語意 tokens、自製 SVG 與五大底部導覽，表面控制標記 data-app-control 避免共用主要按鈕配色覆蓋；手機兩欄分類、三欄內容、兩欄操作，桌面保留寬版工作區。入口納入功能目錄並沿用 pastoral_workspace 指派條件，限 M+。

church-albums Edge Function 自行驗證 Supabase／LINE 登入與在職 M+ 同工範圍，verify_jwt=false 僅用於相容既有雙登入方式。每次 API 驗證目標位於核定類別根資料夾內，拒絕捷徑／外部資料夾越界，新增與上傳另檢查 canAddChildren。Google 憑證僅在後端，原檔只寫 Google Drive；照片預覽僅經記憶體傳送，不建立 SSD、資料庫或本機原檔副本。沒有變更分享權限、既有資料夾結構或出勤協作工具。

驗證：導航 5 項、功能目錄 20 項、後端 6 項通過。393／1440 px 隔離瀏覽器均通過分類、建立資料夾、多選兩張照片與空白說明上傳流程及橫向溢出檢查。正式 API 未登入請求回應 401。Google 真實帳號端對端上傳與 iPhone 照片選擇器尚未驗收，不以模擬結果代替實機驗收。

共用 quality-gate：231 個前端模組語法檢查通過，15 組回歸中 14 組通過；phase4/browser 的 update never displays unsolicited banner 在未修改基準 533865e 也同樣失敗，已隔離確認為既有問題，不宣稱全套通過。
