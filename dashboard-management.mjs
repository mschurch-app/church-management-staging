import {readAccess,chooseChurch} from './admin-access.mjs?v=20261009-stage1';
export {LEGACY_DASHBOARD_MODULES as MODULES,HOME_TEMPLATES} from './app-function-definitions.mjs?v=20261009-stage2';
import {HOME_TEMPLATES} from './app-function-definitions.mjs?v=20261009-stage2';
export async function dashboardAccess(db,preferred){const access=await readAccess(db),church=chooseChurch(access,preferred);return {access,church};}
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
