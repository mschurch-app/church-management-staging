# 我的奉獻資訊：11/20 可操作隔離試用版

## 本輪交付與邊界

使用者要求立即開始、11/20 能夠測試。本輪交付獨立的 `member-offering.html?church=M%2B&mode=demo`，可以操作驗證、年度合計、237筆分頁、空年度、收據狀態/預覽/列印、手動鎖定與背景清除。預設無 mode=demo 的正式路徑保持未開放。沒有更改既有 LINE 選單、正式會友入口、奉獻流程、帳務、收據或驗證設定。

頁面及收據均清楚標示合成資料。測試驗證碼246810直接顯示在頁面，僅模擬輸入、錯誤與逾時，不代表已寄出Email或完成真實身分驗證。不呼叫LINE、不寄信、不讀正式帳務、不儲存真實身分與金額。

## 操作

1. 開啟試用網址，按「開始測試本人驗證」。
2. 可先輸入錯誤碼確認阻擋；輸入畫面上的測試碼246810。
3. 2026年度有237筆示意資料，可翻至第12頁；年度合計只計入財務已確認資料，翻頁不改合計。2027為無紀錄狀態。
4. 切至收據狀態：已開立可預覽帶醒目浮水印的測試收據；待開立及作廢不能預覽下載。可列印示意，不產生正式憑證。
5. 鎖定或切到背景會清除畫面中的明細及收據；查詢10分鐘絕對到期、5分鐘閒置鎖定，重新進入需重驗。試用驗證碼5分鐘有效，錯5次冷卻30秒；重發至少間隔60秒、15分鐘最多3次。

## 隔離驗收證據

- `tests/member-offering-pilot/transport.mjs`：237筆唯一紀錄、分頁、年度合計不含待核對/退回、錯碼/過期/限次、短效查詢、作廢收據拒絕。
- `tests/member-offering-pilot/browser.mjs`：Chrome/WebKit各393與1440尺寸。正式入口預設關閉、錯碼不進入、全部12頁可達且最後一頁下一頁禁用、年度切換、收據浮水印、鎖定/背景後資料清空、無外部請求及無橫向溢出。
- `tests/member-offering-pilot/database.mjs`：用PGlite隔離資料庫執行候選SQL，實際service-role查詢206筆歸戶資料，排除其他會友、不具名、草稿、他堂會；跨身分/錯token/過期/停用試用拒絕；超過200筆可查到最後一筆；收據只接受明確歸戶連結。
- `tests/member-offering-pilot/http.mjs`：候選HTTP reader預設關閉，必須驗證LINE身分、限流、雜湊短效查詢token；禁止前端memberId、跨來源與錯誤詳細資訊洩漏。
- 現有Worker27項通過。以上不是實體手機LINE或真實Email投遞驗收。

測試最初發現隔離fixture的service_role未模擬正式BYPASSRLS屬性，造成私有表讀取被拒；修正fixture符合正式角色，不放寬RLS。另修正分頁按鈕finally狀態覆蓋最後一頁禁用的問題。

瀏覽器證據在工作區 `local-operations/member-offering-pilot-20261120/`；無正式個人資料。

## 真實資料查詢基礎：候選，尚未部署

`member-offering-pilot.sql`新增私有試用資格、短效驗證session、收據歸戶關聯。沒有預設啟用任何正式會友。`read_my_offering`是service-only invoker RPC，瀏覽器無法直接呼叫或讀私有表，固定空search_path。

讀取身分只從後端已驗證的LINE channel/subject取得，重新檢查active binding、未封存會友、試用資格與未撤銷且未過期session；不接受memberId或奉獻編號指定查詢對象。只讀明確member_id的奉獻；不以同名、同手機或手填編號自動歸戶。booked才計入年度合計，spouse_review/pastor_review顯示待核對，returned另列，draft不顯示。收據透過財務明確確認的receipt_links查詢，不使用自由文字source_ref猜測歸屬。

`supabase/functions/member-offering/handler.mjs`為候選production HTTP reader，預設enabled=false，尚未部署Edge Function。試用前端完全不連這個reader。

## 下一步與正式開放條件

1. 核對並接上既有Google SMTP寄送服務；不假設原先邀請同工的SMTP已可供新Edge使用。建立已確認本人的Email/手機管理與驗證紀錄。真實OTP須在後端產生、雜湊存放、限制重發/錯誤、單次使用，token綁定LINE身分、member_id及短效session。
2. 建立財務可核對的試用資格與收據歸戶入口，先允許受邀測試者，未核對資料維持關閉。無可信聯絡方式者由財務核對，不能以生日/末碼/奉獻編號取代驗證。
3. 經隔離測試與安全檢查後，才部署候選SQL/reader及連接正式入口；不把demo驗證碼當作正式驗證方式。
4. 實體iPhone/Android LINE驗收真實登入、OTP投遞、背景重開、本人資料、跨會員越權、收據與財務對帳。真實OTP投遞/本人資料查詢/正式收據下載都尚未宣稱通過。

## 回退

這次只新增獨立試用頁與靜態資源；可移除試用入口或回退本次提交，不必變動既有資料庫及Edge。候選SQL沒有在正式環境執行，亦無正式會友或帳務測試資料需要清除。
