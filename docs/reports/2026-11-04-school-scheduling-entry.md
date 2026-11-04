# 行政課輔薪資的班表入口（2026-11-04）

使用者指定在行政「課輔薪資」浮窗加入「班表安排」，並僅允許恩茹、鈺庭安排班表。新增入口接到既有課輔排班月曆，沿用教會 OS SSO、單日與多週排班、重疊檢查及月底送審後鎖定。原「每月結算與審核」保留。

導覽權限由既有 get_my_permission_navigation 回傳 schoolScheduleAccess：M+、固定薪資帳號綁定有效，且對應既有 can_manage_schedules 判定。前端嚴格要求 true，不因擁有者或一般課輔查看權取得入口。既有 API 及資料庫寫入只允許 2026M0003／2026M0004；牧師師母時薪與審核權限未擴成排班權。新增功能 metadata 同步功能目錄、搜尋分類與共用圖示，更新受影響模組引用及 Worker cache。

驗證：
- 正式資料庫交易回滾測試：四個固定帳號的導覽布林值符合兩位指定排班者；薪資審核入口保留；匿名拒絕。未修改班表、薪資或送通知。
- Node 角色、路由及既有五大入口 8 項通過；統一權限導覽、app-catalog 及 Worker quality gate 通過。
- 完全攔截網路的合成 Chromium 測試 393／1440 寬：兩個入口、排班路由、非排班者隱藏、無水平溢位、無 JS 錯誤；本機截圖存 SSD。
- 未宣稱 iPhone 或 Mac Safari 真機驗收完成，亦未宣稱產品整體達 99%。

後端 migration：add_authorized_staff_scheduling_navigation（20261104005651）。只擴充既有私有導覽實作的布林結果；公開 invoker 轉接、認證及 session 檢查不變。安全 advisors 未出現該導覽函式的新警示。
