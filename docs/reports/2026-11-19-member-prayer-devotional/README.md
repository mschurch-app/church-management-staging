# 請為我禱告與年度每日靈修

## 最終需求與行為

M+ 會友的「需要禱告時」改成「請為我禱告」，新表單預設指定團隊私密，填主題/內容後選分享對象並預覽確認。公開代禱內容傳青年群；私密代禱也傳同一青年群，但訊息嚴格只有登入查看連結，沒有姓名、主題或內容。新私密資料只允許吳俊璋、謝碧鳳、邵鈺庭、曾恩茹，後端 RLS 限制；原有歷史資料與其他同工權限保留。舊 M+ 光環入口轉至表單及代禱清單，SHiNE 入口保留原行為。

「給今天的你」保留原經文祝福及分享圖卡，加入年度讀經、全年靈修內容、完整經文展開、分章朗讀、完成紀錄與個人手札。使用生命樹正式年度方案的月日循環，現在即可使用，記錄採實際日期；不同年度互不覆蓋。閏年2/29延用2/28經文並明示，筆記仍記2/29。只有未來日期為不可寫入試讀；今日祝福API失敗不阻擋年度靈修。

## 資料與權限

- LINE ID Token 向 LINE 官方驗證 issuer、audience、expiry、iat、subject；亦支援驗證 access token。瀏覽器傳入 member id、subject 不被信任。
- `member_care_operation` 僅 service_role 可執行，資料庫以現存有效 binding 定位未封存會友。筆記以 church/member/date 為主鍵，保留換 LINE 綁定後的會友歸屬；新表不授予一般同工、authenticated、anon 存取權。
- 儲存筆記、標記完成分開；版本不符阻擋覆蓋，相同已存內容可安全重試，完成時間保留。歷史每次30筆可繼續翻閱。
- 新私密代禱有 row scope，現有 private_prayers 權限不能越過指定四人限制。正式只讀權限核對四人 true、高曼臻 false；一般同工無筆記 SELECT、匿名/登入者均無私人物件 RPC EXECUTE。
- 公開與私密分享範圍在套用/確認前說明青年群用途。個人手札不送青年群、不提供同工閱讀。

## LINE 通知

與代禱插入同一交易建立一筆投遞佇列。青年群收件群組由既有設定定位，正式 read-only route_check 回傳 `M+青年教會`；每次發送前再核對群組身分/名稱。私密訊息有 DB CHECK 與發送器雙重 URL-only 防線。青年群連結只包含需登入的祈禱 id，頁面不公開私密正文。

`member-care-line-notifications` 每分鐘處理佇列。請求 UUID/文字/收件群組固定；原子 lease 與相同 X-Line-Retry-Key 防重複，409已受理視為accepted；5xx/逾時受控重試，超過23小時改為uncertain，不盲目再送。會友「我的代禱紀錄」顯示通知排隊、受理、失敗或待確認。LINE accepted不代表已讀。[LINE重試規範](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)。沒有回補或重送舊代禱。

## 來源與驗收

`annual-source.json` 記錄正式公開來源與 SHA256，365日/365篇逐筆比對一致，按月拆為12份載入。閱讀資料來自既有已核准生命樹方案，未重新生成文字或修改遊戲/玩家紀錄。

- temp schema/transaction隔離 SQL：跨會友/堂會、失效綁定、重試及payload衝突、筆記保存與版本衝突、完成保持、實際日期、未來日期拒絕通過；未寫入正式測試資料。
- 通知 SQL：public內容、private只有連結、唯一佇列、claim/lease、已受理不重排、23h過期進uncertain通過。
- provider/delivery單元：LINE channel/expiry、假ID忽略、access fallback、失敗狀態、青年群核對、私密正文拒絕、重試key及409/503通過。
- Chromium/WebKit 393/1440四組元件測試；四組實際today/prayer入口測試：經文讀取/重試、本人筆記跨次重開、完成分離、現在按月日使用、未來日期禁寫、舊入口轉向、私密範圍/發送前確認、無JS錯誤或橫向溢出。
- Worker27、功能定義20、Shell7回歸通過。
- 正式新API未登入401；實際指定四人存取/匿名及staff journal ACL/群組路由核對完成。正式佇列、筆記均0筆，未向青年群送測試訊息。
- 新增三張私有表預期出現 RLS無一般policy的 INFO；anon/authenticated已revoke，service_role與身分驗證RPC是唯一入口。相關說明：[Supabase RLS檢查](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。沒有為壓制警示而開放policy。

真實 iPhone/LINE 聲音播放、真人提交與群組實際收件仍待驗證，不能宣稱100%或99%實機驗收。截圖為合成資料。

## 回退

前端可還原本PR前的檔案與Worker；暫停通知只需 unschedule `member-care-line-notifications`，佇列與筆記保留。不要撤銷新增私密範圍政策，否則可能讓舊權限看到新私密資料。新私有表與已存會友內容保留，不刪資料、不重設登入、不修改遊戲。新函式獨立，不覆蓋原 line-member/prayer-wall Edge Function。
