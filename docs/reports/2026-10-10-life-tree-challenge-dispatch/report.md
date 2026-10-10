# 十月同工生命樹：今日全員隨機挑戰

使用者授權「今天全部發出挑戰，四種挑戰隨機發出去」。範圍是原箴言十月同工測試的五位已加入者，每人今日一種；非每人四種，也沒有調整未來每日自然觸發機率。

## 確認與操作

- 頁面設定 `tree-reading-october-test-config.mjs` 指向專用測試專案 `svwgfgyxxgbqabosriom` 的同名 Edge Function；本次只操作該專案的 `public.tree_reading_october_test_challenges`。
- 寫入前5位參與者、2026-10-10挑戰0筆；確認欄位、identity、唯一鍵、外鍵、狀態限制，沒有非內部trigger。
- 2026-10-10 11:25:25（台北）單一insert-only SQL隨機洗牌人員及四種挑戰，再循環分配，確保四種均被涵蓋；防止日期跨日、名單不再為5人及重複寫入。衝突採DO NOTHING，沒有重置已完成挑戰。
- 實際新增5筆，ID 60–64：蟲害2、強風1、風雨1、整理1。獨立讀回5位均已有今日挑戰、漏發0、當時active5；詳見result.json。未列LINE識別或個人姓名。
- 參與者、讀經／澆水進度、手札及其他日期挑戰的前後摘要雜湊完全一致；沒有改動這些資料。

## Database

今日無資料庫結構異動。僅新增上列5筆測試挑戰；沒有schema、migration、RLS、function、trigger及Edge Function變更，沒有操作教會OS主專案 `aqanuwilmvdtlzuqlrau` 或課輔資料庫。

## 驗證與限制

已執行實際SQL盤點、寫入與獨立讀回，結果通過。可關閉重開原LINE入口取得挑戰。沒有使用真實使用者LINE憑證驗證前台；沒有寄送LINE、App或Email通知。這是測試資料派發，不宣稱發送推播。

SQL存於dispatch.sql，不包含secret或LINE識別；僅供稽核，不自動重跑。若需回復，必須先確認ID60–64是否已被同工處理並取得資料刪除同意，再限定這些ID和日期，不做全表清除或回復舊快照覆蓋新進度。Build、Lint、Typecheck未執行，本資料操作不需要應用程式build；音樂修正驗證另記。
