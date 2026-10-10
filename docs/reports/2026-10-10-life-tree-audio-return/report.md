# 生命樹：再次進入恢復音樂

## 原因與修正

使用者已在首次說明同意音效，重開仍要找喇叭。原版會保留偏好，但初始化不嘗試播放，僅監聽click／keydown，背景返回也不嘗試恢復。

- 保留首次說明、預設勾選與原localStorage鍵；只有已完成說明且同意的人會在重開時嘗試播放。
- 初始化、pageshow及頁面重新可見時嘗試恢復同一音樂／音效播放器，沒有增加第三個播放器或外部服務。
- 可信任touchend、click、Enter／空白鍵會同步啟動兩個播放器；一般文字也可觸發，無須找喇叭。事件passive，不攔截捲動或按鍵預設行為。
- 手勢可接手尚未完成的自動播放；舊的成功／失敗結果以version排除，避免逾時後停掉新播放。
- NotAllowedError改成「已記住音效設定，輕觸頁面即可播放」，不誤報載入失敗；真正失敗／逾時仍保留小喇叭重試。
- 保存的靜音選擇不變，背景仍暫停；不恢復遮住樹圖的大按鈕。

範圍限十月同工試讀主模組；HTML主模組版本更新至20261010-audio-return1，既有藝術、CSS、共用圖示及音檔內容不改。API、登入與資料權限不變。

## 驗證

60項隔離Chromium回歸通過，詳見results.json；所有LINE／API／天氣／經文皆假資料，外部請求封鎖，沒有使用正式使用者登入。新項目涵蓋允許自動播放、拒絕時正常點擊恢復、純touchend、不等六秒即可接手、靜音持續及背景恢復，保留讀經、澆水、防連點、挑戰、手札、靈修、補讀、花園、排行與320–1920px布局檢查。

播放政策以隔離wrapper模擬；實際音檔仍由原生媒體解碼並檢查播放時鐘。這不代表真實iPhone／LINE或Safari允許無手勢播放，也不代表實際可聽見聲音。Mac Safari、iPhone 17／LINE實機待驗收，沒有宣稱99%。本輪測試首次即60項通過。JavaScript語法與git diff檢查通過；Build、Lint、Typecheck未執行，未添加安裝套件。

## 平台限制

首次同意是系統偏好，不是Safari永久自動播放許可。參考[WebKit的iOS媒體政策](https://webkit.org/blog/6784/new-video-policies-for-ios/)及[MDN play()與自動播放拒絕](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)。新LINE視窗若仍要求手勢，需輕觸頁面一次，無法保證完全零操作出聲。

## Git／發布

分支codex/life-tree-audio-return，基於main 19e4d49e。程式與文件一起走PR及既有GitHub Pages發布；正式資源讀回於發布後補記，尚未完成前不可宣稱上線。

## Database與回復

本音樂修正今日無資料庫結構異動，亦無資料寫入或Edge Function部署。同日另依使用者授權新增五筆今日挑戰，見相鄰challenge-dispatch報告，不能把本項無異動當成整天無資料操作。

需回復程式時revert本PR，再走正常Pages流程；不回復或刪除同工挑戰／讀經資料。
