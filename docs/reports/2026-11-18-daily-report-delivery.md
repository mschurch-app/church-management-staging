# 日報投遞類型修正 — 2026-11-18
台灣21:27排程核對。11/17、11/18各一份日報與站內通知；每日21:15監看已各建立一筆投遞待確認提醒。11/18 cron id36成功，INSERT 0 1。
## 根因與修正
正式 daily-traffic-report v25 在呼叫LINE後寫入 notification_type=daily_traffic_report，但既有資料庫CHECK只允許16種業務，沒有日報類型。11/18 13:00:07.776Z PostgreSQL明確記錄該CHECK違規，對應HTTP request225044回傳500 upstream_failed。
新增且僅新增daily_traffic_report為允許值，以動態取得原條件後OR擴充，避免刪去既有值。3秒鎖定逾時，整筆migration交易。既有RLS、唯一防重鍵、權限與資料列保留。11/18以Supabase migration allow_daily_traffic_report_delivery_type上線，CHECK validated=true；正式投遞123筆，與變更前一致。
## 驗收
- 隔離temp表重現原CHECK拒絕日報。
- 擴充後日報、calendar_participant、leave_result可寫，未知類型拒絕。
- 複製正式投遞表完整約束/索引，測v25完整payload及同key兩次upsert只一筆；全部rollback，沒有正式測試列或對外通知。
- 完整payload測試首次因無效類型fixture漏related_id而失敗；補齊必填欄位後重跑，以CHECK違規測到預期分支。
- 正式讀回新CHECK已驗證、RLS仍開啟、原123列不變。
## 尚待確認
修正前11/17–18私人LINE可能已被服務商受理，因存檔失敗而沒有成功紀錄。不能把缺紀錄當作未送出。本輪不補送、不填造成功紀錄，原提醒保留，下一次正常21:00執行再驗實際投遞存檔。LINE retry key=站內通知UUID，防重有供應商時限，舊日期不自動重送。
11/18〈門徒班見證〉已發布 https://www.instagram.com/p/Df4FaQUk5EG/ ，另兩篇11/19、20台灣19:00正常排程中。
YouTube當日統計仍awaiting_data；Facebook洞察尚無資料，此為統計來源，不能推論FB發布授權失效。iPhone及Android真實LINE建檔、重開、附照重試及人工審核仍待實機結果，未宣稱通過。
## 回退
本次擴充保留舊類型，無須停機。若須暫停日報LINE，先暫停其排程並保留已送出/已記錄資料。禁止刪除新日報投遞列以強行縮回CHECK；若新類型已有紀錄，保留本擴充，回退應用層即可。僅在確認沒有daily_traffic_report列時，才可交易還原舊16值CHECK（參照變更前receipt）。本次不更改Edge Function，仍v25。
