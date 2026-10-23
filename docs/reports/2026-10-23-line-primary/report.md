# LINE 只保留主要訊息

## 使用者需求

主日服事表只發主要圖卡，不再附第二則「可長按圖片儲存或直接轉傳」文字。群組沒有文字討論時不發空日報，課輔主要報告保留。

## 修改

- M+ 與火樂主日服事表一次推送僅含一個 image 物件；圖片、日期、服事內容、收件對象及既有發送去重保留。
- 修正火樂關閉 LINE 僅發 App 時，回應誤讀尚未建立的 messages 變數，回報圖卡數為 0。
- 無文字、只有非文字訊息或空白文字時：不呼叫 AI、不發 App／LINE，只記錄 no_messages，sent_at 為 null。
- 有內容的群組摘要維持既有流程；保留已部署版本的夜間 queued 狀態及對應 sent_at 行為。
- 課輔每日報告目前本來就是單則，未修改、未停用。
- 未變更排程、收件者、LINE 憑證或權限；未恢復 Codex heartbeat 或新增雲端模型／備援。

## 驗證

`node tests/line-primary-message.test.mjs`：112 項通過。隔離測試包含兩教會的單張圖卡、群組／個人收件對象、已發送略過、LINE 關閉、空內容略過、寫入失敗、有內容及夜間排隊。測試全部攔截外部網路，沒有實際發 LINE 或呼叫模型。

部署以正式函式既有 bundle 為基準，只替換本次入口檔，保留各函式已部署的共用依賴，避免覆蓋現行夜間排隊機制。發布後比對入口內容及共用依賴。

## 用量說明

LINE 官方按同次推送的收件人數計算發送量，同一 request 內的 message objects 數目不增加計數。因此移除圖卡後的文字是減少聊天泡泡；停止空內容的獨立推送才會減少該次收件人次。

來源：https://developers.line.biz/en/docs/messaging-api/sending-messages/#how-to-count-the-number-of-messages
