// Shared presentation definitions. Backend grants remain the authority for actions.
function freezeTree(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeTree);Object.freeze(value);}return value;}
export const FUNCTION_CATALOG=freezeTree({
  "review_workflows": {
    "permission": "notification_settings",
    "file": "review-workflow-settings.html",
    "icon": "✅",
    "title": "審核流程",
    "description": "初審、複審與通知設定",
    "key": "review_workflows",
    "group": "system",
    "symbol": "check",
    "configurableHome": false,
    "searchTerms": [
      "初審",
      "複審",
      "審核人"
    ],
    "settingsId": "review-workflows",
    "settingsGroup": "review"
  },
  "members": {
    "permission": "members",
    "file": "members.html",
    "icon": "👥",
    "title": "會友",
    "description": "會友與新朋友資料",
    "key": "members",
    "group": "pastoral",
    "symbol": "people",
    "configurableHome": true,
    "searchTerms": [
      "會友名冊"
    ]
  },
  "newcomer_care": {
    "permission": "newcomer_care",
    "file": "newcomer-care.html",
    "icon": "🌱",
    "title": "新朋友",
    "description": "聯絡、追蹤與後續關懷",
    "key": "newcomer_care",
    "group": "pastoral",
    "symbol": "sprout",
    "configurableHome": true,
    "searchTerms": [
      "新朋友關懷"
    ]
  },
  "pastoral_workspace": {
    "file": "pastoral/workspace.html",
    "icon": "🤝",
    "title": "同工工作區",
    "description": "工作、行程與同工工具",
    "key": "pastoral_workspace",
    "group": "pastoral",
    "symbol": "people",
    "configurableHome": true,
    "searchTerms": [
      "同工協作"
    ]
  },
  "private_prayers": {
    "permission": "private_prayers",
    "file": "prayers.html",
    "icon": "🙏",
    "title": "代禱與關懷",
    "description": "代禱事項與後續關心",
    "key": "private_prayers",
    "group": "pastoral",
    "symbol": "heart",
    "configurableHome": true,
    "searchTerms": [
      "代禱關懷"
    ]
  },
  "pastoral_chats": {
    "permission": "pastoral_chats",
    "file": "pastoral-inbox.html",
    "icon": "💬",
    "title": "關懷訊息",
    "description": "一對一訊息與跟進",
    "key": "pastoral_chats",
    "group": "pastoral",
    "symbol": "chat",
    "configurableHome": true,
    "searchTerms": [
      "牧養訊息"
    ]
  },
  "attendance": {
    "permission": "attendance",
    "file": "attendance.html",
    "icon": "✅",
    "title": "出席登記",
    "description": "聚會出席與統計",
    "key": "attendance",
    "group": "service",
    "symbol": "check",
    "configurableHome": true,
    "searchTerms": [
      "聚會點名"
    ]
  },
  "groups": {
    "permission": "groups",
    "file": "groups.html",
    "icon": "🫶",
    "title": "小組與小家",
    "description": "分組、組長與成員",
    "key": "groups",
    "group": "pastoral",
    "symbol": "people",
    "configurableHome": true,
    "searchTerms": [
      "小組／小家"
    ]
  },
  "schedules": {
    "permission": "schedules",
    "file": "schedules.html",
    "icon": "📅",
    "title": "服事安排",
    "description": "主日與聚會服事",
    "key": "schedules",
    "group": "service",
    "symbol": "calendar",
    "configurableHome": true,
    "searchTerms": [
      "服事排班"
    ]
  },
  "spaces": {
    "permission": "spaces",
    "file": "spaces.html",
    "icon": "📍",
    "title": "場地與設備",
    "description": "空間、設備與預約",
    "key": "spaces",
    "group": "service",
    "symbol": "pin",
    "configurableHome": true,
    "searchTerms": [
      "場地預約"
    ],
    "settingsId": "space-settings",
    "settingsGroup": "church"
  },
  "inventory": {
    "permission": "inventory",
    "file": "inventory.html",
    "icon": "📦",
    "title": "物品與借用",
    "description": "位置、數量與借還",
    "key": "inventory",
    "group": "service",
    "symbol": "box",
    "configurableHome": true,
    "searchTerms": [
      "物品清冊"
    ],
    "settingsId": "inventory-settings",
    "settingsGroup": "church"
  },
  "heat_camp": {
    "church": "M+",
    "permission": "heat_camp",
    "file": "heat-camp-admin.html",
    "icon": "🏀",
    "title": "熱火籃球營",
    "description": "報名、繳費與名單",
    "key": "heat_camp",
    "group": "basketball",
    "symbol": "target",
    "configurableHome": true,
    "searchTerms": []
  },
  "website_weekly": {
    "permission": "website_weekly",
    "file": "website-maintenance.html",
    "icon": "🌐",
    "title": "主日週報",
    "description": "週報、預告圖與服事表",
    "key": "website_weekly",
    "group": "media",
    "symbol": "globe",
    "configurableHome": true,
    "searchTerms": [
      "教會網站維護",
      "官網",
      "網站",
      "預告圖",
      "主日"
    ],
    "settingsId": "website-maintenance",
    "settingsGroup": "content"
  },
  "website_group_resources": {
    "permission": "website_group_resources",
    "file": "group-resources-management.html",
    "icon": "📚",
    "title": "小組教材",
    "description": "每週教材與聚會內容",
    "key": "website_group_resources",
    "group": "media",
    "symbol": "book",
    "configurableHome": true,
    "searchTerms": [
      "小組聚會資源"
    ],
    "settingsId": "group-resources",
    "settingsGroup": "content"
  },
  "tree_reading_admin": {
    "permission": "tree_reading_admin",
    "file": "daily-devotional-admin.html",
    "icon": "🌳",
    "title": "生命樹",
    "description": "每日靈修與讀經進度",
    "key": "tree_reading_admin",
    "group": "media",
    "symbol": "tree",
    "configurableHome": true,
    "searchTerms": [
      "每日靈修生命樹",
      "讀經生命樹",
      "每日靈修",
      "讀經"
    ],
    "settingsId": "daily-devotional",
    "settingsGroup": "content"
  },
  "binding_review": {
    "permission": "binding_review",
    "file": "binding-review.html",
    "icon": "🔗",
    "title": "LINE 身分確認",
    "description": "確認會友與 LINE 帳號",
    "key": "binding_review",
    "group": "system",
    "symbol": "link",
    "configurableHome": true,
    "searchTerms": [
      "LINE 綁定審核"
    ],
    "settingsId": "binding-review",
    "settingsGroup": "people"
  },
  "notification_settings": {
    "permission": "notification_settings",
    "file": "notification-settings.html",
    "icon": "🔔",
    "title": "通知設定",
    "description": "手機與 LINE 通知",
    "key": "notification_settings",
    "group": "system",
    "symbol": "bell",
    "configurableHome": true,
    "searchTerms": [
      "LINE 通知設定",
      "通知管道設定"
    ],
    "settingsId": "notification-settings",
    "settingsGroup": "review"
  },
  "school": {
    "file": "https://school.mchurch.online/",
    "icon": "📚",
    "title": "課輔",
    "description": "學生、出席與輔導",
    "key": "school",
    "group": "school",
    "symbol": "book",
    "configurableHome": true,
    "searchTerms": []
  },
  "school_checkin": {
    "file": "https://school.mchurch.online/?tab=checkin",
    "icon": "📷",
    "title": "課輔打卡",
    "description": "學生與同工打卡",
    "key": "school_checkin",
    "group": "school",
    "symbol": "camera",
    "configurableHome": true,
    "searchTerms": []
  },
  "school_schedules": {
    "file": "https://school.mchurch.online/?tab=schedules",
    "icon": "🗓️",
    "title": "課輔安排",
    "description": "老師與同工安排",
    "key": "school_schedules",
    "group": "school",
    "symbol": "calendar",
    "configurableHome": true,
    "searchTerms": []
  },
  "school_rollcall": {
    "file": "https://school.mchurch.online/?tab=rollcall",
    "icon": "✅",
    "title": "課輔出席",
    "description": "每日課堂出席",
    "key": "school_rollcall",
    "group": "school",
    "symbol": "check",
    "configurableHome": true,
    "searchTerms": []
  },
  "school_students": {
    "file": "https://school.mchurch.online/?tab=students",
    "icon": "🧑‍🎓",
    "title": "學生",
    "description": "學生與同工資料",
    "key": "school_students",
    "group": "school",
    "symbol": "student",
    "configurableHome": true,
    "searchTerms": []
  },
  "school_counseling": {
    "file": "https://school.mchurch.online/?tab=counseling",
    "icon": "💛",
    "title": "個別輔導",
    "description": "輔導紀錄與跟進",
    "key": "school_counseling",
    "group": "school",
    "symbol": "heart",
    "configurableHome": true,
    "searchTerms": []
  },
  "school_reports": {
    "file": "https://school.mchurch.online/?tab=print-center",
    "icon": "🖨️",
    "title": "課輔報表",
    "description": "出席表與學生資料",
    "key": "school_reports",
    "group": "school",
    "symbol": "printer",
    "configurableHome": true,
    "searchTerms": []
  },
  "basketball": {
    "file": "https://mschurch-app.github.io/m-plus-basketball/",
    "icon": "🏀",
    "title": "籃球隊",
    "description": "球員與球隊",
    "key": "basketball",
    "group": "basketball",
    "symbol": "target",
    "configurableHome": true,
    "searchTerms": []
  },
  "basketball_gamecenter": {
    "file": "https://mschurch-app.github.io/m-plus-basketball/?tab=gamecenter",
    "icon": "🏆",
    "title": "比賽紀錄",
    "description": "比賽、得分與犯規",
    "key": "basketball_gamecenter",
    "group": "basketball",
    "symbol": "trophy",
    "configurableHome": true,
    "searchTerms": []
  },
  "basketball_tactics": {
    "file": "https://mschurch-app.github.io/m-plus-basketball/?tab=tactics",
    "icon": "📋",
    "title": "籃球戰術",
    "description": "戰術板與訓練內容",
    "key": "basketball_tactics",
    "group": "basketball",
    "symbol": "clipboard",
    "configurableHome": true,
    "searchTerms": []
  },
  "basketball_assignments": {
    "file": "https://mschurch-app.github.io/m-plus-basketball/?tab=assignments",
    "icon": "🎯",
    "title": "球員作業",
    "description": "訓練任務與成果",
    "key": "basketball_assignments",
    "group": "basketball",
    "symbol": "target",
    "configurableHome": true,
    "searchTerms": []
  },
  "basketball_schedule": {
    "file": "https://mschurch-app.github.io/m-plus-basketball/?tab=schedule",
    "icon": "📆",
    "title": "球隊行程",
    "description": "練球與比賽",
    "key": "basketball_schedule",
    "group": "basketball",
    "symbol": "calendar",
    "configurableHome": true,
    "searchTerms": []
  },
  "basketball_daily": {
    "file": "https://mschurch-app.github.io/m-plus-basketball/?tab=dailystatus",
    "icon": "💪",
    "title": "每日狀態",
    "description": "身體與訓練狀態",
    "key": "basketball_daily",
    "group": "basketball",
    "symbol": "bolt",
    "configurableHome": true,
    "searchTerms": []
  },
  "system_monitor": {
    "file": "system-monitor.html",
    "icon": "📊",
    "title": "系統狀況",
    "description": "網站、服務與排程",
    "key": "system_monitor",
    "group": "system",
    "symbol": "chart",
    "configurableHome": true,
    "searchTerms": [
      "系統監控中心"
    ]
  },
  "church_settings": {
    "file": "church-settings.html",
    "icon": "⚙️",
    "title": "教會設定",
    "description": "堂會、帳號與功能",
    "key": "church_settings",
    "group": "system",
    "symbol": "gear",
    "configurableHome": true,
    "searchTerms": [
      "系統設定"
    ]
  },
  "pastoral_content": {
    "permission": "pastoral",
    "file": "pastoral-content.html",
    "icon": "✨",
    "title": "牧養圖卡",
    "description": "祝禱、小卡與新朋友旅程",
    "key": "pastoral_content",
    "group": "media",
    "symbol": "sparkle",
    "configurableHome": false,
    "searchTerms": [
      "教牧內容"
    ],
    "settingsId": "pastoral-content",
    "settingsGroup": "content"
  },
  "todays_message": {
    "permission": "pastoral",
    "file": "todays-message-settings.html",
    "icon": "✨",
    "title": "給今天的你",
    "description": "每日經文與祝福內容",
    "key": "todays_message",
    "group": "media",
    "symbol": "sparkle",
    "configurableHome": false,
    "searchTerms": [],
    "settingsId": "line-today",
    "settingsGroup": "content"
  },
  "love_share": {
    "permission": "pastoral",
    "file": "love-share-settings.html",
    "icon": "💛",
    "title": "把愛傳出去",
    "description": "祝福情境與分享圖片",
    "key": "love_share",
    "group": "media",
    "symbol": "heart",
    "configurableHome": false,
    "searchTerms": [],
    "settingsId": "line-love",
    "settingsGroup": "content"
  },
  "line_preview": {
    "permission": "pastoral",
    "file": "line-preview.html",
    "icon": "🔗",
    "title": "LINE 服務預覽",
    "description": "檢查會友服務內容",
    "key": "line_preview",
    "group": "media",
    "symbol": "link",
    "configurableHome": false,
    "searchTerms": [],
    "settingsId": "line-preview",
    "settingsGroup": "content"
  },
  "customization": {
    "permission": "pastoral",
    "file": "customization-settings.html",
    "icon": "⚙️",
    "title": "首頁與表單",
    "description": "功能名稱、迎新表單與選項",
    "key": "customization",
    "group": "system",
    "symbol": "sliders",
    "configurableHome": false,
    "searchTerms": [],
    "settingsId": "customization-options",
    "settingsGroup": "content"
  },
  "admin_accounts": {
    "owner": true,
    "file": "admin-accounts.html",
    "icon": "👥",
    "title": "同工帳號與權限",
    "description": "邀請、帳號與堂會權限",
    "key": "admin_accounts",
    "group": "system",
    "symbol": "people",
    "configurableHome": false,
    "searchTerms": [],
    "settingsId": "admin-accounts",
    "settingsGroup": "people"
  },
  "media_publishing": {
    "permission": "website_weekly",
    "action": "approve",
    "file": "media-publishing-settings.html",
    "icon": "▶",
    "title": "社群發布",
    "description": "Instagram、YouTube 與發布設定",
    "key": "media_publishing",
    "group": "media",
    "symbol": "play",
    "configurableHome": false,
    "searchTerms": [
      "IG",
      "Instagram",
      "YouTube",
      "影片",
      "社群"
    ],
    "settingsId": "media-publishing",
    "settingsGroup": "content"
  },
  "subtitle_library": {
    "permission": "website_weekly",
    "action": "edit",
    "church": "M+",
    "file": "youtube-subtitle-library.html",
    "icon": "📚",
    "title": "字幕詞庫",
    "description": "辨識錯字與講員用語",
    "key": "subtitle_library",
    "group": "media",
    "symbol": "book",
    "configurableHome": false,
    "searchTerms": [],
    "settingsId": "subtitle-library",
    "settingsGroup": "content"
  },
  "service_signups": {
    "church": "M+",
    "permission": "schedules",
    "file": "service-signup-admin.html",
    "icon": "📅",
    "title": "服事意願與協調",
    "description": "季度意願、候補與排班協調",
    "key": "service_signups",
    "group": "service",
    "symbol": "calendar",
    "configurableHome": false,
    "searchTerms": []
  }
});
export const FUNCTION_GROUPS=freezeTree([
  {
    "key": "pastoral",
    "title": "人與關懷",
    "note": "會友、新朋友、小組與關懷",
    "keys": [
      "members",
      "newcomer_care",
      "groups",
      "private_prayers",
      "pastoral_chats",
      "pastoral_workspace"
    ]
  },
  {
    "key": "service",
    "title": "聚會與服事",
    "note": "出席、意願登記、排班與場地",
    "keys": [
      "attendance",
      "schedules",
      "service_signups",
      "spaces",
      "inventory"
    ]
  },
  {
    "key": "media",
    "title": "內容與發布",
    "note": "靈修、週報、教材與社群內容",
    "keys": [
      "tree_reading_admin",
      "website_weekly",
      "website_group_resources",
      "pastoral_content",
      "todays_message",
      "love_share",
      "line_preview",
      "media_publishing",
      "subtitle_library"
    ]
  },
  {
    "key": "school",
    "title": "課輔",
    "note": "學生、出席、輔導與報表",
    "keys": [
      "school",
      "school_checkin",
      "school_schedules",
      "school_rollcall",
      "school_students",
      "school_counseling",
      "school_reports"
    ]
  },
  {
    "key": "basketball",
    "title": "籃球事工",
    "note": "籃球隊、訓練與熱火籃球營",
    "keys": [
      "heat_camp",
      "basketball",
      "basketball_gamecenter",
      "basketball_tactics",
      "basketball_assignments",
      "basketball_schedule",
      "basketball_daily"
    ]
  },
  {
    "key": "system",
    "title": "設定與工具",
    "note": "帳號、身分、審核與通知",
    "keys": [
      "binding_review",
      "review_workflows",
      "notification_settings",
      "customization",
      "admin_accounts",
      "church_settings",
      "system_monitor"
    ]
  }
]);
export const SETTINGS_GROUPS=freezeTree([
  {
    "key": "people",
    "title": "同工與權限",
    "note": "邀請同工、確認 LINE 身分與使用權限",
    "keys": [
      "admin_accounts",
      "binding_review"
    ]
  },
  {
    "key": "review",
    "title": "審核與通知",
    "note": "設定初審、複審與通知方式",
    "keys": [
      "review_workflows",
      "notification_settings"
    ]
  },
  {
    "key": "content",
    "title": "內容與發布",
    "note": "主日、靈修、表單與社群內容",
    "keys": [
      "website_weekly",
      "website_group_resources",
      "tree_reading_admin",
      "pastoral_content",
      "todays_message",
      "love_share",
      "line_preview",
      "media_publishing",
      "subtitle_library",
      "customization"
    ]
  },
  {
    "key": "church",
    "title": "堂會與場地",
    "note": "公開資訊、聚會位置、空間與物品",
    "keys": [
      "spaces",
      "inventory"
    ]
  }
]);
export const PERMISSION_LABELS=freezeTree({
  "members": "會友",
  "attendance": "出席登記",
  "groups": "小組與小家",
  "schedules": "服事安排",
  "private_prayers": "代禱與關懷",
  "pastoral_chats": "關懷訊息與圖卡",
  "spaces": "場地與設備",
  "newcomer_care": "新朋友",
  "tree_reading_admin": "生命樹",
  "binding_review": "LINE 身分確認",
  "notification_settings": "通知設定",
  "website_weekly": "主日週報",
  "website_group_resources": "小組教材",
  "inventory": "物品與借用",
  "heat_camp": "熱火籃球營"
});
export const ROLE_TEMPLATES=freezeTree({
  "pastor": {
    "label": "牧者",
    "permissions": [
      "members",
      "attendance",
      "groups",
      "schedules",
      "private_prayers",
      "pastoral_chats",
      "spaces",
      "newcomer_care",
      "tree_reading_admin",
      "binding_review",
      "notification_settings",
      "website_weekly",
      "website_group_resources",
      "inventory"
    ]
  },
  "pastor_spouse": {
    "label": "師母",
    "permissions": [
      "members",
      "attendance",
      "groups",
      "schedules",
      "private_prayers",
      "pastoral_chats",
      "spaces",
      "newcomer_care",
      "tree_reading_admin",
      "binding_review",
      "notification_settings",
      "website_weekly",
      "website_group_resources",
      "inventory"
    ]
  },
  "administrator": {
    "label": "行政管理",
    "permissions": [
      "members",
      "attendance",
      "groups",
      "schedules",
      "spaces",
      "newcomer_care",
      "binding_review",
      "notification_settings",
      "inventory"
    ]
  },
  "group_leader": {
    "label": "小組／小家長",
    "permissions": [
      "members",
      "attendance",
      "groups"
    ]
  },
  "care": {
    "label": "關懷同工",
    "permissions": [
      "members",
      "private_prayers",
      "pastoral_chats",
      "newcomer_care"
    ]
  },
  "facilities": {
    "label": "總務同工",
    "permissions": [
      "spaces",
      "inventory"
    ]
  },
  "custom": {
    "label": "自訂權限",
    "permissions": []
  }
});
export const HOME_TEMPLATES=freezeTree({
  "pastor": [
    "newcomer_care",
    "private_prayers",
    "pastoral_chats",
    "pastoral_workspace",
    "members",
    "schedules",
    "system_monitor"
  ],
  "pastor_spouse": [
    "newcomer_care",
    "private_prayers",
    "pastoral_workspace",
    "members",
    "groups",
    "schedules"
  ],
  "administrator": [
    "attendance",
    "members",
    "groups",
    "schedules",
    "spaces",
    "inventory",
    "binding_review",
    "notification_settings",
    "website_weekly"
  ],
  "group_leader": [
    "groups",
    "attendance",
    "members",
    "pastoral_workspace"
  ],
  "care": [
    "newcomer_care",
    "private_prayers",
    "pastoral_chats",
    "members",
    "pastoral_workspace"
  ],
  "facilities": [
    "spaces",
    "inventory",
    "pastoral_workspace"
  ],
  "custom": [
    "pastoral_workspace"
  ]
});
export const FEATURE_ACTIONS=freezeTree({
  "view": "查看",
  "create": "新增",
  "edit": "修改",
  "delete": "刪除",
  "export": "匯出",
  "approve": "審核",
  "manage": "管理設定"
});
export const FRIENDLY_LABELS=freezeTree({
  "會友名冊": "會友",
  "新朋友關懷": "新朋友",
  "同工協作": "同工工作區",
  "代禱關懷": "代禱與關懷",
  "牧養訊息": "關懷訊息",
  "聚會點名": "出席登記",
  "小組／小家": "小組與小家",
  "服事排班": "服事安排",
  "場地預約": "場地與設備",
  "物品清冊": "物品與借用",
  "教會網站維護": "主日週報",
  "小組聚會資源": "小組教材",
  "每日靈修生命樹": "生命樹",
  "讀經生命樹": "生命樹",
  "LINE 綁定審核": "LINE 身分確認",
  "LINE 通知設定": "通知設定",
  "通知管道設定": "通知設定",
  "教牧內容": "牧養圖卡",
  "系統監控中心": "系統狀況",
  "系統設定": "教會設定"
});
export const NAVIGATION_MODULES=freezeTree([
  {
    "key": "dashboard",
    "file": "admin-dashboard.html",
    "label": "首頁",
    "icon": "🏠"
  },
  {
    "key": "members",
    "functionKey": "members",
    "also": [
      "member-audit.html"
    ]
  },
  {
    "key": "newcomer_care",
    "functionKey": "newcomer_care"
  },
  {
    "key": "tree_reading_admin",
    "functionKey": "tree_reading_admin",
    "also": [
      "tree-reading-admin.html"
    ]
  },
  {
    "key": "binding_review",
    "functionKey": "binding_review"
  },
  {
    "key": "notification_settings",
    "functionKey": "notification_settings"
  },
  {
    "key": "review_workflows",
    "functionKey": "review_workflows"
  },
  {
    "key": "groups",
    "functionKey": "groups",
    "also": [
      "group-members.html"
    ]
  },
  {
    "key": "attendance",
    "functionKey": "attendance"
  },
  {
    "key": "schedules",
    "functionKey": "schedules"
  },
  {
    "key": "inventory",
    "functionKey": "inventory"
  },
  {
    "key": "prayers",
    "functionKey": "private_prayers"
  },
  {
    "key": "pastoral_inbox",
    "functionKey": "pastoral_chats"
  },
  {
    "key": "pastoral_content",
    "functionKey": "pastoral_content",
    "permission": "pastoral_chats"
  },
  {
    "key": "settings",
    "functionKey": "church_settings",
    "also": [
      "customization-settings.html",
      "welcome-settings.html",
      "ministry-settings.html",
      "admin-accounts.html",
      "todays-message-settings.html",
      "love-share-settings.html"
    ]
  }
].map(route=>{if(route.key==='dashboard')return route;const item=FUNCTION_CATALOG[route.functionKey];return {...route,file:item.file,label:item.title,icon:item.icon,...(route.permission||item.permission?{permission:route.permission||item.permission}:{})};}));
export const FUNCTION_ALIASES=Object.freeze({prayers:'private_prayers',pastoral_inbox:'pastoral_chats',settings:'church_settings'});
export const HOME_MODULES=Object.freeze(Object.fromEntries(Object.entries(FUNCTION_CATALOG).filter(([,item])=>item.configurableHome).map(([key,item])=>[key,item.title])));
export const LEGACY_DASHBOARD_MODULES=Object.freeze([
  "members",
  "newcomer_care",
  "tree_reading_admin",
  "binding_review",
  "notification_settings",
  "groups",
  "attendance",
  "schedules",
  "spaces",
  "inventory",
  "prayers",
  "pastoral_inbox",
  "pastoral_content",
  "website_weekly",
  "website_group_resources"
].map(key=>{const item=FUNCTION_CATALOG[FUNCTION_ALIASES[key]||key];return Object.freeze({...item,key,permission:item.permission==='pastoral'?'pastoral_chats':item.permission});}));
export function canonicalFunctionKey(key){return FUNCTION_ALIASES[key]||key;}
export function friendlyLabel(label){return FRIENDLY_LABELS[label]||label;}
export function matchesFunction(key,query){const item=FUNCTION_CATALOG[canonicalFunctionKey(key)];if(!item)return false;const words=String(query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),haystack=[item.title,item.description,...item.searchTerms].join(' ').toLocaleLowerCase();return words.every(word=>haystack.includes(word));}
export function functionHref(key,church){const item=FUNCTION_CATALOG[canonicalFunctionKey(key)];if(!item)throw new Error('unknown_function');if(item.file.startsWith('https://'))return item.file;const url=new URL(item.file,'https://church.invalid/');if(church)url.searchParams.set('church',church);return url.pathname.slice(1)+url.search+url.hash;}

// Preserve stored customization keys while deriving their routes from the same catalog.
export const LEGACY_FEATURE_FILES=Object.freeze(Object.fromEntries([
  'members','newcomer_care','tree_reading_admin','binding_review','notification_settings','groups','attendance','schedules','prayers','spaces','pastoral_inbox','pastoral_content','website_weekly','website_group_resources'
].map(key=>[key,FUNCTION_CATALOG[canonicalFunctionKey(key)].file])));
