# 生命樹聲音

本目錄六個 WAV 均由本專案 `scripts/generate_life_tree_audio.py` 產生，採數學振盪器合成原創簡短旋律與音效，沒有使用第三方錄音、下載音樂或付費服務。可執行該腳本重建完全相同檔案。

- `reading.wav`：16秒輕柔循環背景旋律。
- `open.wav`：啟用／經文開啟提示。
- `celebration.wav`：澆水成功慶祝。
- `water.wav`、`wind.wav`：照顧小樹與挑戰提示。
- `journal.wav`：拾光收藏成功提示。

格式：22,050Hz、單聲道、16-bit PCM；共約857KiB。背景峰值0.38、音效峰值0.55，留有混音餘裕。播放器只在聲音已啟用且頁面可見時播放；靜音偏好保留於原有 `lifeTreeSound`。沒有外部音訊請求或追蹤。
