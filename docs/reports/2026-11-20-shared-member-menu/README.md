# 會友資料登錄：LINE 選單及會友首頁名稱與圖像統一

使用者要求原「家人登錄」改為「會友資料登錄」並更換圖片，同功能在LINE圖文選單及會友首頁的名稱與圖片必須一致。

採內建image_gen編修既有六格水彩選單，僅將左下家人/房屋插畫改為資料夾板、個人輪廓與筆，標題改為「會友資料登錄」，保留其他五格文字、插畫、分隔與點擊區幾何。生成母檔已複製至工作區local-operations/member-menu-unified-20261120/menu-master.png。LINE上傳版line-menu-2500.jpg為2500x1686、約813KiB。

網站資產為assets/member-menu/menu-20261120.jpg，1527x1030。六個共用功能全部透過SVG viewport顯示同一張圖內相應插畫，沒有使用另一套emoji或外站生命樹圖替代；圖片內文字由裁切範圍排除，網站以可存取的HTML標題呈現。首頁八項功能及順序保持不變，樹仍連到原獨立網站。M+迎新資料卡標題與入口同步改名；SHiNE原有名稱/圖像保留。

生成工具：內建image_gen。提示摘要：Edit only bottom-left tile of exact existing six-tile LINE menu; replace family/house portrait with warm watercolor ivory member-profile clipboard, generic silhouette, form lines, fountain pen, olive leaves and daisies; main title exactly「會友資料登錄」; subtitle「會友資料・建檔更新」; preserve other five tiles/text, 3x2 geometry, gutters, palette and texture; no real personal data/red marks/app UI.

隔離Chrome/WebKit393與1440共4例通過：六個同源插畫、八項功能與名稱順序、原讀經樹URL、圖檔載入尺寸、無橫向溢出與JS錯誤。Worker27項通過。沒有正式身分或對外訊息測試。

LINE管理頁本輪已到達登入頁，需要使用者完成登入後才可更新原選單20225087的圖片與D區標籤；不可把網站更新或圖片生成視為LINE已儲存。六個原有動作URL、顯示期間與預設開啟設定應保留，更新後需從管理畫面讀回。

回退網站前端提交並將LINE圖片換回先前daily-menu-line.jpg即可，無資料庫或會友資料變更。此報告的LINE完成狀態以local-operations/member-menu-unified-20261120/後續回執為準。
