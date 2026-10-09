# 生命樹音樂與音效修復

## 問題與範圍

使用者回報 LINE 中兩種聲音都沒有。查得背景振盪器峰值0.16再乘主音量0.055，只有0.0088；音效在 API 返回後才呼叫 AudioContext.resume，並忽略拒絕結果。這些是程式可確認的問題，尚無實機證據能判定使用者裝置當時的唯一原因。前一次回歸只有檢查 AudioContext 的 running，無法確認訊號或實際發聲。

本次只修改十月箴言頁聲音與回饋。保留讀經、澆水、靈修邀請及返回；沒有存取或修改任何資料庫。

## 修復

使用原生音樂與音效播放器，六個本機原創 PCM 音訊由版本管理的腳本產生。首次可信任點擊在等待網路前對兩個播放器呼叫 play；後續成功音效沿用同一個已啟用播放器，避免重新建立未授權的播放器。新增試聽按鈕、明確的全聲音開關、6秒啟動逾時、單獨音效失敗提示及可重試流程。背景／離頁停止兩種聲音，回來後等使用者點擊再啟動。關閉聲音保留既有偏好。

採用原生播放器與點擊解鎖依據：[WebKit 播放手勢說明](https://webkit.org/blog/6784/new-video-policies-for-ios/)、[WebKit 對同一媒體元素後續播放的說明](https://bugs.webkit.org/show_bug.cgi?id=134925#c2)。這些文件不能代替目前 iPhone LINE 的實機驗收。

HTML、模組、頁面專屬樣式版本為 `20261010-audio1`。新增音訊合計約857KiB，關閉聲音時不建立媒體元素或載入音訊，資源由本站提供。

## 驗證

Chromium 使用虛構 LINE／API／經文，封鎖其餘外部請求。檢查媒體播放時間前進、未被 muted、兩個 play 都源於首次手勢、六檔實際解碼與 RMS／峰值、啟動失敗及逾時、音效單獨失敗／重試、背景停止、成功儲存後音效、失敗不播放成功音效，並回歸原本讀經、浮動入口、返回、花園、補讀、手札及320–1920px版面。

最終35項全部通過，結果與截圖見同目錄 `results.json`、`mobile-initial.png`、`desktop-1440.png`。JavaScript／Python語法、git diff及新增文字secret掃描通過。Build、Lint、Typecheck未執行（靜態專案無根目錄相應指令）。Mac Safari遠端自動化未啟用；iPhone 17／LINE喇叭、耳機、藍牙、音量及靜音狀態尚未實機驗收，不宣稱可聽見或99%達標。

## 發布與回復

`codex/life-tree-audio-recovery` 的 `ef29fcb` 已push，PR #42 合併main為 `dc90a3d23c382800cc325f122bc178a5c4eeb6d4`；GitHub Pages依既有流程發布。2026-10-10 01:24:57（台北）讀回HTML、模組、樣式與六個音訊，共九項HTTP 200且SHA-256逐檔符合來源，見 `hosted-check.json`。第一次01:24:06讀到舊版與新增音訊404，屬發布尚未生效，證據保留於 `hosted-check-initial.json`，未將首次檢查當作通過。

如需回復，以revert本次程式PR恢復上一版本，不改寫已共享history。沒有migration、schema、RLS、function、trigger或資料異動，無資料庫回復需求。
