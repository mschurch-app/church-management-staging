# LINE 記住帳號確認登入

## 問題與調整

主畫面 App 與一般瀏覽器的預設登入原本送出 `prompt=login`，LINE 即使仍有有效 SSO 狀態也會要求重新驗證。現在移除此強制參數，保留 `disable_auto_login=true`；有有效 LINE SSO 狀態時，由 LINE 顯示帳號確認登入畫面，沒有時依 LINE 畫面驗證。

主按鈕改為「使用 LINE 登入」，說明改為記住帳號時確認登入、首次使用或狀態過期依 LINE 畫面驗證。保留選用的 LINE App 自動登入及同工申請入口。使用者提供的 Business ID 截圖是登入介面參考，沒有將 Business ID 管理平台改接成教會身分提供者，也沒有在教會網站製作假的 LINE 帳號確認頁。

原先的同頁回跳、一次性 state 雜湊、原 storage 核對、伺服器身分驗證、取消、過期及跨帳號拒絕全部保留。更新共用模組引用與 Service Worker shell 版號為 `20261022-line-sso1`；無資料庫 DDL 或權限調整。

## 驗證

- Chromium / WebKit 登入及 PWA 安全回歸 82 項通過，包含兩種瀏覽環境都不強制重新驗證，以及取消、錯 state、過期、其他 storage、錯帳號與一次性回呼。
- 同工申請／審核瀏覽器檢查 45 項通過，全部使用合成資料，封鎖外部請求。
- Worker 22 項通過。
- 正式 Supabase `/auth/v1/authorize` 唯讀轉址檢查：302 至 `access.line.me`，`disable_auto_login=true` 正確轉交且沒有 `prompt`。停止於轉址，不跟隨、不輸入憑證、不登入或寫入同工資料。僅將不含 OAuth URL、state、cookie 的摘要保留本機。
- WebKit 手機版登入頁截圖已檢視；JavaScript 語法、引用資源存在與 diff 檢查通過。

## 限制與實機待驗收

LINE 控制官方畫面；是否顯示記住的帳號取決於目前瀏覽環境有沒有有效 LINE SSO cookie。不能保證首次使用、隱私瀏覽、過期或不同瀏覽環境免輸帳密；不能推定 Safari / Business ID 的已登入狀態一定與主畫面 App 共用。

待使用者 iPhone 主畫面 App 與 Mac Safari 實測：有 LINE SSO 狀態時顯示帳號確認；沒有時能完成官方驗證並回原入口。隔離 WebKit 測試與參數轉交檢查不等同實機成功登入，也沒有據此宣稱 LINE App 自動喚回或整站 99% 驗收完成。

本次 13 檔為第五批 48 檔之後的獨立更新，尚待公開上傳與網站發布授權。

## 官方依據

[LINE Login 網頁整合文件](https://developers.line.biz/en/docs/line-login/integrate-line-login/)：`prompt=login` 強制驗證；`disable_auto_login=true` 在 SSO 可用時顯示 SSO，否則顯示帳密登入。既有 Supabase SDK 與提供者設定未更換。
