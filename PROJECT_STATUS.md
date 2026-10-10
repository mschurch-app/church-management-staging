# Project Status

## 八套生命樹節慶預覽與整月聖誕裝飾（2026-10-10）

依核准企劃完成八套獨立互動預覽、56天候選經文默想、八首原創短曲及七種勇士裝備。12月1～31日小樹保留燈串、19顆燈泡、彩球、蝴蝶結、樹頂星星與禮物；12/20～26才加入馬槽與天使。手機主要操作位於樹圖下方，桌面雙欄；設定與工具的內容與發布新增生命樹節慶預覽入口，沿用M+生命樹管理權限。此輪為企劃第一個交付：可試玩場景；2027正式活動、收藏入庫、審核設定及自動切換接入仍待後續實作與內容核准。正式讀經／手札無異動。已發布預覽：PR #64合併main `4872fe4`，15:35:32（台北）27項正式資源皆200且符合來源SHA-256，線上六項視覺／互動檢查通過。47項節慶與15組共用回歸各自最新結果通過。驗收與發布證據見 `docs/reports/2026-10-10-life-tree-festivals/`；Mac Safari與iPhone／LINE實機待驗收。


Last reviewed: 2026-10-10

## 四天挑戰輪替準備（2026-10-10）

使用者要求每人連續四天體驗四種挑戰。現有5人今日各1筆、其中1筆已完成；已請選擇今天是否算第1天，尚未新增挑戰。唯讀預演可保留今日紀錄並新增未來15筆，每人4種類。修復未來挑戰提前影響共同花園／管理統計及可提前完成的問題；後端23項、瀏覽器契約8項通過，完整82項回歸通過。PR #62已合併main，專用函式v8 ACTIVE、source符合Git、部署source23項全過及無token HTTP401。使用者選擇仍待完成，未新增挑戰；詳見 `docs/reports/2026-10-10-life-tree-four-day-challenges/report.md`。

## 本人手札與補讀日期對應（2026-10-10）

修正手札及浮動靈修關閉偏好使用不存在的participant.id，改依實際API的本人line_subject驗證及隔離草稿。補讀操作跟隨選讀日期，10/9期間不混入10/6，完成後才以「另有」提醒其他待澆水日。新8項瀏覽器契約與17項後端測試全通過，執行原handler並隔離外部系統；完整82項回歸也全通過。PR #60已合併main，13:59:03正式15項資源均HTTP 200且來源SHA-256一致。沒有資料庫或Edge Function變更。詳見 `docs/reports/2026-10-10-life-tree-journal-contract/report.md`；Mac Safari及iPhone／LINE仍待實機驗收。

## 十月補讀後端修復（2026-10-10）

查得實際October Edge Function版本6漏定義shiftDate，非當日mark_read及water_tree會拋錯並回503，前端誤以通用連線訊息呈現。新增UTC日曆位移函式，保留原LINE驗證、本人範圍、加入日期、七天期限和重複提交語意。直接執行production handler的15項隔離測試，修正前7項失敗、修正後全通過；補列後端測試為必跑，避免只驗證模擬API成功回應。既有82項瀏覽器回歸亦全通過。PR #58已合併main，專用函式v7已部署ACTIVE；13:34:37讀回source符合Git且15項重跑全過，無憑證HTTP請求回401。詳見 `docs/reports/2026-10-10-life-tree-makeup-backend/report.md`。本項無資料庫結構或SQL資料修改；實際使用者10/9存檔仍需本人重試確認，Mac Safari與iPhone／LINE待實機驗收。

## 生命樹庭園整合（2026-10-10）

使用者已確認將新版庭園直接接入系統。原十月 LIFF 入口改用繪本庭園與手機先樹後任務／Mac雙欄布局；新增五階段成長提示、真實守護星光與手札數、小樹打招呼、澆水及四類照顧動畫。成長仍依原讀經紀錄與12倍試行節奏計算，沒有導入預覽的模擬進度、好友、星光、手札或重設功能。登入、API、日期、七天補讀、單一靈修手札與音樂策略沿用原流程。澆水及照顧須由回應中的對應紀錄確認成功，缺少紀錄時提供重新整理確認。

已發布：最終82項Chromium隔離回歸通過，PR #56合併main為 `91600b04c05a04d3add240af9eabed393ddca715`，13:19:08（台北）原入口及相關15項資源皆HTTP 200且SHA-256符合Git來源；實際結果以當日紀錄與 `docs/reports/2026-10-10-life-tree-garden-live/report.md` 為準。2027正式入口未更動；無資料庫結構或資料操作，Mac Safari與iPhone／LINE實機尚待驗收。獨立 `life-tree-garden-preview.html` 保留為無登入／無資料服務的互動樣本。

## 生命樹定位與圖文使用說明（2026-10-10）

已發布：77項隔離檢查通過，PR #54合併main，12:26:31（台北）正式8項資源讀回皆符合Git來源；發布證據及結果另以文件分支同步。

修正10/6等「已讀完，繼續澆水」只看見按鈕、看不到樹的定位：完整樹圖及圖外澆水鈕組成同一區塊，依視窗高度調整圖幅；今日與補讀共用返回動線並保留日期。使用說明改為三幅自製SVG步驟與四種照顧道具圖，音效預設勾選不變，402px圖說不落單換行。手札集中每日靈修內，經原LIFF endpoint內的專屬視圖開啟，維持本人權限與實際今天日期，不增加試閱進度。依使用者一度要求清除5則測試手札，後改決定時已commit、未找到可復原副本，使用者接受停止追查；43筆讀經／澆水完全不變。沒有資料庫結構異動。驗證／Git／部署結果見 `docs/reports/2026-10-10-life-tree-visible-water-guide/report.md`。LINE原生Full須在各LIFF設定儲存，使用者截圖為正式入口，不是十月測試入口；目前無管理連線，未代改LINE遠端設定。Mac Safari與iPhone／LINE實機待驗收。

## 補讀儲存與繼續澆水（2026-10-10）

已重現補讀完成後「正在記錄讀經…」文字殘留：原版只有今日按鈕會恢復，補讀日期又從選單移除。修正為依實際記錄統一顯示等待／重試／前往澆水／回生命樹，既有記錄再次點擊只導航；補讀期間暫收今日靈修浮窗。原API與資料庫不變。最終65項隔離檢查通過，PR #52已合併，11:50:11（台北）正式HTML與JS符合來源。Mac Safari及iPhone／LINE實機待驗收。驗證及正式發布狀態見 `docs/reports/2026-10-10-life-tree-makeup-save/report.md`；不據截圖推定本人寫入結果。

## 生命樹重開音樂與全員挑戰測試（2026-10-10）

十月試讀已上線重開／背景返回的音樂恢復嘗試；若瀏覽器阻擋，第一次輕觸一般頁面即可啟動，不需特地找喇叭。靜音選擇保留，首次同意仍不能繞過新LINE視窗的播放政策。60項隔離回歸通過，PR #50已合併，11:34:34（台北）正式兩項資源HTTP 200且符合來源。Mac Safari及iPhone／LINE實際出聲待驗收。Git／發布結果見 `docs/reports/2026-10-10-life-tree-audio-return/report.md`。另依使用者授權，在十月專用專案新增5筆今日挑戰，5位各一種、四類均涵蓋；schema與讀經進度不變，詳見challenge-dispatch報告。

## 生命樹趣味照顧與補讀（2026-10-10）

依同工回饋，十月試行頁新增穩定三入口、待補／照顧數量、樹邊情境道具及加強的風雨底圖，搭配風雨／照顧配樂。補讀縮成四欄（四天＋三天與日期下拉），顯示日期／章節、最近七天期限及已讀未澆水的繼續入口；維持今日澆水後浮動靈修、小喇叭與首次音效勾選。道具僅在有挑戰時圍繞樹邊，取代先前一律不放圖上控制的規格，不恢復永久大按鈕。PR #48已合併發布，56項隔離回歸通過，11:04:46（台北）正式七項資源HTTP 200且SHA-256符合來源。沒有資料庫異動；GitHub與驗證狀態以 `docs/reports/2026-10-10-life-tree-playful-care/report.md` 及當日紀錄為準。正式2027頁面與實機驗收尚待後續。

## 生命樹首次說明與清爽樹圖（2026-10-10）

依最新回饋，移除遮住樹圖的大型聲音／靈修按鈕及試聽按鈕，聲音改為標題旁44px小喇叭；每日靈修僅在今日澆水成功後浮動提示。首次開啟十月同工測試顯示完整使用說明，音樂與音效預設勾選，由使用者按開始啟用，可取消勾選，記住同瀏覽器選擇；後續開頁仍需可信任操作恢復播放，不能以勾選記錄繞過瀏覽器限制。設定與讀經資料分開，不新增資料庫資料。使用者已檢視說明文字，並要求音效預設勾選。PR #46已合併並由Pages發布，10:20:08（台北）正式HTML／JS／CSS讀回與Git來源SHA-256一致，47項隔離回歸通過。測試及發布狀態見 `docs/reports/2026-10-10-life-tree-clear-artwork/report.md` 與當日紀錄。

## 生命樹風雨可見性（2026-10-10）

十月個人生命樹已新增待照顧數量、清楚提示及直接前往照顧入口，四種挑戰以SVG背景呈現。只計今天及之前尚未處理的挑戰，多項逐項更新，全部完成才還原底圖。原樹頂兩個大按鈕由上節最新需求取代，風雨提示及成長計算保留。沒有資料庫異動。原發布證據見 `docs/reports/2026-10-10-life-tree-challenges/report.md`；Mac Safari、iPhone／LINE實機仍待驗收。

## 生命樹聲音修復（2026-10-10）

已改原生媒體播放器及本站原創WAV，首次可信任點擊啟用兩種聲音，提供逾時及失敗重試、背景暫停。原試聽按鈕由最新需求移除，改小喇叭重試。此前35項Chromium隔離回歸通過，沒有資料庫異動。原發布證據見 `docs/reports/2026-10-10-life-tree-audio/report.md`；iPhone／LINE實際可聽見及Mac Safari仍待驗收。

## Current state

Church OS is an active production system at `mscos.mchurch.online`. Heat Camp admin PR #18 has been merged. Its additive RPC migration is applied to Supabase project `aqanuwilmvdtlzuqlrau`, and `heat-camp-admin` is deployed at version 2. No registration or payment records were changed. GitHub Pages contains the merged source; direct CDN/page verification was not available in this session.


A cross-page button stability audit was completed on 2026-10-07. Shared mobile focus/scroll interception, indefinite user-action requests, incorrect disabled-state restoration, and blank pending states were corrected without changing production data.

## Main capabilities

- Church administration, member and group management, attendance, schedules, pastoral care, and room reservations.
- App notifications, feature access controls, and configurable dashboard shortcuts.
- App notification-center items can be queued for background delivery to registered devices; a one-minute backend worker records delivery attempts and non-secret failure states.
- A centralized review workflow settings page lists sermon social, daily devotional, and ministry-specific service change reviews. Administrators can select initial/final reviewers and App/LINE channels; LINE cannot be enabled unless both selected accounts have a verified LINE identity.
- SHiNE administrators can sign in with Email/password without mandatory LINE linking. M+ management access continues to require LINE identity verification.
- LINE administrator access notifications now open a dedicated owner review card where the LINE identity can be matched to an existing administrator and inherit the reviewed access profile.
- The public M+ Sunday service signup URL automatically starts LINE login when opened without a member session, then returns to the signup page.
- M+ Sunday service signup requires the member's typed name, supports selecting several service roles and several Sundays per role, excludes dates already used by another selected role, and submits the complete selection atomically. Repeated positions are presented as one public preference (such as 接待、歌手、鍵盤); the database assigns an available numbered position and only uses waitlist after the combined capacity is full.
- Service leaders can preview an intention-based smart match, deselect individual suggestions, and then copy selected volunteers into the official schedule. Existing official assignments are preserved and conflicting suggestions are skipped.
- Volunteers can delete and reselect service preferences before a season starts. Once the season starts, cancellation or adjustment becomes a two-stage request: the responsible ministry leader coordinates and reviews first, then Yuting gives final approval.
- Website and media publishing tools.
- A separate 2027 Heat Basketball Camp registration and payment flow in Supabase, including NewebPay and receipt synchronization preparation.

## In progress

- 2027 每日靈修生命樹 MVP 已上線：一月31篇及二月28篇已匯入（共59篇，待初審）；會員每日頁面與完成紀錄已部署，沿用鈺庭初審、師母複審、牧師終審。經文版本、來源與授權仍須補齊才能核准發布。二月匯入及管理月份切換詳見 `docs/reports/2026-10-10-devotional-february/report.md`。
- Church OS Heat Camp admin: mobile registration cards, full details, permission-gated edits, immutable payment/banking information, payment status/method in details and receipts, and printable receipt draft. PR #18 is merged; the RPC migration is applied and Edge Function version 2 is active.
- Additional stability and mobile usability fixes are tracked through recent repository history and `docs/codex-log/`.

## Known issues

- The camp data exists in a private Supabase schema. Use an account with the explicit `heat_camp` grant; decrypting or editing identity and health fields additionally requires owner or `can_manage` permission.
- PDF export uses the browser print dialog; the user selects “Save as PDF”.
- No repository-level package scripts or automated CI workflow were found during this inventory.
- Authenticated browser smoke tests remain necessary because the repository has no automated end-to-end coverage for its 45 button-bearing pages.

## Technical debt

- No single root operations guide or deployment runbook existed before this task.
- Static frontend deployment and Supabase deployment are separate operations and need explicit release coordination.
- Camp registration, payment, and receipts currently have independent workflows; broader camp management actions are not included in this admin list.
- Receipt template still needs the official association name and seal artwork before it can serve as a finalized official receipt.

## Next steps

1. Review the imported January and February devotional content; confirm scripture version/source/license before final approval.
2. Complete the fixed three-stage devotional review and verify month selection on iPhone and Mac; migrations and backend were already deployed, so do not reapply them as a next step.
3. Receive the official association name and seal files, then finalize the camp receipt layout.
4. Continue documenting releases and verification in `docs/codex-log/`.
5. Add a small authenticated smoke-test suite for high-risk save, approval, publishing, and permission flows.

## Important risks

- The registration database contains minors’ personal, insurance, and health information. New interfaces and exports must continue to exclude unnecessary sensitive fields.
- Database permission changes can expose production data if applied incorrectly. Keep migrations additive, review them before applying, and do not use service-role credentials in the browser.
- Payment status is driven by verified NewebPay callbacks; administrative reporting must not independently mark payments as paid.

## 2026-10-10 生命樹同工試行更新

十月箴言測試頁完成音樂狀態、進度更新、等待／重試、防重複送出、首屏讀經入口、多人花園與觸控尺寸修正，澆水後串接既有一月靈修試閱及固定返回。24項隔離Chromium回歸通過，GitHub PR #36 已合併發布（`19f50a1`），正式網站七項資源HTTP 200且符合來源；詳細發布狀態以當日 `docs/codex-log/2026-10-10.md` 為準；詳見 `docs/reports/2026-10-10-life-tree/report.md`。

沒有資料庫或權限異動；十月測試與正式2027靈修紀錄維持隔離。Mac Safari未啟用遠端自動化，iPhone 17／LINE實機仍待驗收；不宣稱整體99%已完成。

同日依使用者回饋調整靈修入口位置：常駐卡片移至今日讀經入口下方、生命樹圖上方；今日澆水成功後在目前畫面提供可關閉的底部浮動邀請，上方入口可見或正在輸入時收起，避免重複及遮擋。仍連到一月創世記試閱，沒有變更資料或發布權限。最新驗證及發布紀錄見 `docs/reports/2026-10-10-devotional-dock/report.md`。

## 2026-10-10 節慶套入同工測試

原十月箴言生命樹入口接上九套節慶背景與配樂，自10/10元旦煙火開始，按年度順序每兩天一套，10/26–27聖誕、10/28恢復原庭園。真實成長、讀經與澆水日期、風雨道具、靈修邀請及單一手札沿用既有服務；不導入預覽假進度或新獎勵寫入。詳見 `docs/reports/2026-10-10-life-tree-seasonal-test/report.md`。正式2027活動自動啟用仍未包含本次，Mac Safari與iPhone／LINE實機待驗收。

節慶測試已發布：PR #66，main `4bde02e`。台北16:44:38正式33項資源均200且符合來源SHA-256；線上頁面五項操作確認通過（身分／API隔離、零真實資料寫入）。原LIFF入口保留，10/10～11元旦煙火，九套各兩天至10/27、10/28回原庭園。證據見docs/reports/2026-10-10-life-tree-seasonal-test/；Mac Safari與iPhone／LINE實機仍待驗收。
