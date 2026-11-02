# 讀經樹管理總覽：最小匿名摘要

集中顯示註冊帳號、已有雲端旅程、近七天Auth登入、公測參與及提交回饋帳號數。沿用原OS管理Edge的當次身份、members與tree_reading_admin檢視權限；未授予任何新角色。摘要RPC只返回五個聚合與伺服器時間，不傳回玩家列、UUID、手札、聊天或其他個人欄位。

新增一個私有STABLE純查詢及一個public invoker包裝，僅service_role可呼叫；私有函式受控definer用於跨玩家聚合，search_path空白。沒有新增表、玩家修改、獎勵或旗標。原list保持25筆既有契約，overview不接受actor、filter或任意RPC。前端只允許摘要schema，失敗清空數字，180秒後提示重新確認，無自動輪詢。

25項Node、27項Worker、21項目錄、20項定義通過。正式原子操作核對ACL／STABLE／schema／五個非負子集合／原Party來源守衛；正式缺Bearer401、錯Origin403與原list401皆通過。實際OS帳號正向端到端仍交原測試員，不把SQL通過當真人通過。近七天登入不是在線人數、DAU或次日／七日留存；不做此推論。

回復方式：先改回原UI／Edge v1或讓摘要顯示未取得；兩個只讀函式可以保留，必要時先撤回service角色execute再移除public包裝與私有讀取。沒有玩家資料需要回滾，不覆蓋新旅程、獎勵或裝備。
