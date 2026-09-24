import {readAccess,chooseChurch} from './admin-access.mjs?v=20260923-profile1';
export const MODULES=Object.freeze([
 {key:'members',permission:'members',title:'會友名冊',description:'會員、新朋友、封存與操作紀錄',file:'members.html',icon:'👥'},
 {key:'groups',permission:'groups',title:'小組／小家',description:'分組、組長與成員安排',file:'groups.html',icon:'🫶'},
 {key:'attendance',permission:'attendance',title:'聚會點名',description:'出席登記、修改與統計',file:'attendance.html',icon:'✅'},
 {key:'schedules',permission:'schedules',title:'服事排班',description:'主日與聚會服事安排',file:'schedules.html',icon:'📅'},
 {key:'spaces',permission:'spaces',title:'場地預約',description:'空間、設備與借用審核',file:'spaces.html',icon:'📍'},
 {key:'prayers',permission:'private_prayers',title:'代禱關懷',description:'公開與私密代禱追蹤',file:'prayers.html',icon:'🙏'},
 {key:'pastoral_inbox',permission:'pastoral_chats',title:'牧養訊息',description:'一對一訊息與跟進紀錄',file:'pastoral-inbox.html',icon:'💬'},
 {key:'pastoral_content',permission:'pastoral_chats',title:'教牧內容',description:'祝禱、小卡、旅程與圖卡',file:'pastoral-content.html',icon:'✨'}
]);
export async function dashboardAccess(db,preferred){const access=await readAccess(db),church=chooseChurch(access,preferred);return {access,church};}
export async function dashboardCounts(db,church,grants){const has=p=>grants.some(g=>g.church_id===church&&g.permission===p),jobs=[];const add=(key,table,permission,apply=q=>q)=>{if(!has(permission))return;jobs.push(apply(db.from(table).select('*',{count:'exact',head:true}).eq('church_id',church)).then(({count,error})=>[key,error?null:count]));};add('members','members','members');add('groups','groups','groups');add('prayers','prayers','private_prayers',q=>q.eq('status','pending'));add('bookings','room_bookings','spaces',q=>q.eq('status','待審核'));const pairs=await Promise.all(jobs);return Object.fromEntries(pairs);}
