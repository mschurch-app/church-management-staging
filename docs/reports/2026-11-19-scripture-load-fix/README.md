# 每日讀經經文載入修復

正式讀經頁跨站取得經文時，上游 Cloudflare 回傳 HTTP403 / error1010。改為教會OS同站、按卷載入既有繁體和合本經文，不修改讀經生命樹或個人手札資料。

經文取自既有 reading-tree-release-source/public/reading-adventure/assets/scripture/year-2027，66卷；全年365日1195個經文段落的章與節範圍已核對完整。只下載所需卷，不預載整本聖經。

Chrome與WebKit各393/1440px四組，使用實際經文檔展開2026-11-19的哥林多前書8/9/10與箴言22，共102節；筆記重開、完成紀錄、月日循環和私密代禱既有回歸通過；Worker27項通過。實體iPhone音訊未驗，不宣稱已通過。

回退：還原本PR的頁面、載入模組與Worker即可，不刪除手札或代禱。原跨站載入可能仍失敗，宜以前進修復優先。

本機證據：local-operations/member-prayer-devotional-20261119/scripture-source-check.json、entry-results.json、real-scripture-*。
