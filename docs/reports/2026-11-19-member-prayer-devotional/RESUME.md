# 目前狀態

使用者已確認年度表月日循環，現在開放；指定私密查看者牧師/師母/鈺庭/恩茹；兩種都傳青年群，公開內容、私密僅連結，取消四位私人通知的先前解讀。

後端已套用 `member_prayer_scope_and_annual_journal` 與 `member_devotional_month_day_cycle`，member-care Edge v1已部署；通知cron已啟用但沒有正式測試列/訊息。LINE route_check request231677確定M+青年教會；RPC和staff journal ACL已查，四人true、另一同工false。前端隔離驗收通過，正準備PR、合併及正式readback；不可在正式系統建立測試代禱以免群發。

正式入口/詳細測試/回退見 README.md，全年來源見 annual-source.json。本機證據 local-operations/member-prayer-devotional-20261119。若接手先核對PR與正式資源狀態，再決定是否仍需部署；既有未提交worktree不要重設。
