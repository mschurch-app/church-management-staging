import {readAccess,chooseChurch} from './admin-access.mjs?v=20261008-access-deadline1';
export const MODULES=Object.freeze([
 {key:'members',permission:'members',title:'會友',description:'會友、新朋友與資料紀錄',file:'members.html',icon:'👥'},
 {key:'newcomer_care',permission:'newcomer_care',title:'新朋友',description:'聯絡紀錄、下一步與後續關懷',file:'newcomer-care.html',icon:'🌱'},
 {key:'tree_reading_admin',permission:'tree_reading_admin',title:'生命樹',description:'每日靈修與讀經進度',file:'daily-devotional-admin.html',icon:'🌳'},
 {key:'binding_review',permission:'binding_review',title:'LINE 身分確認',description:'確認會友與 LINE 帳號',file:'binding-review.html',icon:'🔗'},
 {key:'notification_settings',permission:'notification_settings',title:'通知設定',description:'設定手機與 LINE 通知',file:'notification-settings.html',icon:'🔔'},
 {key:'groups',permission:'groups',title:'小組與小家',description:'分組、組長與成員安排',file:'groups.html',icon:'🫶'},
 {key:'attendance',permission:'attendance',title:'出席登記',description:'聚會出席與統計',file:'attendance.html',icon:'✅'},
 {key:'schedules',permission:'schedules',title:'服事安排',description:'主日與聚會服事',file:'schedules.html',icon:'📅'},
 {key:'spaces',permission:'spaces',title:'場地與設備',description:'空間、設備與預約',file:'spaces.html',icon:'📍'},
 {key:'inventory',permission:'inventory',title:'物品與借用',description:'位置、數量、借出與歸還',file:'inventory.html',icon:'📦'},
 {key:'prayers',permission:'private_prayers',title:'代禱與關懷',description:'公開與私密代禱追蹤',file:'prayers.html',icon:'🙏'},
 {key:'pastoral_inbox',permission:'pastoral_chats',title:'關懷訊息',description:'一對一訊息與跟進紀錄',file:'pastoral-inbox.html',icon:'💬'},
 {key:'pastoral_content',permission:'pastoral_chats',title:'牧養圖卡',description:'祝禱、小卡與新朋友旅程',file:'pastoral-content.html',icon:'✨'},
 {key:'website_weekly',permission:'website_weekly',title:'主日週報',description:'週報、主日預告圖與服事表',file:'website-maintenance.html',icon:'🌐'},
 {key:'website_group_resources',permission:'website_group_resources',title:'小組教材',description:'每週教材與聚會內容',file:'group-resources-management.html',icon:'📚'}
]);
export async function dashboardAccess(db,preferred){const access=await readAccess(db),church=chooseChurch(access,preferred);return {access,church};}
export const HOME_TEMPLATES=Object.freeze({pastor:['newcomer_care','private_prayers','pastoral_chats','pastoral_workspace','members','schedules','system_monitor'],pastor_spouse:['newcomer_care','private_prayers','pastoral_workspace','members','groups','schedules'],administrator:['attendance','members','groups','schedules','spaces','binding_review','notification_settings','website_weekly'],group_leader:['groups','attendance','members','pastoral_workspace'],care:['newcomer_care','private_prayers','pastoral_chats','members','pastoral_workspace'],facilities:['spaces','pastoral_workspace'],custom:['pastoral_workspace']});
export async function dashboardHomePreferences(db,church){const [home,features]=await Promise.all([db.rpc('get_my_home_preferences',{p_church:church}),db.rpc('get_my_feature_permissions',{p_church:church})]);const data=home.data||{};return {role_key:data.role_key||'custom',home_modules:Array.isArray(data.home_modules)?data.home_modules:(HOME_TEMPLATES[data.role_key]||HOME_TEMPLATES.custom),feature_permissions:Array.isArray(features.data)?features.data:[]};}
export async function dashboardCounts(db,church,grants){
 const has=p=>grants.some(g=>g.church_id===church&&g.permission===p),jobs=[];
 const add=(key,table,permission,apply=q=>q)=>{if(!has(permission))return;jobs.push(apply(db.from(table).select('*',{count:'exact',head:true}).eq('church_id',church)).then(({count,error})=>[key,error?null:count]));};
 add('members','members','members');add('groups','groups','groups');
 if(has('private_prayers'))jobs.push(db.from('prayers').select('is_private,created_at,expires_at').eq('church_id',church).eq('status','pending').then(({data,error})=>{
  if(error||!Array.isArray(data))return ['prayers',null];
  const now=Date.now(),wallCutoff=now-6*24*60*60*1000;
  const count=data.filter(row=>row.is_private===true||(row.is_private===false&&Date.parse(row.expires_at)>now&&Date.parse(row.created_at)>wallCutoff)).length;
  return ['prayers',count];
 }));
 const pairs=await Promise.all(jobs);return Object.fromEntries(pairs);
}
export async function dashboardTodos(db,church,grants){
 const has=p=>grants.some(g=>g.church_id===church&&g.permission===p),items=[];
 if(has('newcomer_care')){const {data,error}=await db.rpc('get_newcomer_care_summary',{p_church:church});if(!error&&data){if(data.overdue)items.push({tone:'urgent',icon:'🚨',count:data.overdue,title:'新朋友關懷逾期',detail:'已超過第一次聯絡或下次跟進期限',file:'newcomer-care.html?filter=overdue'});if(data.due_soon)items.push({tone:'warning',icon:'⏰',count:data.due_soon,title:'即將到期的關懷',detail:'24 小時內需要完成',file:'newcomer-care.html?filter=due'});if(data.open)items.push({tone:'normal',icon:'🌱',count:data.open,title:'持續關懷中的新朋友',detail:'查看負責同工、紀錄與下一步',file:'newcomer-care.html'});}}
 const counts=await dashboardCounts(db,church,grants);
 if(counts.prayers>0)items.push({tone:'normal',icon:'🙏',count:counts.prayers,title:'待關懷代禱',detail:'來源：目前公開代禱牆＋教牧私密代禱',file:'prayers.html?state=pending&scope=current'});
 return items;
}
