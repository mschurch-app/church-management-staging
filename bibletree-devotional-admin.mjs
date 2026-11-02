import {db} from './admin-db.mjs?v=20261102-bibletree-admin1';
import {readAccess,canOpen} from './admin-access.mjs?v=20261022-experience5';
import {setStatus} from './app-ui.mjs?v=20261102-bibletree-admin1';
import {draftGuard,node} from './app-workflow.mjs?v=20261022-experience2';
import {FIELDS,valuesOf,bodyCount,validation,filterDays,reconcileSave} from './bibletree-devotional-model.mjs?v=20261102-bibletree-admin1';
const ENDPOINT='https://loscejilzfdwhmogkuwf.supabase.co/functions/v1/bibletree-devotional-admin';
const $=id=>document.getElementById(id),form=$('editor');
let items=[],current=null,canEdit=false,busy=false,pending=null,conflict=false,actor=null;
const guard=draftGuard(form,()=>count());
const messages={forbidden:'帳號沒有讀經樹靈修的查看或核准權限，請聯絡管理員。',login_required:'登入已失效，請重新登入教會 OS。',revision_conflict:'這一天已有新的修改。您的內容仍在編輯區，請先複製保留，再重新載入此日核對。',too_short:'靈修正文至少需要 350 字（不含標點）。',required_fields:'請填妥所有靈修欄位。',field_length:'欄位字數超過限制。',invalid_field:'包含不可修改的欄位。',note_length:'修改說明最多 500 字。',not_found:'找不到這一天的資料。'};
const say=(message,tone='neutral')=>setStatus($('editor-status'),message,{tone});
function lock(){
 $('workspace').setAttribute('aria-busy',String(busy));
 for(const control of $('workspace').querySelectorAll('button,input,select,textarea'))control.disabled=busy;
 $('fields').disabled=busy||!canEdit||!!pending||!current;
 $('note').disabled=busy||!canEdit||!!pending||!current;
 $('save').disabled=$('save-next').disabled=busy||!canEdit||!current||!!pending||conflict;
 $('prev').disabled=busy||!current||current.day_number<=1||!!pending;
 $('next').disabled=busy||!current||current.day_number>=365||!!pending;
 $('save-next').disabled||=current?.day_number>=365;
 $('history').disabled=busy||!current||!!pending;
 $('reconcile').hidden=!pending;
 $('reload').disabled=busy||!current||!!pending;
 $('date').disabled=busy||!!pending;
 for(const button of $('days').querySelectorAll('button'))button.disabled=busy||!!pending;
}
async function api(action,data={}){
 const requestActor=actor;
 const session=await db.auth.getSession();
 if(!session.data?.session?.access_token||session.data.session.user.id!==actor)throw Object.assign(new Error(messages.login_required),{code:'login_required'});
 const r=await fetch(ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+session.data.session.access_token,'content-type':'application/json'},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(30000),cache:'no-store'});
 const result=await r.json();
 const latest=await db.auth.getSession();
 if(latest.data?.session?.user?.id!==requestActor||actor!==requestActor)throw new Error('登入身分已變更，請重新確認結果。');
 if(r.status===401||r.status===403)canEdit=false;
 if(!r.ok||result?.ok!==true)throw Object.assign(new Error(messages[result?.error]||'暫時無法確認操作結果，請稍後再試。'),{code:result?.error||'unavailable'});
 canEdit=result.canEdit===true;return result;
}
function readForm(){return Object.fromEntries(FIELDS.map(([key])=>[key,form.elements[key].value.trim()]));}
function count(){const n=bodyCount(readForm());$('counter').textContent=`靈修正文 ${n} 字／至少 350 字（不含標點、標題及金句）${guard.dirty?' · 尚未儲存':''}`;}
for(const [key,label,max] of FIELDS){const labelNode=node('label',label);labelNode.htmlFor=key;const input=document.createElement(key==='devotional_title'||key==='selected_scripture_reference'?'input':'textarea');input.id=key;input.name=key;input.required=true;input.maxLength=max;if(input.tagName==='TEXTAREA')input.rows=key==='explanation'?7:4;$('fields').append(labelNode,input);}
for(let m=1;m<=12;m++){const option=node('option',`${m} 月`);option.value=String(m).padStart(2,'0');$('month').append(option);}
function renderDays(){
 const found=filterDays(items,$('month').value,$('search').value);$('days').replaceChildren();$('result-count').textContent=`${found.length} 篇`;
 for(const item of found){const b=node('button','','bt-day secondary');b.type='button';b.dataset.appControl='surface';b.setAttribute('aria-pressed',String(item.day===current?.day_number));b.append(node('small',`${item.date} · 第 ${item.day} 天`),node('strong',item.title),node('small',item.main_reference));b.addEventListener('click',()=>void loadDay(item.day));$('days').append(b);}
 if(!found.length)$('days').append(node('p','沒有符合的內容，請調整月份或搜尋文字。'));lock();
}
function renderScripture(document){
 $('references').textContent=[document.main_reference,document.support_reference].filter(Boolean).join(' ／ ');$('scripture').replaceChildren();
 const full=document.scripture_fulltext;
 if(!full||typeof full!=='object'){$('scripture').append(node('p','本日經文暫時無法顯示，請重新載入。'));return;}
 for(const [key,label] of [['main','主線經文'],['support','輔讀經文']]){
  const spans=full[key];if(!Array.isArray(spans)||!spans.length)continue;
  $('scripture').append(node('h3',label));
  for(const span of spans){$('scripture').append(node('h4',`${span.book} ${span.chapter} 章`));$('scripture').append(node('p',(span.verses||[]).map(v=>`${v.verse}　${v.text}`).join('\n')));}
 }
 $('scripture').append(node('small','經文：繁體中文和合本。依全年讀經編排顯示，靈修編輯不改動經文全文。'));
}
function show(item){
 current=item;pending=null;conflict=false;
 const doc=item.document;for(const [key]of FIELDS)form.elements[key].value=doc[key]||'';
 $('note').value='';$('date').value=item.reading_date;
 $('day-label').textContent=`內容第 ${item.day_number} 天 · 計畫索引 ${item.reading_date}`;
 $('day-title').textContent=doc.devotional_title;
 $('revision').textContent=`已核准 · 版本 ${item.revision} · 更新於 ${new Date(item.updated_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`;
 const summary=items.find(i=>i.day===item.day_number);if(summary)Object.assign(summary,{title:doc.devotional_title,revision:item.revision,updated_at:item.updated_at});
 renderScripture(doc);guard.clear();renderDays();count();lock();
 history.replaceState(null,'',`${location.pathname}?church=M%2B&day=${item.day_number}`);
}
async function loadDay(day,{skipGuard=false}={}){
 if(busy||pending||!Number.isInteger(day)||day<1||day>365)return;
 if(!skipGuard&&!guard.canLeave())return;
 busy=true;lock();say('正在載入當日經文與靈修…');
 try{const result=await api('get',{day});show(result.item);$('day-title').scrollIntoView({block:'start',behavior:'auto'});say(canEdit?'可直接編輯；儲存後更新讀經樹內容。':'目前為唯讀，修改需要靈修核准權限。');}
 catch(e){say(e.message,'error');}
 finally{busy=false;lock();}
}
async function save(next=false){
 if(busy||!canEdit||!current||pending||conflict)return;
 const values=readForm(),error=validation(values);if(error){say(error,'error');form.reportValidity();return;}
 const request={day:current.day_number,expected_revision:current.revision,values,note:$('note').value.trim()};
 busy=true;lock();say('正在儲存並發布…');let saved=false;
 try{const result=await api('save',request);show(result.item);say(result.unchanged?'內容沒有變更，已核對目前發布版本。':'已儲存並發布。讀經樹重新載入該日即可讀取修改。','success');saved=true;}
 catch(e){
  if(e.code==='revision_conflict'){conflict=true;say(e.message,'error');}
  else if(['too_short','required_fields','field_length','invalid_field','note_length','forbidden','login_required'].includes(e.code)){say(e.message,'error');}
  else{pending=request;say('連線中斷，尚無法確認是否儲存。您的內容已保留；請按「確認儲存結果」，避免重複送出。','error');}
 }finally{busy=false;lock();}
 if(saved&&next&&request.day<365)await loadDay(request.day+1,{skipGuard:true});
}
async function reconcile(){
 if(busy||!pending)return;busy=true;lock();say('正在核對資料庫中的版本…');
 try{const result=await api('get',{day:pending.day});const outcome=reconcileSave(result.item,pending);
  if(outcome==='saved'){show(result.item);say('已確認儲存成功，內容已發布。','success');}
  else if(outcome==='not_saved'){pending=null;say('已確認資料尚未變更，您可以重新按儲存。');}
  else if(outcome==='conflict'){pending=null;conflict=true;say(messages.revision_conflict,'error');}
  else say('尚無法確認結果，請稍後再次核對。','error');
 }catch(e){say(e.message+' 您的內容仍保留，請稍後再次核對。','error');}finally{busy=false;lock();}
}
async function openHistory(){
 if(busy||pending||!current)return;busy=true;lock();say('正在讀取修訂紀錄…');
 try{const result=await api('history',{day:current.day_number});$('history-list').replaceChildren();
  if(!result.items.length)$('history-list').append(node('p','尚無逐日修改。全年內容已依牧師指示統一核准；首次修改後會保留前後版本。'));
  for(const row of result.items){const section=node('section','','bt-history-row');section.append(node('h3',`版本 ${row.revision} · ${new Date(row.saved_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`),node('p',row.note||'未填寫修改說明'));
   const details=document.createElement('details');details.append(node('summary',row.values.devotional_title));for(const [key,label]of FIELDS)details.append(node('h4',label),node('p',row.values[key]||''));section.append(details);
   if(canEdit){const b=node('button','帶回編輯區','secondary');b.type='button';b.addEventListener('click',()=>{if(!guard.canLeave())return;for(const [key]of FIELDS)form.elements[key].value=row.values[key]||'';$('note').value=`採用版本 ${row.revision} 的內容`;guard.mark();$('history-dialog').close();say('舊版內容已帶入；尚未儲存，請確認後發布。');});section.append(b);}$('history-list').append(section);
  }$('history-dialog').showModal();say('');
 }catch(e){say(e.message,'error');}finally{busy=false;lock();}
}
async function start(){
 if(busy)return;busy=true;canEdit=false;lock();$('retry').hidden=true;setStatus($('status'),'正在確認帳號與載入全年內容…',{busy:true});
 try{if((new URLSearchParams(location.search).get('church')||'M+')!=='M+')throw new Error('此管理頁僅提供 M+ 使用。');const access=await readAccess(db,{fresh:true});if(!canOpen(access,'M+','tree_reading_admin'))throw new Error(messages.forbidden);actor=access.user.id;
  const result=await api('list');items=result.items;if(!Array.isArray(items)||items.length!==365)throw new Error('全年內容尚未完整載入，請重試。');
  $('workspace').hidden=false;$('summary').textContent=`${items.filter(i=>i.review_status==='reviewed').length}／365 已核准`;
  $('login').hidden=true;setStatus($('status'),`${access.user.name} · ${canEdit?'可編輯並發布':'唯讀'}`);renderDays();
 }catch(e){setStatus($('status'),e.message,{tone:'error'});$('login').hidden=false;$('retry').hidden=false;}
 finally{busy=false;lock();}
 if(items.length&&!current){const requested=Number(new URLSearchParams(location.search).get('day')||1);await loadDay(Number.isInteger(requested)&&requested>=1&&requested<=365?requested:1,{skipGuard:true});}
}
form.addEventListener('submit',e=>{e.preventDefault();void save();});$('save-next').addEventListener('click',()=>void save(true));
$('month').addEventListener('change',renderDays);$('search').addEventListener('input',renderDays);
$('date').addEventListener('change',async()=>{const item=items.find(i=>i.date===$('date').value);if(item)await loadDay(item.day);$('date').value=current?.reading_date||'';});
$('prev').addEventListener('click',()=>void loadDay(current.day_number-1));$('next').addEventListener('click',()=>void loadDay(current.day_number+1));
$('reload').addEventListener('click',()=>void loadDay(current.day_number));$('reconcile').addEventListener('click',()=>void reconcile());$('history').addEventListener('click',()=>void openHistory());$('close-history').addEventListener('click',()=>$('history-dialog').close());$('retry').addEventListener('click',()=>void start());
$('login').href='admin-login.html?next='+encodeURIComponent('bibletree-devotional-admin.html?church=M%2B');
for(const link of document.querySelectorAll('a:not([target="_blank"])'))link.addEventListener('click',e=>{if(busy||pending||!guard.canLeave())e.preventDefault();});
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||actor&&session?.user?.id&&actor!==session.user.id){canEdit=false;actor=null;lock();setStatus($('status'),'登入身分已變更，請重新登入。未儲存的文字仍保留在畫面。',{tone:'error'});$('login').hidden=false;}});
void start();
