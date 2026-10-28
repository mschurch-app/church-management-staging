# 讀經樹玩家列表

入口：教會 OS「行政 → 活動與其他 → 讀經樹玩家列表」。功能收納盒分類為「活動」，可搜尋玩家／遊戲帳號／公測。依使用者最新指示，主要入口移出教會靈修區；靈修頁仍有相關管理導覽。

管理頁顯示暱稱、角色、選填性別／年齡區間／縣市／教會、雲端等級與已讀日數、加入及最近登入時間、公測與已提交回饋資格。25 人分頁，搜尋暱稱／教會，篩選近期登入、公測、回饋、尚未選角。無雲端存檔顯示「尚未同步存檔」，不冒充零進度。未登入試玩不建立帳號。近 7 天統計採 Auth 最近登入，不宣稱即時在線。

## 資料與權限

- 僅在遊戲專案 loscejilzfdwhmogkuwf 部署 SQL；不連接或遷移教會 OS 的會友資料。新函式為唯讀查詢，不改變玩家存檔、獎勵或審核狀態。
- Edge 身分來自教會 OS aqanuwilmvdtlzuqlrau，逐次呼叫 OS Auth 及當前權限 RPC；必須具有 M+ members、tree_reading_admin 檢視權與已驗證工作／LINE 身分。客戶端 role、個人 metadata、遊戲 JWT 均不能代替管理授權。
- verify_jwt=false 是跨專案 JWT 的必要配置：遊戲 gateway 不能驗證 OS JWT，handler 先向 OS Auth 驗證，再用伺服器金鑰呼叫受限 RPC。金鑰只讀自 Edge 環境，不放在前端。
- public 包裝函式 SECURITY INVOKER；private helper SECURITY DEFINER、空 search_path，兩者均撤銷 PUBLIC/anon/authenticated 執行權，只授權 service_role。
- 不回傳電子郵件、OAuth metadata、權杖、完整存檔、手札、回饋原文或截圖。列表使用 textContent 建立，無玩家 HTML 插入。資料不寫入 localStorage、不快取，登出／換帳號清空並忽略晚到回應。
- 公測紀念服資格與已提交回饋分開顯示；雙倍經驗 72 小時僅限回饋帳號，正式開放後首次登入起算。讀取列表不啟動計時或領獎。

## 驗證

- 16 項 handler／資料呈現／權限／入口測試通過。
- 共用 metadata 20 項、Service Worker 回歸通過；修改 JS 語法檢查通過。
- 遊戲資料庫 16 項交易驗證通過：30 個合成帳號測分頁與排序、篩選、缺少角色、完整一天經文摘要、手札不外洩、公測與回饋資格、唯讀不啟動獎勵；包含實際切換 service_role 呼叫的執行權與 schema lookup 驗證，全部 rollback。
- 正式 Edge 已驗證無權杖／無效權杖／錯誤 Origin 拒絕讀取。
- 安全 advisor 與變更前相同，無新增警告。私有表無 policy 為既有 server-only 設計；既有 Auth 密碼外洩防護提醒未在此唯讀功能修改：https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- 瀏覽器存取限制仍存在，未做 iPhone／Mac 真機或登入後畫面驗收，不宣稱 99% 或完整視覺通過。

## 發布

PR #282 已合併，GitHub Pages run 40620672332 的 build/deploy 均 success。正式 HTML 與活動入口已核對 HTTP 200 及新版本。最後實際角色驗證補上 service_role 對私有 schema 的 USAGE（20261028022624），一般玩家及 anon 仍無 RPC 執行權。
