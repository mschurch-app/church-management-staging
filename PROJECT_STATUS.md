# Project Status

Last reviewed: 2026-10-10

## 生命樹風雨可見性與操作列（2026-10-10）

依使用者回饋，十月個人生命樹新增待照顧數量、清楚提示及直接前往照顧入口，四種挑戰以SVG背景呈現。只計今天及之前尚未處理的挑戰，多項逐項更新，全部完成才還原底圖。使用者已確認聲音與靈修入口並排放在樹圖頂端；一月靈修試閱固定可進入，保留日期說明及澆水完成提示。沒有資料庫異動。驗證及發布狀態見 `docs/reports/2026-10-10-life-tree-challenges/report.md` 及本日紀錄；Mac Safari、iPhone／LINE實機仍待驗收。

## 生命樹聲音修復（2026-10-10）

使用者回報仍無音樂與音效，確認舊版只驗證AudioContext狀態不足以證明音訊輸出，且音樂增益過低、音效播放拒絕被忽略。已改原生媒體播放器及本站原創WAV，首次可信任點擊啟用兩種聲音，提供「試聽音效」、逾時及失敗重試、背景暫停。35項Chromium隔離回歸通過。只改十月箴言前端與驗證，沒有資料庫異動。發布狀態見當日紀錄及 `docs/reports/2026-10-10-life-tree-audio/report.md`；iPhone／LINE實際可聽見及Mac Safari仍待驗收。

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
