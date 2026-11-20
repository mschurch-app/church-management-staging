# 火樂三頁籤選單（2026-11-21）

火樂官方帳號 @248mbbrr 使用獨立 LINE_SHINE_MESSAGING_CHANNEL_ACCESS_TOKEN 與 shine-rich-menu-admin。M+ 預設選單及原 token 不變。

可用入口：每日讀經靈修、隨時的幫助、同心代禱、分享恩典卡、本週聚會、個人資料更新、靈修手札。所有功能網址固定為火樂 LIFF；聚會、圖卡、會友與代禱沿用 church_id=SHiNE 查詢。

服事登記、奉獻查詢、小組資源、雲彩見證保留灰色圖卡但不建立 LINE 點擊區域；網頁使用原生 disabled 按鈕，不導向 M+。

每日靈修共用已公開的年度讀經、經文與默想靜態教材，不讀取 M+ 會友、筆記或完成紀錄。member-care 僅開放火樂 journal_get/history/save；RPC 依已驗證 LINE 身分與火樂綁定解析 member_id，傳入 p_church=SHiNE，無 M+ fallback。舊版 daily-devotional 的火樂參數返回正確火樂入口。

驗證：同一個合成 LINE 身分分別綁定兩堂，儲存不同筆記後只讀回本堂歷史，無火樂綁定即拒絕；全部使用暫存表、交易回滾。Chrome/WebKit 各測 320/393px 選單及靈修經文、筆記、完成與重開流程；所有請求限定 SHiNE。四個停用功能沒有覆蓋的 LINE 熱區。

回退：清除火樂 Messaging API default，恢復未更動的 Official Account Manager 預設；保留新建選單、aliases 供核對。member-care 可還原原 handler，保留已寫入的火樂手札資料。不可修改或清除 M+ 個人選單。

正式驗收與發佈回執：工作區 local-operations/shine-menu-20261121/。實體 iPhone/Android 仍需使用者確認，不以瀏覽器模擬代替。
