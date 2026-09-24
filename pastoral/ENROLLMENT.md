# M+ 教會同工 LINE 身分登記

受邀同工開啟 `https://mscos.mchurch.online/pastoral/`，填入個人一次性代碼後選擇 LINE 登入。Edge Function 會在 LINE 伺服器驗證 ID token，並以 SHA-256 雜湊查核代碼。代碼只保存雜湊，七天後過期，且僅能使用一次。

成功登記只會把驗證過的 LINE subject 和邀請目標名稱寫入 `pastoral_identity_enrollments`。它不會建立 `pastoral_staff` 或 `pastoral_staff_access`，因此不會開放講章、會友或探訪資料。管理者確認身分和角色後，才可另行加入教會同工授權；完成收件後應撤銷未使用代碼。

吳俊璋牧師的邀請綁定到教會名冊內已核實的 LINE subject。其餘個人邀請碼應只交給對應本人；碼遺失或外洩時須先撤銷該邀請並另發新碼。不要把邀請碼放入公開群組或 repository。
