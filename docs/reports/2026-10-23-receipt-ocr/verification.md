# 支出發票影像辨識

使用者更正為「發票號碼」而非統一編號；流程依指示調整為受款人之後拍攝憑證，之後再核對金額、用途與憑證編號。

Gemini 3.5 Flash-Lite讀取既有private bucket照片；只接受兩個英文字母加八位數發票號碼、正整數TWD含稅總額與品名數量，不把統編、現金收取、找零或外幣直接帶入支出。品項可帶入用途摘要（500字）；完整辨識品項仍可閱覽。模糊、多張憑證或幣別不明時保留手動修正。所有結果均需同工核對，不自動儲存或送審。

只帶入第一張照片對應的空白欄位，已有值不覆寫，多張照片不自動相加；使用者可逐欄明確採用辨識值，也可關閉自動辨識。背景工作讓表單持續可編輯，離開／換筆／移除照片停止前端輪詢，結果不會改動已儲存帳目。辨識逾時或錯誤不影響上傳成功的照片與手動儲存。

RPC僅service_role可執行；重查停用帳號、entry角色、提報人與憑證歸屬；新上傳到既有草稿但未儲存的照片也可由本人辨識。每張快取、lease/token防止重複或逾期結果覆寫，每張最多3次、每位提報人24小時30次；所有OCR操作不寫入expenses／expense_events。背景Google請求30秒逾時，前端輪詢有65秒上限。

實測：純合成收據含發票號碼AB12345678、A4 Paper×2、應付1500、收取2000、找零500，Google API回傳200，耗時2007ms，發票號碼／1500／品項正確。未用真實憑證送外部測試，沒有寫正式支出帳。先前12秒測試逾時，舊2.5模型被Google拒絕後依API診斷固定使用3.5 Flash-Lite。一次清楚圖片成功不代表每張憑證成功率或時間保證。臨時固定圖片診斷路徑有既有內部secret保護，實測後已移除，正式函式v7 ACTIVE，原本JWT及角色檢查保留。

驗證：15項單元／PGlite資料庫回歸（含6項OCR），Chrome390/1440各15項OCR流程，支出原有各19項完整送審付款流程，worker23項與語法/diff通過。瀏覽器的OCR流程使用mock服務，實際Google呼叫證據另列provider-smoke.json。iPhone/Safari實機待驗收，未宣稱99%。

參考文件：
- https://ai.google.dev/gemini-api/docs/generate-content/image-understanding
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://supabase.com/docs/guides/functions/background-tasks
