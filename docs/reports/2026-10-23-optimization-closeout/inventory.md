# 教會 OS 功能入口盤點

2026-10-23。來源為目前 `app-function-definitions.mjs`；48 個入口，35 個內部入口對應 34 頁，13 個外部入口。入口存在與靜態資源完整不代表所有業務流程已實機驗收。

| 功能 | 入口 | 範圍 |
| --- | --- | --- |
| 雲彩見證 | `testimony-admin.html` | 教會 OS |
| 審核流程 | `review-workflow-settings.html` | 教會 OS |
| 會友 | `members.html` | 教會 OS |
| 新朋友 | `newcomer-care.html` | 教會 OS |
| 同工工作區 | `pastoral/workspace.html` | 教會 OS |
| 同工工作流程調查 | `pastoral/workflow-survey.html` | 教會 OS |
| 代禱與關懷 | `prayers.html` | 教會 OS |
| 關懷訊息 | `pastoral-inbox.html` | 教會 OS |
| 出席登記 | `attendance.html` | 教會 OS |
| 小組與小家 | `groups.html` | 教會 OS |
| 服事安排 | `schedules.html` | 教會 OS |
| 場地與設備 | `spaces.html` | 教會 OS |
| 物品與借用 | `inventory.html` | 教會 OS |
| 熱火籃球營 | `heat-camp-admin.html` | 教會 OS |
| 主日週報 | `website-maintenance.html` | 教會 OS |
| 協會網站 | `association-news.html` | 教會 OS |
| 小組教材 | `group-resources-management.html` | 教會 OS |
| 生命樹 | `daily-devotional-admin.html` | 教會 OS |
| 生命樹節慶預覽 | `life-tree-festivals.html` | 教會 OS |
| LINE 身分確認 | `binding-review.html` | 教會 OS |
| 通知設定 | `notification-settings.html` | 教會 OS |
| 課輔 | `https://school.mchurch.online/` | 外部系統，另行驗收 |
| 課輔打卡 | `https://school.mchurch.online/?tab=checkin` | 外部系統，另行驗收 |
| 課輔安排 | `https://school.mchurch.online/?tab=schedules` | 外部系統，另行驗收 |
| 課輔出席 | `https://school.mchurch.online/?tab=rollcall` | 外部系統，另行驗收 |
| 學生 | `https://school.mchurch.online/?tab=students` | 外部系統，另行驗收 |
| 個別輔導 | `https://school.mchurch.online/?tab=counseling` | 外部系統，另行驗收 |
| 課輔報表 | `https://school.mchurch.online/?tab=print-center` | 外部系統，另行驗收 |
| 籃球隊 | `https://mschurch-app.github.io/m-plus-basketball/` | 外部系統，另行驗收 |
| 比賽紀錄 | `https://mschurch-app.github.io/m-plus-basketball/?tab=gamecenter` | 外部系統，另行驗收 |
| 籃球戰術 | `https://mschurch-app.github.io/m-plus-basketball/?tab=tactics` | 外部系統，另行驗收 |
| 球員作業 | `https://mschurch-app.github.io/m-plus-basketball/?tab=assignments` | 外部系統，另行驗收 |
| 球隊行程 | `https://mschurch-app.github.io/m-plus-basketball/?tab=schedule` | 外部系統，另行驗收 |
| 每日狀態 | `https://mschurch-app.github.io/m-plus-basketball/?tab=dailystatus` | 外部系統，另行驗收 |
| 系統狀況 | `system-monitor.html` | 教會 OS |
| 教會設定 | `church-settings.html` | 教會 OS |
| 牧養圖卡 | `pastoral-content.html` | 教會 OS |
| 給今天的你 | `todays-message-settings.html` | 教會 OS |
| 把愛傳出去 | `love-share-settings.html` | 教會 OS |
| LINE 服務預覽 | `line-preview.html` | 教會 OS |
| 首頁與表單 | `customization-settings.html` | 教會 OS |
| 同工帳號與權限 | `admin-accounts.html` | 教會 OS |
| 社群發布 | `media-publishing-settings.html` | 教會 OS |
| 信息預備 | `sermon-preparation.html` | 教會 OS |
| 字幕詞庫 | `youtube-subtitle-library.html` | 教會 OS |
| 服事意願與協調 | `service-signup-admin.html` | 教會 OS |
| 主日奉獻 | `finance-cash.html` | 教會 OS |
| 服事快速適配 | `service-signup-admin.html?match=1` | 教會 OS |

所有內部入口檔案與其本機靜態引用均存在。主日奉獻只執行既有隔離回歸，本批程式未修改。兩個公開教會網站與獨立課輔／籃球系統的內容及業務流程另有各自範圍。
