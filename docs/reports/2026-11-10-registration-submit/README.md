# LINE 會友登記送出 503 修復（2026-11-10）

## 問題與原因

台灣10:44–10:46的5次 newcomer-register POST均為503，耗時約0.4–0.7秒；查詢時該時段起的新朋友／綁定／人工審核收據皆為0。正式Edge版本仍為36。

用正式後端實際使用的service_role執行合成M+登記，重現 `42501: permission denied for table member_bindings`。新RPC採SECURITY INVOKER，而該角色對member_bindings和binding_requests只有SELECT，缺少新增綁定、更新申請及row-lock所需的DML。先前以管理角色執行的交易驗證未覆蓋此差異。

## 修正

新增 `20261110034406_line_member_service_write_privileges.sql`，僅對可信後端service_role授予實際使用的欄位級權限：

- member_bindings：INSERT堂會、channel、LINE subject、會員id、active、approved_at、binding_source；UPDATE active用於row lock。
- binding_requests：INSERT申請識別、堂會、channel、LINE subject、姓名、電話、status、member_id；UPDATE status、member_id、申請姓名及電話。

不新增SECURITY DEFINER，不授予anon/authenticated寫入，不授予DELETE、approved_by寫入、既有subject或堂會更新，也不授予會友任何同工權限。前端與Edge程式不需變更；舊畫面可以繼續以同一request_id重試。

## 驗證

- PGlite依正式環境重建service_role原始權限，先重現失敗，再套用grant驗證修復。
- 共11項本機測試通過，其中4項覆蓋服務角色建檔、既有會友核對後綁定、人工審核與禁止越權；其餘7項為既有登記交易、隔離、重試、撤銷及回退回歸。
- 正式資料庫以service_role逐條驗證M+新朋友建檔／綁定／同筆重試、既有會友核對／綁定、待審不開通及核准轉態補齊欄位。每個測試以強制exception回退子交易後回傳診斷，因此沒有永久合成會友、任務或通知。
- 修復前正式服務角色診斷為42501，修復後三條路徑均為PASS。
- 正式權限查詢確認anon/authenticated寫入皆false；service不能刪除綁定、偽造approved_by或更新原subject；RPC仍為invoker。
- 真實使用者的同筆重試結果仍待操作回覆，不把合成交易視為已替使用者送出。

## 回退與保護

本次僅新增後端角色欄位級grant。若需要回退，先停用自助寫入流程並核對現有授權，再撤銷本次同一組欄位grant；不得刪除會友、綁定或收據，不重設登入，不清除session，不覆蓋原工作區。回退grant會使自助綁定再次無法送出，既有讀取及同工SECURITY DEFINER審核仍沿用原有路徑。

原始未提交程式及先前修補工作區均保留。請使用者在原畫面按一次「重試同一筆登記」；若核對憑證已逾時，依頁面提示重新核對，勿以重新載入清除目前資料。
