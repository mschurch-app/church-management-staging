# 2027 熱火籃球營 LINE Pay 串接準備

目前正式報名頁只啟用藍新信用卡、ATM 虛擬帳號與超商條碼。LINE Pay 尚未啟用；不能只在頁面加選項，必須完成伺服器付款請求、LINE 驗證返回後的授權確認、訂單核對、取消／失敗恢復及收據同步。

## 已確認

- LINE Pay 合作商店中心的「管理付款伺服器 IP」畫面顯示既有 `119.31.188.101/32`。官方現行前置說明將伺服器 IP 白名單列在 **Offline API v2／v2.4**，Online API v4 的前置條件是通路 ID、密鑰與 HMAC 請求標頭；因此不應把 Supabase Edge Function 的暫時出口 IP 填入白名單，也不應刪除既有項目。正式可用性仍須由 Online API v4 沙盒與正式測試確認。Supabase Edge Function 沒有固定出口 IP；若 LINE Pay 對此商店另設 IP 限制，須改用固定出口代理，不能用目前取得的一次性 IP。
- 商店名稱：社團法人台灣基督教社會關懷協會；統一編號：26887974；LINE Pay 商店 ID：`tcsc`；通路 ID：`1654237984`。
- 使用 LINE Pay Online API v4。通路密鑰只存 Supabase Edge Function Secrets；不得出現在前端、Git、聊天或測試紀錄。
- API 用 HMAC-SHA256 簽章，交易 ID 以字串保存，避免 JavaScript 19 位整數失真。傳輸模組及本機無密鑰單元測試位於 `supabase/functions/heat-camp-registration/line-pay-api.mjs` 與同目錄測試檔。

## 尚待完成的上線閘門（2026-10-19 23:30 後狀態）

1. 隔離沙盒交易的 request、授權、confirm、付款明細與商店後台 TWD 100 已核對成功；它沒有建立營隊報名。正式報名 RPC 已以完整回滾測試核對建立、續付網址、金額防護、冪等入帳、晚到取消及收據佇列。下一步仍須在隔離環境驗證**真實 LINE 回跳與正式報名訂單**的整合，以及確認成功時是否由既有收據同步程序實際處理；不能把隔離沙盒交易或回滾測試當成真實營隊付款。
2. 前端 LINE Pay 選項已提交到 GitHub 並由後端旗標隱藏；正式 Edge Function v41 的 `LINE_PAY_RELEASE_READY=false`。2026-10-19 23:48 從公開網址讀回新版 HTML、JS 模組與付款續查程式（均 HTTP 200），但 LINE Pay 選項仍不可見。完整外部付款驗證完成前維持關閉，不能聲稱報名頁已可使用 LINE Pay。
3. 依使用者指示，上線前最後再做一筆**正式環境小額實付**，核對正式 LINE Pay 交易、本站紀錄與金額，並處理測試交易的退款／帳務標示；不使用真實營隊名額或正式營隊收據。這筆實付尚未執行。

## 2026-10-19 本機進度

- 依官方 Online API v4 規格，在傳輸模組補上以可信訂單金額建立 TWD 單一商品付款請求、簽章查詢認證狀態，以及確認回應的訂單、交易 ID、付款總額核對；六項無密鑰單元測試通過。
- 現有報名頁和正式 Edge Function 仍只提供藍新信用卡、ATM、超商條碼。未部署 LINE Pay，未進行真實或沙盒扣款。
- 對帳必須擴充 `camp_registration.payment_orders.provider` 的限制，使用獨立供應商訂單狀態與冪等確認流程；不能直接沿用只接受 `newebpay` 的付款紀錄 RPC。
- 再次執行六項無密鑰測試，全部通過。現行 `heat_camp_2027_prepare_checkout` 建立訂單時未指定供應商，預設藍新；`heat_camp_2027_record_payment` 也以藍新的交易欄位判定入帳。這兩處及訂單供應商限制須先擴充，不能只加前端付款按鈕。
- 使用者目前不須修改 LINE Pay「管理付款伺服器 IP」頁面，保留既有白名單。下一步由系統端完成獨立 LINE Pay 訂單、request／confirm／取消與失敗恢復，再做沙盒實際回跳驗證；尚未對外開放收款。
- 沙盒認證查詢的第一次 `GET /v4/payments?orderId=...` 回傳 `1106`；改用官方 `GET /v4/payments/requests/{transactionId}/check`、以不存在的測試交易 ID 查詢後得到預期的 `1159`。因此沙盒基本認證已驗證，但帶查詢參數的簽章／參數格式仍待付款流程實作時核對，不能把這次查詢等同完整付款驗證。
- 隨後以同一商家憑證呼叫 `POST /v4/payments/request`，使用無個資的沙盒測試訂單 `HB27TMVFA52F8CED991BA19`、TWD 100，取得 HTTP 200／`returnCode=0000`、沙盒付款網址與交易 ID。沒有開啟網址、執行 confirm 或扣款；測試請求會在 LINE Pay 沙盒到期。一次性探針再部署為 HTTP 410。這證實 Online API 沙盒可建立付款請求，但尚未驗證用戶授權回跳、確認、資料庫入帳及取消／重試。
- 21:30 後完成**待驗證串接草稿**：新增同一報名僅容一筆有效訂單的 LINE Pay 供應商遷移與 service-role RPC；付款請求後保存交易 ID、以 LINE 查詢狀態決定確認／取消、核對金額後才標記已付並排入正式收據同步。報名頁加入由後端旗標控制的 LINE Pay 選項；旗標未啟用時選項保持隱藏。七項無密鑰單元測試及前端語法檢查通過。資料庫遷移已套用 Supabase 正式專案，唯讀讀回確認 `provider` 可為 `line_pay`、五個 RPC 存在、LINE Pay 訂單數為零。正式 Edge Function 已部署 v38 並讀回兩份原始碼與本機一致，`LINE_PAY_RELEASE_READY=false` 強制關閉，舊藍新付款方式保持可用；本機網路無法解析 Supabase 主機，因此沒有 HTTP 煙霧測試證據。**前端尚未部署，未做真人沙盒授權回跳，不能對外開放 LINE Pay 付款。**
- 22:08 左右依使用者要求開始完整沙盒驗收：隔離的 `heat-camp-line-pay-sandbox-probe` v6 建立一筆無個資、與報名資料分離的 TWD 100 測試請求；LINE 回覆 HTTP 200、`returnCode=0000`，訂單 `HB27TMVFBXO762A5C2529`、交易 `2026101902389313910`，取得 `sandbox-web-pay.line.me` 付款頁。隨即部署 v7，關閉新增請求路由並將回跳限定為這筆交易。以 Supabase `pg_net` 唯讀核對 LINE 狀態 `0000`（尚待使用者授權）；新增請求路由回 HTTP 404。**這仍未完成授權、confirm 或營隊報名入帳；不得算成功交易。**付款網址僅在本對話交給使用者，密鑰與網址未寫入報告。回跳完成後再查 LINE 狀態與沙盒商店交易紀錄，並在驗收後將探針恢復 HTTP 410。
- 22:30 使用者手機顯示沙盒付款失敗。隨後透過沙盒已簽章狀態查詢確認原交易回 `0121`，官方定義為使用者取消或認證等待逾時；原付款連結於 22:08 建立，截圖時已相隔約 22 分鐘。Supabase 22:15–22:40 Edge Function 紀錄無該筆確認回跳，因此不能歸因於確認函式，也不能標成已付款。為避免預先建立的連結過期，隔離探針 v9 提供持有短期測試連結者在手機上按鈕即時建立新沙盒交易，採官方無回跳模式 `redirectUrls.confirmUrlType=NONE`，完成授權後由簽章狀態連結查詢並核對 NT$100、訂單與交易 ID 才呼叫 confirm。測試連結權杖放在 URL fragment，不進伺服器網址紀錄；探針 10/20 23:59 後自動停用。v8 曾因把 `confirmUrlType` 放在 `options.redirectUrls` 收到沙盒 `2101`，已依官方範例改正；v9 已以真沙盒請求驗證回 HTTP 200、付款網址與狀態網址均存在，狀態頁回「等待 LINE Pay 授權」。錯誤權杖回 404。七項無密鑰測試仍通過；**真人手機授權及 confirm 尚未完成**，正式 `heat-camp-registration` v38 仍 `LINE_PAY_RELEASE_READY=false`，營隊 LINE Pay 訂單數 0。此流程只供沙盒驗收，正式報名頁未開放。
- 22:48 使用者手機看到 HTML 原始碼與亂碼。`pg_net` 唯讀查核確認 Supabase Edge 公開回應被強制設為 `content-type: text/plain`、`x-content-type-options: nosniff`、`content-security-policy: default-src 'none'; sandbox`，所以不能直接把可互動 HTML 由該 Edge Function 送給瀏覽器。已把無密鑰測試頁放在既有教會網站 `https://mchurch.online/line-pay-sandbox.html`（GitHub Pages commit `d0e4979389e410b4f79f8663f7c9e21a83ae6520`），Edge Function v11 僅提供測試 API，CORS 限定教會網站。實際瀏覽器驗證頁面正常渲染、按鈕可建立全新 TWD 100 沙盒交易，未授權時狀態回「仍在等待 LINE Pay 授權」。本次瀏覽器煙霧測試沒有按下 LINE Pay 授權，沒有執行 confirm；正式付款旗標繼續關閉。測試連結憑證未寫入 Git 或此報告。
- 22:58 使用者手機進入 LINE App 後顯示「無法處理您的申請」。Edge 紀錄確認手機於 14:58:33Z、14:59:09Z 各建立一筆新沙盒請求（HTTP 200）；未見相應狀態查詢或確認，不能算付款成功。LINE Pay 官方 FAQ 明確指出沙盒不支援 App 環境付款網址，只能用 `info.paymentUrl.web` 測試。電腦瀏覽器開啟一筆新請求的 `paymentUrl.web`，實際到達 `sandbox-web-pay.line.me/web/payment/waitPreLogin`，正常顯示模擬付款登入畫面及「LOGIN」按鈕；未輸入使用者帳密或完成付款。網站測試頁已更新電腦版登入指引（commit `0cd8aa6bebe76be43226dc38e4f9801a32c9da03`）。正式營隊 LINE Pay 仍關閉，需電腦沙盒授權／confirm 完整驗證後再進下一步。
- 23:04 使用者表示已走到付款完成。Edge 紀錄定位 Safari 新測試訂單 `HB27TMVFDYDCV4DCFA67D`、交易 `2026102002389324510`。原頁尚未呼叫狀態查詢，因此只對這筆已知沙盒交易短暫部署 token 保護的查核入口 v12，取得簽章狀態連結後呼叫原有 `mode=status`：LINE 回報可確認，後端執行 confirm、核對 TWD 100／訂單／交易 ID，回應 `{ok:true,phase:"confirmed"}`；再次查詢仍為 `confirmed`，無重複 confirm。臨時查核入口已移除，恢復 v13。唯讀查核正式 `heat-camp-registration` 仍有 `LINE_PAY_RELEASE_READY=false`，`camp_registration.payment_orders` 的 `line_pay` 筆數為零。**隔離沙盒付款驗收成功；正式營隊報名付款尚未開放。**
- 23:10 使用者把商店後台搜尋區間改成涵蓋 10/19 後，顯示這筆交易 **1 筆核准、TWD 100**，交易號碼與上述伺服器紀錄一致，後台交易時間為台北 **2026-10-19 23:07:54**。LINE 付款明細 API 唯讀查核亦回傳 `transactionType=PAYMENT`、同一訂單／交易 ID、TWD 100、`transactionDate=2026-10-19T15:07:54Z`。這換算日本時間是 10/20 00:07:54，與交易號碼以 `20261020` 開頭相符；**搜尋欄預設到 10/20 的時區原因仍是推論**，不宣稱 LINE 官方已確認。查核時發現帶 query 的 GET HMAC 簽章包含了 `?`，實際回 `1106`；依官方簽章格式改為 `apiPath + queryString`（無 `?`）後，付款明細查詢成功。八項無密鑰單元測試通過，臨時明細入口已移除（隔離探針 v16），正式函式 v39 僅同步修正查詢簽章，`LINE_PAY_RELEASE_READY=false` 仍保持，正式營隊 LINE Pay 尚未開放。
- 上線前最後一道驗收依使用者 10/19 指示：在隔離測試入口以正式 LINE Pay 商店做**一筆小額真實付款**，核對正式商店交易紀錄、付款明細 API、本站狀態與金額；再測取消／重複返回／錯誤恢復，並確認營隊報名入帳與收據流程。LINE Pay 台灣官方 FAQ 說最低交易金額是 **NT$1**，但 API 仍有商店設定最低額不足的 `1183` 回應；實際測試金額以正式請求獲准者為準。小額測試不得以真實營隊報名占用名額、寄出營隊收據或誤計營收，須標為測試並視需要退款。正式報名頁 LINE Pay 在這些證據齊備前保持隱藏。官方最低金額來源：<https://pay.line.me/portal/tw/customer/faq?categoryId=cashFlow&page=1>；API 回應碼：<https://developers-pay.line.me/online-api-v4>。
- 使用者要求先完成付款後頁面、返回及資料入庫，再把小額正式實付留到最後。Edge Function v41 已部署：LINE 回跳會以簽章查詢 LINE 狀態，符合條件才 confirm；核對訂單、交易 ID、TWD 金額後，以 service-role RPC 原子標記報名與訂單已付並排入正式收據佇列。取消、逾時與查證不明不會顯示付款成功；前端能以原 request ID 查詢、回到同一筆 LINE 付款網址，並在確認成功後顯示報名成功頁。即使關閉新訂單選項，已開出的訂單仍可核對收尾。12 項無密鑰測試通過，含 confirm 回應逾時及付款已成功但本站寫入失敗後的補記。
- 新增 `supabase/tests/heat_camp_line_pay_rollback_verification.sql` 並在正式 Supabase 專案執行：通過原報名 claim、儲存同筆付款網址、拒絕金額不符、只入帳一次、晚到取消不覆蓋已付款、正式收據佇列僅一筆；測試插入資料全數回滾，報名前後數量均為 1。公開設定 HTTP 煙霧測試回 200：正式藍新信用卡、ATM、條碼仍為 true，LINE Pay 為 false。網站修改已分別提交 GitHub `9e544414`、`4da30394`、`4caaba83`，保留遠端既有教會關係欄位；公開頁讀回仍是舊版，Pages build 排隊中，不能聲稱網站更新已生效。
- Edge Function 線上 `registration_status` 對不存在 request ID 回 404 `registration_not_found`，未誤回可付款；無效 LINE 回跳返回本站 `payment=unknown`，沒有宣稱成功。這些只是無實付煙霧測試，不能取代真人付款回跳測試。
- 23:48 GitHub Pages 最新工作尚未顯示完成，但從公開網址唯讀取得新版 `heat-camp-2027.html`（22,349 字元；包含新版模組版本和隱藏的 LINE Pay 選項）、新版入口模組（63 字元）與 `heat-camp-checkout.mjs`（27,656 字元；包含續付與教會關係欄位），三者均 HTTP 200。後端原始碼、兩個單元測試、三份資料庫遷移、回滾驗證測試和本報告也已同步到 `mschurch-app/church-management-staging`；Edge Function 正式部署仍為 v41。

官方規格：<https://developers-pay.line.me/online-api-v4>、<https://developers-pay.line.me/online/prerequisites>、<https://developers-pay.line.me/offline/prerequisites>、<https://developers-pay.line.me/online/implement-basic-payment>。Supabase 出站 IP 限制：<https://supabase.com/docs/guides/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting-3d78b0>。密鑰操作：<https://supabase.com/docs/guides/functions/secrets>。
