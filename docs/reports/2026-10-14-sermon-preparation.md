# 信息預備系統第一版

M＋同工頁面新增「信息預備」入口，沿用共用圖示、配色、導覽、週報編輯權與 LINE 綁定。每篇草稿按帳號隔離，保存建立新版本，生成結果先顯示預覽，人工採用才更新草稿。搜尋素材、大綱、分段講章及逐頁投影片內容由 Mini 的本機模型處理。

## 影片時段

使用者指定台北時間每日 01:00–12:00 執行影片下載及語音轉錄。01:00–06:00 不額外限制下載速度；06:00 起限為當日 05:30–06:00 實測平均下載速度的一半（累計下載 bytes／有效下載秒數）。採單支、單連線片段下載，限制作用於影片傳輸。沒有當日量測值時，下載延至下個 01:00；已下載影片仍可於時段內轉錄。

06:00 會停止原下載程序並以半速重新接續，避免沿用夜間累積的不限速計算預算。12:00 終止下載／轉錄子程序，保留 yt-dlp 部分檔案及每 120 秒轉錄檢查點；資料庫排回下一個 01:00，不消耗失敗重試次數。時段由資料庫領取條件及本機程序監督雙重控制。素材搜尋、草稿編輯、NAS 區域網路備份與講章生成不受這個影片時段限制。

第一版支援公開 YouTube 單支影片，長度上限兩小時、最高 720p、檔案上限 1 GiB。直播、私人登入影片及任意 URL 不接受。沒有導入瀏覽器 cookie 或繞過服務驗證。完整影片與附來源、時間、模型、指紋的逐字稿保留於 SSD，串流回存 QNAP 及 Synology，兩邊指紋一致才回報完成。影片轉錄不自動確定講員；選入講章前須人工確認範圍及內容。

## 資料與執行權限

- `sermon_preparation` 私有 schema 的四個表全開 RLS，撤銷 anon/authenticated 直接權限。只允許 service_role 呼叫兩個受限 RPC；使用者 Edge Function 驗 JWT、LINE 及 M＋編輯權，RPC 再核對 owner。
- Mini 使用工作專用隨機憑證。資料庫只存 SHA-256，SSD 憑證檔 0600、私人目錄 0700。工作 endpoint 拒絕瀏覽器 Origin；一般同工不取得工作憑證或 Supabase 管理金鑰。
- launchd 登入背景服務 `com.mplus.sermon-preparation-worker` 不依賴網站登入。兩條工作路線：搜尋與 NAS 備份；GPU 生成與影片轉錄。單一鎖避免同時開兩個 worker。
- NAS 透過既有 SSH key／固定 host key 接通，使用 james 帳號私有資料夾，沒有新增 NAS 使用者或改動全域管理權。SQLite 素材庫只讀，新增草稿與影片另存，不直接寫入既有 catalog。
- 版本以 compare-and-swap 保存，舊版本不可覆寫；QNAP／Synology 回條均有 SHA-256 與 bytes。NAS 備份失敗仍保留 OS 版本，可另行重送。
- 舊有暫停的主日轉錄與素材收集保持其既有狀態。

## 驗證證據

- Node 契約測試 10 項、共享 catalog 18 項；Python 生成／NAS 測試 9 項、時段／媒體測試 5 項通過。
- 正式資料庫 rollback 驗證：帳號隔離、不可匿名直接操作、版本衝突、工作 lease、影片延後至下一個台北 01:00、延後不耗重試次數。
- 實際背景服務完成 NAS 搜尋 24 筆、大綱、本機生成正文 6,253 字及 12 頁投影片內容。測試草稿明確標示「系統驗收」，不自動發布。
- QNAP 與 Synology 草稿版本 1 備份皆 1,135 bytes，SHA-256 `00c33f5ce22adf10cccbac583936977ba1d1bba3c0e952ee66d4c55024bfc295`。第二版本也取得一致回條。
- Whisper large-v3-turbo 實際辨識公開合成語音；191-byte 逐字稿測試檔回存兩台 NAS，SHA-256 `581171f7e1f2c0a8ffc7c92b75039c40b597e5d726bdea1ef021b0731b9fe5ef`。
- 未帶登入的使用者 endpoint 401；錯誤機器憑證 401；機器 endpoint 帶瀏覽器 Origin 403。
- Chrome 隔離素材流程驗收：編輯保存、建立版本、影片排隊，390／1280 CSS px 無水平溢出，操作控制皆至少 44 px。Safari 隔離頁面正常載入。正式 Safari 已沿用既有帳號成功讀取私人草稿、Mini 狀態、兩台 NAS 回條，並實際採用 12 頁草稿建立版本 3。
- 安全 advisor 本模組只有四個「RLS enabled, no policy」INFO：刻意阻擋直接存取，透過 service-only RPC 與 owner 檢查。[Supabase 說明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。既有其他模組的 advisories 不屬於本次變更。

未宣稱真實 iPhone 17／LINE 內開或 99% 驗收。尚無使用者指定的新影片網址，因此沒有宣稱完成外部影片下載或實際 WAN 半速量測；時段切換、均速公式、程序停止及續跑由可控時鐘驗證。投影片交付可編輯逐頁內容與 JSON，Canva 製作仍屬後續階段。

## 維護

原始碼位於 `scripts/sermon-preparation/`。既有憑證已安全佈建後，可執行 `python3 scripts/sermon-preparation/install_worker.py --restart` 更新工作程式及 launchd 設定；須確認 SSD 已掛載、既有 SSH 正常，以及工作最後回報時間／實際任務結果。

機器程式不讀瀏覽器登入資料。macOS 的可移除磁碟存取只需既有 Python 執行程序能存取 SSD；沒有開放全磁碟存取或放寬系統安全功能。一般同工透過教會 OS 既有帳號查看自己的信息，背景排程不要求有人保持網頁登入。

正式網站發布：PR #118，GitHub Pages build `38477024751` 成功，合併版本 `60789816b5c50d36ea7ddfa2c3c848334d7508ce`；實際 HTTP 200 且頁面、控制器、契約與 catalog 指紋符合原始碼。後續修正保留工作預覽的展開狀態，且非 M＋網址直接拒絕，避免堂會標示混用。
