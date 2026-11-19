# 同工代填服事登記

2026-11-19；基準 PR336 merge ba5eec07c0dcbe0ac85318874c5febb9e5fa313b。

## 介面與行為

服事登記管理頂部新增「＋同工代填」。同工選取目前期別的日期／職務，搜尋並明確選擇名冊會友，勾選本人已同意後送出。失敗保留表單；成功回到名單並顯示實際登記／候補結果。不得使用自由文字代替會友ID；同名會友以小組及編號區分。

不要求 LINE 綁定。沿用現有名冊、服事管理授權與職務範圍；查無名冊先建立會友資料。新登記有名額為registered，額滿為waitlisted，仍須既有負責人確認後才成為正式班表。同一人、同一項目重試回傳原紀錄；同日已有另一項有效登記則拒絕。停止開放、過期日期、跨堂會、封存會友均拒絕。

新增 registered_by 記錄代填操作者。line_subject 可為NULL，但新增CHECK要求LINE身分或代填操作者至少一項存在；不建立虛構LINE帳號或綁定。若有既有有效LINE綁定，沿用真實LINE subject。代填名單標示「同工代填」。代填候補進入offered後，同工可先取得本人同意，再按「代為接受候補」，承接後仍為待確認；逾期拒絕，重試不重複承接。

## 資料庫與授權

service-signup-delegate.sql 已透過 Supabase migration staff_assisted_service_registration 上線。僅新增兩個RPC、代填操作者欄位與身分CHECK、放寬LINE欄位空值，並在既有授權讀模型附加registered_by。沿用get_service_signup_admin的有效帳號、owner／schedules manage／ministry scope驗證，寫入前核對選定slot確實在授權讀模型內；沒有放寬原RLS或資料表直接寫入權。

兩個RPC為security definer、search_path空字串、撤銷PUBLIC及anon執行權、僅authenticated可呼叫，函式內仍驗證實際帳號與職務範圍。安全檢查新增兩則[authenticated security definer可執行提醒](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)，對應上述刻意授權的RPC；此提醒已審查，沒有額外資料表讀取權限。正式讀回anon不可執行，RLS仍啟用、身分CHECK validated=true。

## 驗收與證據

- tests/service-signup-delegate.sql：完全使用temporary tables與複製函式，交易rollback；無正式測試列、無對外訊息。測無LINE登記及稽核、同筆重試、滿額候補、同日衝突、跨堂會、封存會友、職務範圍、撤權、關閉職務、過去日期、同工承接候補及重試，通過。
- 正式RPC以空登入claims唯讀驗證，兩個入口均由原get_service_signup_admin拒絕forbidden；第一次驗證fixture誤預期42501，原函式實際回P0001 forbidden，改以精確錯誤訊息斷言後通過。
- Chromium／WebKit ×393／1440四組隔離瀏覽器通過，涵蓋原名單操作、代填查詢與送出、錯誤保留欄位、候補承接、查詢文字變更清空舊人選、撤權清空及恢復；所有寫入均為mock。
- 測試發現兩個恢復問題並修正：新建候補按鈕不應捕捉載入中的busy永久鎖定；撤權後重新載入成功，代填靜態控制必須恢復。最終四組通過。
- 既有導覽5項、功能定義20項、Worker27項通過；語法及diff檢查通過。實體iPhone／Android／LINE及真人代填尚待驗，未宣稱99%。
- 正式資料於本輪處理期間由1筆變成3筆（2筆registered、1筆cancelled），registered_by全NULL，屬既有流程正常活動；本輪未建立正式測試登記，也未覆寫既有資料。

## 發布與回退

前端四檔（service-signup-admin HTML／MJS／CSS及Worker）統一版本20261119-delegate1；合併後逐檔讀回比對。回退可還原四檔並以新Worker版本發布，撤銷兩個新RPC的authenticated執行權以停用代填。保留新增欄位、身分CHECK及已有代填資料，不清除或偽造LINE身分，不將line_subject強制改回NOT NULL，以免破壞無LINE的真實登記。既有LINE登記及正式班表繼續保留。
