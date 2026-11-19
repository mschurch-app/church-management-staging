# 迎新表單欄位儲存修復

正式 church_customizations.feature_modules 有 inventory，但舊 LEGACY_FEATURE_FILES 未列入。原 saveChurchCustomizations 對整份功能設定重新驗證，僅修改迎新欄位也在送出前報「功能設定含有重複或未知項目」。已用含inventory的資料隔離重現。

功能合法性同時參照既有FUNCTION_CATALOG。迎新欄位及選項儲存時不再傳送feature_modules，避免更動其他功能的呈現設定與原有metadata；依堂會與版本條件儲存。仍拒絕未知功能與跨堂會，衝突保留草稿。

驗證：單元測試覆蓋inventory相容、欄位儲存不含功能、metadata保留、版本/堂會/未知key檢查；真實設定頁Chrome/WebKit的393和1440px四組修改欄位、調序、儲存、重新載入與衝突保留通過；Worker27通過。合成資料測試，未覆寫任何正式表單設定值。

回退本PR的四個前端檔案即可，資料庫無變更。正式既有設定與會友資料都保留。
