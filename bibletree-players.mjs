import {db} from './admin-db.mjs?v=20261012-readable2';
import {readAccess,canOpen} from './admin-access.mjs?v=20261022-experience5';
import {settingsWorkflow} from './settings-workflow.mjs?v=20261023-settings1';
import {dateLabel,churchLabel,avatarLabel,rewardLabel,validateResult} from './bibletree-players-model.mjs?v=20261028-players1';
const $=id=>document.getElementById(id),node=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
const ENDPOINT='https://loscejilzfdwhmogkuwf.supabase.co/functions/v1/bibletree-players-admin';
let current=null,applied={query:'',filter:'all'},offset=0;
const flow=settingsWorkflow({db,root:document.querySelector('main'),clear:()=>{current=null;$('workspace').hidden=true;$('players').replaceChildren();$('metrics').replaceChildren();},sync:({busy,ready})=>{
 $('reload').disabled=busy;for(const el of $('filters').elements)el.disabled=busy;
 $('prev').disabled=busy||!ready||!current||current.offset===0;$('next').disabled=busy||!ready||!current||current.offset+current.limit>=current.total;
}});
function render(result){
 current=result;$('workspace').hidden=false;$('login').hidden=true;
 $('metrics').replaceChildren(...[['總玩家',result.stats.accounts],['近 7 天登入',result.stats.active],['公測參與帳號',result.stats.beta],['已回饋帳號',result.stats.feedback]].map(([label,value])=>{const card=node('article');card.append(node('strong',String(value)),node('span',label));return card;}));
 $('updated').textContent='更新於 '+dateLabel(result.generated_at);
 $('result-count').textContent=`符合 ${result.total} 位玩家${result.total?`，顯示第 ${result.offset+1}–${Math.min(result.offset+result.limit,result.total)} 位`:''}。`;
 $('page').textContent=`第 ${Math.floor(result.offset/result.limit)+1} / ${Math.max(1,Math.ceil(result.total/result.limit))} 頁`;
 $('players').replaceChildren();
 for(const p of result.players){
  const card=node('article','','bt-player-card'),heading=node('div','','bt-player-heading');heading.append(node('h3',p.display_name||'尚未建立角色'),node('small','帳號 '+p.user_id.slice(0,8)));
  if(p.beta_first_seen_at)heading.append(node('span','公測玩家','bt-player-badge'));if(p.feedback_count>0)heading.append(node('span',`已提交 ${p.feedback_count} 則回饋`,'bt-player-badge'));
  const dl=node('dl','','bt-player-detail'),details=[['角色',avatarLabel(p.avatar_id)],['性別',({male:'男',female:'女'})[p.gender]||'未填寫'],['年齡區間',p.age_band||'未填寫'],['所在縣市',p.region||'未填寫'],['所屬教會',churchLabel(p)],['雲端遊戲進度',p.save_updated_at?`Lv.${p.level??'—'} · 已讀 ${p.reading_days} / 365 日`:'尚未同步存檔'],['最近登入',dateLabel(p.last_sign_in_at)],['加入日期',dateLabel(p.created_at)],['存檔更新',dateLabel(p.save_updated_at)]];
  for(const [label,value]of details){const div=node('div');div.append(node('dt',label),node('dd',value));dl.append(div);}card.append(heading,dl,node('p',rewardLabel(p),'bt-player-rewards'));$('players').append(card);
 }
 if(!result.players.length)$('players').append(node('p',result.total?'此頁已無資料，請回上一頁或重新查詢。':'沒有符合條件的玩家，可清除篩選或稍後重新載入。','bt-player-empty'));
}
async function load(){await flow.load(async()=>{
 if((new URLSearchParams(location.search).get('church')||'M+')!=='M+')throw Error('此玩家管理頁僅提供 M+ 使用。');
 const access=await readAccess(db,{fresh:true});if(!canOpen(access,'M+','tree_reading_admin'))throw Error('此帳號沒有讀經樹玩家管理權限。');
 const {data:{session}}=await db.auth.getSession();if(!session?.access_token||session.user.id!==access.user.id)throw Error('登入狀態已變更，請重新登入。');
 const r=await fetch(ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:JSON.stringify({action:'list',...applied,offset}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)}),result=await r.json().catch(()=>null);
 if(!r.ok)throw Error(r.status===403?'此帳號沒有玩家資料檢視權限。':r.status===401?'登入已失效，請重新登入。':'暫時無法讀取玩家資料，請按重新載入。');
 const latest=await db.auth.getSession();if(latest.data.session?.user.id!==session.user.id)throw Error('登入狀態已變更，請重新載入。');
 return validateResult(result);
 },result=>{render(result);return '玩家列表已載入。';});$('login').hidden=flow.ready;}
const search=()=>{applied={query:$('query').value.trim(),filter:$('filter').value};offset=0;load();};
$('filters').onsubmit=e=>{e.preventDefault();search();};$('filter').onchange=search;
$('reset').onclick=()=>{$('query').value='';$('filter').value='all';search();};
$('prev').onclick=()=>{if(!flow.ready||offset===0)return;offset=Math.max(0,offset-25);load();};
$('next').onclick=()=>{if(!flow.ready||!current||offset+25>=current.total)return;offset+=25;load();};
$('reload').onclick=load;flow.state();load();
