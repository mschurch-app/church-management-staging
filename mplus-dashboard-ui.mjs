import {mountWorkProfile} from './work-profile.mjs?v=20261022-accounts-layout1';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {dashboardAccess,dashboardCounts,dashboardHomePreferences} from './dashboard-management.mjs?v=20261021-work-roles1';
import {loadChurchCustomizations} from './church-customizations.mjs?v=20261023-settings1';
import {FUNCTION_CATALOG,availableFunctionKeys} from './app-function-catalog.mjs?v=20261027-albums1';
import {loadNotificationCenter} from './app-notifications.mjs?v=20261012-readable2';
import {wireInstallButton,wireNotificationButtons} from './app-pwa.mjs?v=20261019-workflow1';
import {mountMplusNavigation,MPLUS_CENTERS,visibleCenters} from './mplus-navigation.mjs?v=20261027-custom1';
import {mountWeekCalendar} from './mplus-week-calendar.mjs?v=20261027-spouse-routine1';
const preferred='M+',$=s=>document.querySelector(s);
let church='M+';
const make=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
function hrefFor(key,file){const url=new URL(file||FUNCTION_CATALOG[key].file,location.href);if(url.origin===location.origin)url.searchParams.set('church','M+');return url.href;}
function renderCounts(counts){const area=$('#summary');area.replaceChildren();for(const [key,label]of [['members','會友'],['groups','小組與聚會'],['prayers','待關懷代禱']]){if(counts[key]===undefined)continue;const card=make('article');card.append(make('strong',counts[key]===null?'—':String(counts[key])),make('span',label));area.append(card);}area.hidden=!area.children.length;}
async function financeExpenseAccess(){try{const r=await db.functions.invoke('finance-expenses',{body:{action:'profile'}});return !r.error&&r.data?.ok===true&&(r.data.owner===true||r.data.roles?.length>0);}catch{return false;}}
async function financeAccess(){
 try{const response=await db.functions.invoke('finance-cash',{body:{action:'profile'}});
  return !response.error&&response.data?.ok===true&&(response.data.owner===true||response.data.roles?.length>0);
 }catch{return false;}
}
function wireSearch(allowed){const centers=visibleCenters(new Set(allowed)),items=Object.values(centers).flatMap(c=>c.cards.flatMap(([,links])=>links)),seen=new Set();for(const key of allowed){if(key!=='pastoral_workspace'&&!items.some(([,k])=>k===key))items.push([FUNCTION_CATALOG[key].title,key]);}$('#function-search').oninput=()=>{const term=$('#function-search').value.trim().toLocaleLowerCase('zh-TW'),area=$('#function-search-results');area.replaceChildren();area.hidden=!term;if(!term)return;seen.clear();for(const [label,key,file]of items){const href=hrefFor(key,file),id=label+href;if(seen.has(id)||!label.toLocaleLowerCase('zh-TW').includes(term))continue;seen.add(id);const a=make('a',label+' ›');a.href=href;if(key.startsWith('school'))a.onclick=e=>openSchool(e,href);area.append(a);}if(!area.children.length)area.append(make('p','找不到符合的可用功能。','muted'));};}
async function load(){try{
 const {access,church:selected}=await dashboardAccess(db,preferred);if(selected!=='M+')throw Error('此入口僅適用 M+，請返回所屬堂會。');church=selected;
 const [settings,home,monitor,capabilities,canUseFinance,canUseExpenses]=await Promise.all([
  loadChurchCustomizations(db,church),dashboardHomePreferences(db,church),
  db.rpc('get_my_system_monitor_access'),db.rpc('get_my_app_capabilities'),financeAccess(),financeExpenseAccess()
 ]);
 home.system_monitor_access=!monitor.error&&monitor.data===true;home.is_owner=capabilities.data?.is_owner===true;home.financeCashAccess=canUseFinance;home.financeExpenseAccess=canUseExpenses;
 const allowed=availableFunctionKeys(access,church,home,settings);$('#welcome').textContent=access.user.name+'｜'+access.user.title;
 if(church==='M+'){mountMplusNavigation({allowed,hrefFor,openSchool});mountWeekCalendar({allowed:allowed.includes('pastoral_workspace'),autoPromptRoutineSetup:access.user.title!=='師母'});}
 void mountWorkProfile({db,allowed,openSchool});
 wireSearch(allowed);$('#function-search').disabled=false;$('#status').hidden=true;
 void dashboardCounts(db,church,access.grants).then(renderCounts).catch(()=>{});
 void loadNotificationCenter($('#notification-list'),$('#notification-count'),$('#notification-history'));
 }catch(error){$('#status').hidden=false;$('#status').textContent=error.message;$('#welcome').textContent='請確認登入狀態';$('#logout').textContent='回登入頁';$('#logout').onclick=()=>location.replace('admin-login.html?church=M%2B');if($('#week-loading'))$('#week-loading').textContent='確認登入後才能讀取行事曆。';}
}
$('#logout').onclick=async()=>{await db.auth.signOut();location.replace('admin-login.html?church=M%2B');};
async function openSchool(event,destination){
 event.preventDefault();const schoolDestination=new URL(destination);if(schoolDestination.origin!=='https://school.mchurch.online')return;const osDestination=new URL('school/index.html',location.href);osDestination.search=schoolDestination.search;destination=osDestination.href;$('#status').hidden=false;$('#status').textContent='正在使用教會 OS 帳號開啟課輔系統…';
 try{
  const session=await db.auth.getSession(),token=session.data.session?.access_token;if(!token)throw new Error('missing_session');
  const response=await fetch('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/mschool-api/church-login',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok||!result.session)throw new Error(result.error||'login_failed');
  location.assign(`${destination}#church_session=${encodeURIComponent(result.session)}`);
 }catch{location.assign(destination);}
}

wireInstallButton($('#install-app'),$('#install-help'));
wireNotificationButtons($('#enable-notifications'),$('#test-notification'),$('#install-help'));
load();
