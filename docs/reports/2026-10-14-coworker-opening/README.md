# 同工測試：首次選角與配音開場

十月同工新版花園加入 Bible Tree 的原創十六段故事、園丁配音、男／女主角配音與選角流程。開場版本為 `20261014-storyvoice-v1`；每位已驗證的同工只需完成一次，不按日期重播。既有角色預選，完成後回到原花園。手動「重聽開場故事」不改變紀錄。

沿用原 LINE 登入、同工資格及 `avatar` 指令，在原 game state 中增添 `openingStory` 完成版本及時間；不新增帳號、不遷移或重建花園、不修改 SQL schema。故事中的裝備介紹不發放任何裝備或 XP。完成保存須等待伺服器回應；斷線留在最後一句，重試沿用相同 request ID。組隊邀請等到開場完成才提示。

## 驗證

- `node --test tests/life-tree/backend.mjs`：23 項通過，包含 LINE 驗證、未加入成員、日期邊界及寫入失敗。
- `node tests/life-tree/coworker-opening.mjs`：執行實際 October handler 與共用 engine；驗證原 records、notes、battles、裝備、擺設、收藏、庫存、生命、buffs、事件與任務資料保持一致。驗證選角不算故事完成、同一請求重送、未知版本拒絕、每人成員獨立與隔日不重播。
- 本機合成成員瀏覽器實測：既有角色預選 → 16 段配音故事 → 模擬 503 存檔失敗 → 重試保存 → 原花園 40 XP、已穿戴腰帶、擺設及讀經天數保留 → 重新整理不再強制開場 → 可自行重聽／關閉。
- 桌面 1280×720 與手機寬 402×874 版面檢查通過；瀏覽器無 JavaScript 錯誤。尚未於實體 iPhone／LINE 內建瀏覽器／Safari 驗收，不宣稱 99%。
- 舊 contracts／festivals 瀏覽器測試因本 checkout 缺少 puppeteer-core 未執行；本次使用 CUA 瀏覽器實測新增流程。
- 舊 backend fixture 補上 garden import 的隔離處理，原有 handler 測試恢復可執行；新 garden 命令由上述實際 handler 測試驗證。

聲音沿用 Bible Tree 的原創合成配音；來源及模型授權見 `prototypes/reading-tree-game/assets/story-voice/SOURCE.md`。故事插畫沿用同專案既有原創素材。正式會員版不強制此開場。
