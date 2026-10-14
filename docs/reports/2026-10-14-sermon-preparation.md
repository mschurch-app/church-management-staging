# 信息預備系統第一版

M＋同工頁面新增「信息預備」入口，沿用共用圖示、配色、導覽、週報編輯權與 LINE 綁定。每篇草稿按帳號隔離，保存建立新版本，生成結果先顯示預覽，人工採用才更新草稿。搜尋素材、大綱、分段講章及逐頁投影片內容由 Mini 的本機模型處理。

## 影片下載政策（2026-10-14 最新修正）

台北時間 00:00–08:00 開始的新影片不額外限速；08:00–15:00 開始的新影片限為實測平均下載速度的一半；15:00–24:00 開始的新影片限為平均速度的三分之一。均速使用當日 07:30–08:00 的有效下載 bytes／有效秒數，加權計算，沒有可用基準時等待下一個台北 00:00，不猜測網速。

每支影片開始下載時，把選定時間、時區、時段、均速與 `rate_bytes_per_second` 寫入私人 `download-policy.json`；`null` 表示當時選定不限速。該支影片跨 08:00、15:00、00:00 均不改速、不重啟；中斷後續傳讀回相同上限。下一支影片才按其開始時段選速。下載完成回條及 archive manifest 也保存同一份政策。

原 06:00 切速／12:00 強制停止規則已解除。工作 RPC 不再限制影片領取時段。本機轉錄及 NAS 區域網路備份不屬於 WAN 傳輸，不套用這三段限速；主動停止、網路錯誤與 SSD 空間安全停止會保留部分檔案及逐段檢查點。LAN 備份原有服務設定未因此更動。

OS 單支影片入口保留最長兩小時、最高 720p、上限 1 GiB 的原限制。Air 的既有講道歸檔流程只下載轉錄所需音軌，保留四小時的原來源限制及五分鐘轉錄檢查點。沒有導入瀏覽器 cookie 或繞過服務驗證。

## Air 清單接續

`archive_lane.py` 接入同一個 Mini worker 的空閒工作路線，沒有另開轉錄服務。單一 `transcriber.lock` 同時保護 OS 影片工作與原 `transcribe.py`；每個單集另有狀態鎖，避免入庫讀到未完成輸出。

Air 的候選清單位於 `~/mplus-air-relay/incoming-air/candidates.json`。依既有 11 位講員輪替、每輪每人最多一支，先核對已登錄官方／受邀頻道及單集標題明確講員；共有頻道、描述提及、同集多位講員或未登錄頻道保留待查。新影片以 yt-dlp 實際 metadata 再核對，開始下載時再檢查來源，`video_id` 及既有 manifest／NAS 原始來源共同去重。已知與已保留的工作 ID 原子更新至 `~/mplus-air-relay/known-video-ids.json`。

運作狀態與後續單集存於加密 SSD `mplus-private/sermon-workspace/library-archive`。原 rotation-state.json 已保留備份，並連結到這份唯一狀態；原音軌及檢查點不刪除。完成逐字稿經原 NAS `import-file` 路徑匯入，仍為 `extracted_needs_review`；來源講員與逐字稿校對狀態不自動提升。

NAS intake 使用既有 library.lock、負載與備份容量安全閥；遇備份／寫入者忙碌時保留 SSD spool。每份逐字稿、manifest、SRT 與匯入回條另封為私人 JSON bundle，透過既有串流接收器回存兩台 NAS，SHA-256／bytes 一致才回報 bundle 備份完成。這與整庫快照分別記錄，不把 Air 接收數當入庫數，也不因 bundle 成功宣稱新的完整快照完成。

QNAP 原網頁收集器維持停止，frontier 保留；Air 的文字接收器繼續每批最多三頁，其他服務及推播規則未改動。

## 資料與執行權限

- `sermon_preparation` 私有 schema 的四個表全開 RLS，撤銷 anon/authenticated 直接權限。只允許 service_role 呼叫兩個受限 RPC；使用者 Edge Function 驗 JWT、LINE 及 M＋編輯權，RPC 再核對 owner。
- Mini 使用工作專用隨機憑證。資料庫只存 SHA-256，SSD 憑證檔 0600、私人目錄 0700。工作 endpoint 拒絕瀏覽器 Origin；一般同工不取得工作憑證或 Supabase 管理金鑰。
- launchd 登入背景服務 `com.mplus.sermon-preparation-worker` 不依賴網站登入。兩條工作路線：搜尋與 NAS 備份；GPU 生成與影片轉錄。單一鎖避免同時開兩個 worker。
- NAS 透過既有 SSH key／固定 host key 接通，使用 james 帳號私有資料夾，沒有新增 NAS 使用者或改動全域管理權。SQLite 素材庫只讀，新增草稿與影片另存，不直接寫入既有 catalog。
- 版本以 compare-and-swap 保存，舊版本不可覆寫；QNAP／Synology 回條均有 SHA-256 與 bytes。NAS 備份失敗仍保留 OS 版本，可另行重送。
- 舊有暫停的主日轉錄與素材收集保持其既有狀態。

## 驗證證據

- Node 契約測試 10 項、共享 catalog 18 項；Python 生成／NAS 測試 9 項、時段／媒體測試 7 項、Air 歸檔測試 4 項通過。
- 正式資料庫 rollback 驗證：帳號隔離、不可匿名直接操作、版本衝突、工作 lease、缺少均速時延後至下一個台北 00:00、延後不耗重試次數。
- 實際背景服務完成 NAS 搜尋 24 筆、大綱、本機生成正文 6,253 字及 12 頁投影片內容。測試草稿明確標示「系統驗收」，不自動發布。
- QNAP 與 Synology 草稿版本 1 備份皆 1,135 bytes，SHA-256 `00c33f5ce22adf10cccbac583936977ba1d1bba3c0e952ee66d4c55024bfc295`。第二版本也取得一致回條。
- Whisper large-v3-turbo 實際辨識公開合成語音；191-byte 逐字稿測試檔回存兩台 NAS，SHA-256 `581171f7e1f2c0a8ffc7c92b75039c40b597e5d726bdea1ef021b0731b9fe5ef`。
- 未帶登入的使用者 endpoint 401；錯誤機器憑證 401；機器 endpoint 帶瀏覽器 Origin 403。
- Chrome 隔離素材流程驗收：編輯保存、建立版本、影片排隊，390／1280 CSS px 無水平溢出，操作控制皆至少 44 px。Safari 隔離頁面正常載入。正式 Safari 已沿用既有帳號成功讀取私人草稿、Mini 狀態、兩台 NAS 回條，並實際採用 12 頁草稿建立版本 3。
- 安全 advisor 本模組只有四個「RLS enabled, no policy」INFO：刻意阻擋直接存取，透過 service-only RPC 與 owner 檢查。[Supabase 說明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。既有其他模組的 advisories 不屬於本次變更。

未宣稱真實 iPhone 17／LINE 內開或 99% 驗收。Air 交接後已完成新影片 kBFIU-Q9gkM 的下載、分段轉錄、實際入庫與兩 NAS 單集 bundle 備份。其開始時間為台北 07:54:14，選定不限速；新影片 fWKI6Jigtj4 於 08:03:11 選定 half，上限 1,936,187 bytes/s、實測基準 3,872,375.7374561313 bytes/s。開始時段、選定 cap 與維護重啟後沿用均有 metadata 讀回；不把設定上限當成保證的實際線路吞吐量。投影片交付可編輯逐頁內容與 JSON，Canva 製作仍屬後續階段。

## 維護

原始碼位於 `scripts/sermon-preparation/`。既有憑證已安全佈建後，可執行 `python3 scripts/sermon-preparation/install_worker.py --restart` 更新工作程式及 launchd 設定；須確認 SSD 已掛載、既有 SSH 正常，以及工作最後回報時間／實際任務結果。

機器程式不讀瀏覽器登入資料。macOS 的可移除磁碟存取只需既有 Python 執行程序能存取 SSD；沒有開放全磁碟存取或放寬系統安全功能。一般同工透過教會 OS 既有帳號查看自己的信息，背景排程不要求有人保持網頁登入。

正式網站發布：PR #118，GitHub Pages build `38477024751` 成功，合併版本 `60789816b5c50d36ea7ddfa2c3c848334d7508ce`；實際 HTTP 200 且頁面、控制器、契約與 catalog 指紋符合原始碼。後續修正保留工作預覽的展開狀態，且非 M＋網址直接拒絕，避免堂會標示混用。

最新部署驗證：機器 RPC 已取消小時領取門檻；缺少均速延至 00:00，處理中斷則保留 lease 恢復動線。00:00／08:00／15:00 邊界、新影片選速、既有影片跨段及重啟沿用 cap、加權均速、無基準不啟動下載、主動停止保留檢查點等 7 項測試通過。Air 標題／來源、已知 ID 合併、備份忙碌保留 spool 與輪替等 4 項測試通過。
