# 協會照片故事切換 Canva

製圖入口改用既有教會 Canva 加密連線與 design generation API；圖片不再呼叫 Google 圖片模型，不自動回退其他供應商。文案潤飾仍沿用原文字服務。原照片、稿件、投稿／審核分工、FB與協會網站發布流程保持原狀。

## 實際製作方式與限制

Canva 每次新生成一頁插畫／視覺背景，再核對單頁、調整1080×1350、匯出JPEG並保存私人空間。前端將1–5張真實照片完整入框，加入原主題與最多三項重點，不重畫或裁掉人物。圖上文字由原稿繪製，避免AI拼錯姓名或主題。這是「Canva新視覺＋原照片與文字合成」；不是將原照片交給Canva做整張人像重繪。本版不自動去背，介面已明示且停用該選項。設計需求影響Canva美術背景及色調，照片排版保留受控入框配置；不能宣稱每個前景元素的位置均由AI自由排版。

公開Canva設計生成API目前支援doc/presentation，故沿用週報既有的單頁生成、Resize、Export路線；未增asset權限、不改密鑰、不改既有應用設定。對話的Canva連接器與網站OAuth是不同帳號連線；連接器無權讀本次設計，不拿它的成功或失敗當網站驗收。

## 恢復、安全與防重複

工作存於service-only的association_story_canva_jobs，RLS開啟，anon/authenticated均無直接讀寫權。原作者只能透過已登入且驗權的association-stories查詢自己原單的工作；主管審核權不變成替他人製圖權。

同一工作ID會讀回原工作，同一原單最多一筆working。短租約防止並行POST，真正執行前重新讀取租約內的最新狀態。建立／縮放／匯出先保存階段；不確定POST結果時保留blocked，不自動重複花AI額度。重新開啟草稿可繼續讀取同一筆結果，150秒未完成會停止本次等待並保留恢復入口，不另起生圖。查進度不要求過期的稿件version；真正套用仍核對作者、目前稿件狀態、版本與完整輸入指紋，舊結果不能蓋過新工作。

資料庫觸發器以原單鎖序列化生圖與送審，防止製作中送出舊圖或送審後起新圖。成圖輸入指紋涵蓋主題、重點、主體模式、色調、氛圍、美術需求和所有照片摘要。輸出只接受Canva網域HTTPS、不跟隨轉址、限12MB、驗證JPEG及1080×1350；私人背景不會直接被當作完整照片故事送審。完整照片合成保存失敗仍可預覽及重套，不需重新生圖。

## 真實服務驗收

沿用原M+ Canva授權。私密檢查確認active=true及既有design三項與brandtemplate兩項scope，沒有新增權限；正常更新過期access token並以原加密方式保存，未重設登入。

唯一合成驗收工作4c65e57e-29d5-4d96-8406-3576d9023234，以不含真人個資的插畫需求完成：一次新生成、單頁核對、4:5縮放、JPEG匯出與私人保存。結果ready，321704bytes，SHA256 39fa392f64b7b4021e001f77201ca077568bc43915f6a32d6d62a8434ad9cc9c。生成設計DAHbEKuMNb4，僅供連線Canva帳號可讀。測試不掛真實稿件，未修改恩茹原稿、未送審或發FB。

內部association-canva驗收端點的advance/preview操作在驗收後移除，只保留由既有內部密鑰保護的connection-health，不再可從該路徑建立、推進或簽出測試圖片。

## 隔離驗收

- 資料庫10項：RLS與服務權限、原作者／狀態、單一active、送審互斥、租約排他與過期恢復。
- Canva工作9項：成功鏈、防重複、未知結果不重送、額度／權限失敗、拒絕多頁及外站下載、過期稿件與錯誤作者不能套用、輸入指紋。
- 故事API20組：原權限／審核／發布及Canva原作者、同意、無舊version續查。
- Chromium/WebKit393與1440共4組Canva瀏覽器：使用上述真實Canva背景與合成照片，包含等待轉圈、失敗成圖預覽、重套不再生圖、重開續查、額度不足停止、1080×1350與無橫向溢出。
- 原故事完整瀏覽器4組、授權管理4組及Worker27項通過；Deno與語法/diff檢查通過。
- 未做實體iPhone／Mac真人完整操作，不宣稱全系統99%驗收；真實LINE作者與照片仍需現場使用回饋。

## 回退

還原本次前端、快取與association-stories前版來源即可回到先前流程。新工作表／原照片／成圖／授權與歷程保留，不刪資料。Google原路線仍保留於程式以明確legacy設定供測試／回退，不是自動備援；正式入口預設Canva。回退前先核對working工作，將停用工作標記outdated並保留紀錄，避免舊版流程因待處理工作而無法送審；不重送Canva生成要求。

## 官方介面依據

https://www.canva.dev/docs/apps/rest-apis/reference/generations/create-design-generation-job/
https://www.canva.dev/docs/apps/rest-apis/reference/resizes/create-design-resize-job/
https://www.canva.dev/docs/apps/rest-apis/reference/exports/create-design-export-job/
https://www.canva.dev/docs/apps/rest-apis/authentication/
