# 生命樹節慶音樂

原有十一首可循環的短曲（十首原創及〈生日快樂〉的自製演奏編曲），由 `scripts/generate_life_tree_festival_audio.py` 確定性產生；音訊均由程式合成，沒有使用外部錄音。春節曲為15秒，其餘每首16秒；22,050Hz、單聲道16bit PCM，峰值0.35，檔案約689KiB。

| 曲目 | 情境 |
| --- | --- |
| newyear.wav | 元旦，120 BPM明亮旋律、跳躍和弦、低音與輕鼓點 |
| spring.wav | 春節，128 BPM五聲音階、彈撥旋律、木敲與輕快鼓點 |
| easter.wav | 復活節，緩緩上升的晨光 |
| pentecost.wav | 聖靈降臨，流動的短句 |
| dragon.wav | 端午，划槳節奏 |
| moon.wav | 中秋，安靜的夜間旋律 |
| light.wav | 光明勇士，輕快冒險 |
| thanksgiving.wav | 感恩，溫暖餐桌 |
| christmas.wav | 聖誕，清亮鐘聲音色 |

預覽使用一個原生Audio循環播放器及一個既有短音效播放器；按需載入當前曲目，初始不預抓所有曲目。音量、靜音、背景暫停與6秒失敗重試由預覽控制器處理。瀏覽器播放限制依實際平台為準。

2026-10-10依使用者試聽回饋，元旦改為8小節、120 BPM的歡樂編曲。其餘八首保留原曲供逐首試聽。可用`python3 scripts/generate_life_tree_festival_audio.py --only newyear`只重製元旦，不改其他節慶。

- anniversary：16週年恩典同行；〈生日快樂〉旋律，90 BPM、3/4拍，鋼琴與鐘琴的16秒循環編曲。
- passion：受難週安靜默想；復活主日切回 easter 晨光配樂。

2026-10-11：春節改為8小節、128 BPM的原創歡樂編曲，15秒循環；可用 `python3 scripts/generate_life_tree_festival_audio.py --only spring` 單獨重製。

2026-10-12：依使用者指定，週年慶改為熟悉的〈生日快樂〉旋律；保留四句完整旋律、附點起拍與結尾長音。可用 `python3 scripts/generate_life_tree_festival_audio.py --only anniversary` 單獨重製。讀經入口與節慶預覽各自更新模組及音訊版本；Worker 對腳本採網路優先且不快取音訊，本次不需更動全域 Worker。

2026-10-12：新增使用者提供的〈和撒那｜字幕伴奏版｜敬拜樂園〉原始 MP3，檔名 `hosanna-palm-sunday.mp3`，約 3 分 17 秒、44.1kHz 雙聲道、128kbps。棕樹主日（受難週第一天）專用；前端共用選曲模組供會友花園、十月同工新版、獨立體驗、原版讀經與節慶預覽使用。其餘受難週日子保留原配樂；不修改讀經日期或後端識別。十月測試排程為 2026-10-13。播放尊重音量與靜音設定，離開花園進入戰鬥會切換配樂，返回後繼續播放。
