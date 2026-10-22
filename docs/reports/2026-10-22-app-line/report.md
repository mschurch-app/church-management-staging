# iPhone 主畫面 LINE 登入交接修正

基準：28c341430e8e30e813dbbd501256f62418e1a4ed。此次處理的情境已確認為「主畫面 App 跳到 LINE 登入後，Safari 完成登入，但原 App 維持空白」。先前一般背景返回的測試未覆蓋這段交接，不能用其通過結果宣稱本問題已修復。

## 流程調整

- iOS 真正 standalone 的一般 LINE 登入改用原生 target=_blank 連結，保留原 App 的登入文件。一次性 id／隨機金鑰先寫入 App 的待交接狀態，只以 fragment 傳至獨立的安全登入頁；不使用 window.open／WindowProxy 去準備及操控外部 OAuth 視窗。
- 新增 admin-line-launch.mjs，在獨立登入頁完成 OAuth URL 建立；先移除可見 fragment，再導向 LINE。無交接參數時維持舊啟動頁相容性，過期／格式不符時提供回原 App 重試說明。
- Safari callback 完成既有加密交接後留在「返回教會 OS App」說明，不再自動導向 Safari 工作台。保留清楚標示的 Safari 備用連結；不假稱網頁可以強制切回 iOS 主畫面 App。
- 原 App 在 focus、pageshow、visibility 或手動接續時讀取交接。原有 AES-GCM、服務端 getUser 身分驗證、LINE identity 及綁定帳號一致性核對保留；核對後才 setSession，成功後清除待交接並在原 App 開啟同來源工作台。
- 等候期間清楚顯示狀態、可取消及手動接續。LINE 尚待交接時擋住同時送出 Email，避免兩個登入流程競爭。
- 此原生連結方案限 iOS standalone 的一般登入；既有帳號 link 流程與其他瀏覽器沿用原路徑及帳號核對，保留相容性。

## 驗證

- tests/installed-line-handoff.mjs：Chrome 與 WebKit 26.5 共 36 項通過，使用不同 BrowserContext 隔離 App／Safari 儲存，並跑實際登入、啟動與回傳模組。確認無 opener 也能交接，App 原頁保持可見，Safari 不自動假裝回 App，手動接續有效，取消／過期／帳號不符不寫入 App session，普通瀏覽器登入仍有效。重開 App 可接續待交接狀態；HTTP 200 缺少完成回條不會誤稱成功。所有 OAuth 與 API 都是合成攔截，沒有真實 LINE 登入。
- 既有 handoff 安全回歸 11 項通過（含加密、錯誤金鑰、不同帳號、取消中的身分核對、重開及彈窗阻擋）。
- 既有 Email／綁定 12 項通過，另通過 Worker、app-catalog、JavaScript 語法與 diff 檢查。
- 已檢視 WebKit 的 App 等候與 Safari 完成畫面；截圖為本機合成資料。正式 handoff 服務契約與狀態僅唯讀核對，未改資料庫、Auth/RLS、Edge Function 或通知規則。

測試使用桌面 Chrome 與真正 WebKit 引擎，但不是實際 iPhone 主畫面容器。完整的主畫面 App → LINE → Safari → 手動回原 App，仍需手機驗收；不能宣稱白屏已完全消失，也不宣稱完整 quality-gate／整體 99% 通過。先前已記錄的既有週報遮擋與 definitions 問題不在本批。

## 發布範圍

只包含登入前端、啟動模組、版本引用、Worker 靜態資源清單及合成測試／報告。先前試作的 iOS push-only／停用快取對照已在使用者補充登入情境後撤回，未發布。沒有清除登入、修改奉獻／會友資料、發 LINE 或恢復智慧體排程。沒有將正式 log、查詢結果、session 或金鑰放進提交。
