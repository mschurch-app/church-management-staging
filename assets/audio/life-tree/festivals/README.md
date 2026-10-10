# 生命樹節慶音樂

八首原創、可循環的短曲，由 `scripts/generate_life_tree_festival_audio.py` 確定性產生；沒有外部錄音或第三方曲目。每首16秒、22,050Hz、單聲道16bit PCM，峰值0.35，檔案約689KiB。

| 曲目 | 情境 |
| --- | --- |
| spring.wav | 春節，明亮五聲音階 |
| easter.wav | 復活節，緩緩上升的晨光 |
| pentecost.wav | 聖靈降臨，流動的短句 |
| dragon.wav | 端午，划槳節奏 |
| moon.wav | 中秋，安靜的夜間旋律 |
| light.wav | 光明勇士，輕快冒險 |
| thanksgiving.wav | 感恩，溫暖餐桌 |
| christmas.wav | 聖誕，清亮鐘聲音色 |

預覽使用一個原生Audio循環播放器及一個既有短音效播放器；按需載入當前曲目，初始不預抓八首曲目。音量、靜音、背景暫停與6秒失敗重試由預覽控制器處理。瀏覽器播放限制依實際平台為準。
