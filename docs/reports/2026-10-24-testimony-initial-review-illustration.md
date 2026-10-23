# 雲彩見證：先排版、LINE 初審與示意插圖

## 範圍

依使用者指定的初審、複審同工設定私有審核流程。純文字投稿的本次編排加入一幅教會提供的水彩插圖，插入段落之間；桌面文字繞圖、手機維持閱讀寬度。原文、投稿附件與投稿人的授權紀錄均保留。私有設定與實際投稿不納入儲存庫。

- 新投稿先儲存段落及附件配置，再轉為待審並排入 LINE 通知。
- 初審同工僅能初審；初審完成仍維持私人待審，接著通知指定的兩位複審同工。
- 私有 LINE 工作佇列採鎖定、穩定重試鍵與確認回寫；LINE 接受請求與收件人已讀分別處理。
- 初審與複審預覽沿用官網相同版面。既有已核准見證保留重新公開相容性。
- 插圖使用預先核准的靜態資產清單；資料只存資產鍵與插入位置，不接受任意圖檔 URL。標明「AI 示意插圖」，不作為投稿照片或改寫照片授權。
- 官網的 Facebook、IG、LINE 分享控制僅在公開全文啟用；初審及複審私人預覽沒有對外分享按鈕。

## 驗收

- 53 項隔離資料庫、權限、通知與重試檢查通過。
- 32 項 Edge 驗證檢查、15 項通知工作器檢查及 23 項既有 Service Worker 檢查通過。
- Chrome 與 WebKit 各 390 / 1440 CSS px：108 項合成初審、複審、登入返回、失敗保留及插圖預覽檢查通過。
- 官網共享模組另通過 146 項排版、67 項社群分享及 20 項原文完整性檢查。
- 原生 Mac Safari 已檢視合成插圖全文、三個分享按鈕及 IG 圖卡視窗。
- 真實 iPhone 的 LINE 內開啟、Instagram 分享目標及實際審核由同工操作後驗收，不以模擬器代替。

## 插圖來源

使用內建 imagegen 模式生成；未使用 CLI、API Key 或第三方照片。最終部署資產：`assets/testimonies/quiet-waiting-v1.webp`（960 × 640，136848 bytes）。原始生成 PNG 另保存在本機專案工作區外層，未放入公開版本庫。

完整生成提示：

> Use case: illustration-story. Asset type: a single tasteful editorial illustration inserted into a short Traditional Chinese Christian testimony on a cream-and-deep-green church website. Primary request: convey quiet waiting on God, peace through praise and renewed hope, without depicting a real testimony author or a factual event. Scene: a quiet wooden window seat with an open Bible-like book whose pages have no legible writing, a simple warm ceramic cup, and a slender green olive branch; gentle dawn light enters through the window, with a calm pale landscape and clouds clearing beyond. Style: refined hand-painted watercolor on warm ivory paper, natural pigment granulation, softly feathered edges, restrained sage and deep green, muted warm gold and earthy wood; contemplative, hopeful and serene, sophisticated editorial quality, not clip art. Composition: one coherent landscape illustration, approximately 3:2, a comfortable intimate still life with ample airy breathing room; main details toward the lower center, softly luminous upper area. The image should read well at a small inline width of 300–400 pixels as well as at 900 pixels. Constraints: no people, no faces, no captions or typography, no legible text, no logos, no watermark, no collage, no panel divisions, no decorative frame. Not a literal photograph; clearly watercolor illustration.
