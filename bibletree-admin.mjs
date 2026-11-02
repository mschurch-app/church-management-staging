import {db} from './admin-db.mjs?v=20261102-bibletree-admin1';
import {readAccess,canOpen} from './admin-access.mjs?v=20261022-experience5';
import {createFunctionEntry,setStatus} from './app-ui.mjs?v=20261102-bibletree-admin1';
import {overviewProjection,OVERVIEW_METRICS} from './bibletree-admin-overview.mjs?v=20261102-overview1';
const ENDPOINT='https://loscejilzfdwhmogkuwf.supabase.co/functions/v1/bibletree-players-admin';
const $=id=>document.getElementById(id);
let actor=null,generation=0,expiry;
function clearOverview(){clearTimeout(expiry);$('overview-metrics').replaceChildren();$('overview-status').textContent='尚未取得管理資料。';}
function clear(){clearOverview();actor=null;$('workspace').hidden=true;$('tools').replaceChildren();}
async function load(){
 const sequence=++generation;clear();$('reload').disabled=true;$('login').hidden=true;setStatus($('status'),'正在確認帳號與管理權限…',{busy:true});
 try{
  if((new URLSearchParams(location.search).get('church')||'M+')!=='M+')throw Error('此管理頁僅提供 M+ 使用。');
  const access=await readAccess(db,{fresh:true});
  const {data:{session}}=await db.auth.getSession();
  if(sequence!==generation)return;
  if(!session?.user?.id||session.user.id!==access.user?.id)throw Error('登入狀態已變更，請重新登入。');
  if(!canOpen(access,'M+','tree_reading_admin'))throw Error('此帳號沒有讀經樹管理檢視權限。');
  actor=access.user.id;$('tools').replaceChildren(...['bibletree_players','bibletree_devotional'].map(key=>createFunctionEntry(key,{church:'M+'})));
  $('workspace').hidden=false;void loadOverview(session,sequence);setStatus($('status'),'管理入口已載入。靈修發布另依目前帳號的核准權限判定。');
 }catch(e){if(sequence===generation){clear();setStatus($('status'),e.message,{tone:'error'});$('login').hidden=false;}}
 finally{if(sequence===generation)$('reload').disabled=false;}
}
$('login').href='admin-login.html?next='+encodeURIComponent('bibletree-admin.html?church=M%2B');
$('reload').onclick=()=>void load();
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||actor&&session?.user?.id!==actor){generation++;clear();$('reload').disabled=false;setStatus($('status'),'登入身分已變更，請重新確認權限。',{tone:'error'});$('login').hidden=false;}});
void load();

async function loadOverview(session,sequence){
 $('overview-status').textContent='正在取得旅程摘要…';
 try{
  const response=await fetch(ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:JSON.stringify({action:'overview'}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)});
  const data=await response.json().catch(()=>null),latest=await db.auth.getSession();
  if(sequence!==generation||actor!==session.user.id||latest.data?.session?.user?.id!==actor)return;
  if(!response.ok){if(response.status===401||response.status===403){clear();setStatus($('status'),'登入或檢視權限已變更，請重新確認。',{tone:'error'});return;}throw Error('暫時無法取得管理摘要，請重新確認。');}
  const view=overviewProjection(data);
  const nodes=OVERVIEW_METRICS.map(([key,label])=>{const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(view.stats[key]);div.append(dt,dd);return div;});$('overview-metrics').replaceChildren(...nodes);
  const stamp=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(view.generated_at));
  $('overview-status').textContent='管理資料讀取成功 · '+stamp;
  expiry=setTimeout(()=>{if(sequence===generation)$('overview-status').textContent='以上為 '+stamp+' 的查詢結果，請重新確認以取得最新摘要。';},180000);
 }catch(error){if(sequence===generation){clearOverview();$('overview-status').textContent=['AbortError','TimeoutError','TypeError','SyntaxError'].includes(error.name)?'目前無法取得管理摘要，請恢復連線後重新確認。':error.message;}}
}
