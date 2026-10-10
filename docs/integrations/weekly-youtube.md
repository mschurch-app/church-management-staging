# 主日週報與 YouTube 直播同步

## 使用方式

M+ 主日週報編輯新增 YouTube 區塊。新週報預設啟用；舊資料維持原設定，避免歷史週報突然覆蓋直播。

1. 填寫日期、主題、經文、講員，並儲存橫式預告圖。
2. 預覽 YouTube 標題、說明與標籤。第一次或場次不明確時，選擇待播場次並儲存。
3. 送審，審核人可看到相同內容與橫式預告圖。
4. 核准後背景更新 YouTube；不會因為儲存草稿或送審就更新。
5. 編輯人可查看結果；核准人可指定場次、重試已核准的同一份資訊。

影片縮圖直接使用官網橫式預告圖，沒有另外生成圖片或呼叫 AI。說明包含主日資訊、經文、講員、公開官網／週報連結與 Hashtags；Tags 另以影片欄位送出，不宣稱保證搜尋排名。

## 串流設定與場次

YouTube 的 `liveStream` 可重複使用，`liveBroadcast`／影片 ID 為各場次。系統保存已確認的串流 ID，每次找出該串流尚未開始的待播場次，不將影片 ID 永久視為每週入口。

- 只能更新授權頻道、`created`／`ready` 且尚未開始的直播。
- 有排定日期時，須與週報的台北日期相同；立即開播、未排日期的入口可使用。
- 自動找不到或找到多個場次時停止，要求指定，不選第一筆猜測。
- 同一個影片 ID 已用於另一週週報時停止，避免預先核准下週而覆蓋本週。
- 過去日期的週報不能更新目前入口；不建立場次、不啟停直播、不調整串流金鑰及隱私設定。

## 權限與恢復

沿用 `youtube-oauth` 的加密 refresh token、頻道與 Google 授權。新增動作 `weekly_live_info`、`weekly_status`、`weekly_sync`；讀取限週報編輯／核准人，同步限核准人。既有字幕與連線管理權限不變。維運可沿用已驗證的 cron secret 處理已核准內容；不接受瀏覽器任意指定未核准的標題。

`weekly_youtube_settings`、`weekly_youtube_publications` 啟用 RLS，僅 service role 存取。後者保存每週來源版本、內容雜湊、處理租期、原影片資訊及文字／圖片各自檢查點。重複請求、逾時或部分成功時可從檢查點恢復。完成前重新確認週報版本及直播狀態，YouTube 資料讀回一致才回報成功。縮圖以成功的上傳回應確認，CDN 顯示可能稍晚。

`weekly-youtube-content.mjs` 由編輯預覽、審核預覽與後端共用，避免預覽和發布的文案不同。`youtube-oauth` 部署包含此檔案及相對路徑，entrypoint 為 `supabase/functions/youtube-oauth/index.ts`。

## 介面與影響範圍

沿用週報管理頁表頭、系統字體、語意配色、分區導覽與表單操作。頁面專用 `weekly-youtube.css` 限定此區塊；按鈕至少 44 CSS px，窄螢幕換列。加入等待訊息、實際結果、查詢與重試。核准狀態鎖住原週報內容，重新指定直播場次只影響這次同步對象。

影響：主日週報編輯、審核預覽、YouTube 連線說明、兩個後端函式及 App 資源版本 `20261010-youtube1`。共用表頭與其他堂會的發布行為沿用原設定。

## 本次實際處理與待驗收

2026-10-10 已依使用者授權，直接使用 10/11 已發布週報，更新其截圖確認的待播入口。YouTube 已接受標題／說明／標籤與橫式預告圖，文字資料讀回一致。未重新送審或再次觸發週報審核通知。

- 已完成：程式語法檢查、資料庫變更、函式部署、本週實際同步及讀回確認。
- 未執行：新增／自動化測試、另建測試直播、實機操作驗收。
- Mac Safari、Chrome、iPhone 17／已安裝 App 的版面、登入與核准後自動流程仍待實機驗收，不宣稱 99% 通過。

## 官方契約

- [Broadcasts 與 Streams](https://developers.google.com/youtube/v3/live/broadcasts-and-streams)
- [列出直播](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/list)
- [更新影片資訊](https://developers.google.com/youtube/v3/docs/videos/update)
- [上傳縮圖](https://developers.google.com/youtube/v3/docs/thumbnails/set)
