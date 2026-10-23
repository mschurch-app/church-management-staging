import {db} from './admin-db.mjs?v=20261012-readable2';
import {dashboardAccess} from './dashboard-management.mjs?v=20261009-stage2';
import {loadCareCases,saveCareUpdate} from './newcomer-care-management.mjs?v=20261003-access-guard1';
import {editorDraft,lockControls} from './app-workflow.mjs?v=20261022-experience2';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),editor=$('#care-editor'),draft=editorDraft(editor);
let church,rows=[],busy=false,loading=false,needsRefresh=false,selected=null,filterValue='open',searchValue='',generation=0;
const stageLabels={new:'新登記',first_contacted:'已第一次聯絡',return_visit:'再次聚會',group_connection:'連結小組',stable:'穩定聚會',decision:'信仰決志',baptism:'預備／完成受洗',family:'成為教會家人'},methodLabels={line:'LINE',phone:'電話',meeting:'當面',other:'其他'};
const fmt=value=>value?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'未設定',el=(tag,text='',cls='')=>Object.assign(document.createElement(tag),{textContent:text,className:cls});
function closeEditor(){draft.dispose();selected=null;editor.hidden=true;editor.replaceChildren();}
function render(){
 $('main').setAttribute('aria-busy',String(busy||loading));
 const open=rows.filter(r=>r.status==='open').length,overdue=rows.filter(r=>r.is_overdue).length,due=rows.filter(r=>r.due_soon).length;
 $('#summary').replaceChildren(...[[open,'關懷中'],[overdue,'已逾期'],[due,'24 小時內到期']].map(([count,label])=>{const a=el('article');a.append(el('strong',String(count)),el('span',label));return a;}));
 const query=searchValue.trim().toLocaleLowerCase(),visible=rows.filter(r=>(filterValue==='all'||(filterValue==='overdue'?r.is_overdue:r.status==='open'))&&(!query||[r.member_name,...(r.assignee_names||[])].some(v=>String(v||'').toLocaleLowerCase().includes(query)))),area=$('#cases');area.replaceChildren();
 for(const row of visible){const card=el('article','',`care-card${row.is_overdue?' overdue':''}`),head=el('div','','care-head');card.dataset.selected=String(selected===row.id);head.append(el('h2',row.member_name),el('span',stageLabels[row.stage]||row.stage,'status-badge'));const meta=el('div','','care-meta');meta.append(el('span','負責：'+(row.assignee_names?.join('、')||'尚未分派')),el('span','期限：'+fmt(row.effective_due_at),'due'));const button=el('button','開啟關懷紀錄','secondary');button.type='button';button.disabled=busy||loading||needsRefresh;button.onclick=()=>edit(row);card.append(head,meta,el('p',row.next_step||'尚未記錄下一步','muted'),button);area.append(card);}
 if(!visible.length)area.append(el('p','目前沒有符合條件的新朋友關懷案件。','care-empty'));$('#care-count').textContent='顯示 '+visible.length+' / '+rows.length+' 位新朋友。';
}
function control(tag,key,label,value,options){const wrap=el('label',label),input=document.createElement(tag);input.name=key;if(options)for(const [v,t] of options)input.append(new Option(t,v));input.value=value||'';wrap.append(input);return [wrap,input];}
function edit(row){
 if(busy||loading||needsRefresh||!draft.canLeave())return;closeEditor();selected=row.id;editor.hidden=false;
 const form=el('form','','care-form'),[stageWrap,stage]=control('select','stage','目前階段',row.stage,Object.entries(stageLabels)),[methodWrap,method]=control('select','contactMethod','這次聯絡方式（選填）','',[['','未聯絡'],...Object.entries(methodLabels)]),[dateWrap,date]=control('input','nextFollowUpAt','下次關懷時間（選填）','');date.type='datetime-local';date.value=row.next_follow_up_at?new Date(row.next_follow_up_at).toLocaleString('sv-SE',{timeZone:'Asia/Taipei'}).slice(0,16).replace(' ','T'):'';
 const [summaryWrap,summary]=control('textarea','summary','本次關懷摘要（選填）',''),[nextWrap,next]=control('textarea','nextStep','下一步（選填）',row.next_step||'');summaryWrap.className=nextWrap.className='wide';summary.placeholder='記下本次聯絡的近況與代禱需要';
 const result=el('p','','status-message editor-result');result.setAttribute('role','status');const actions=el('div','','care-actions'),cancel=el('button','取消','secondary'),save=el('button','儲存關懷紀錄'),complete=el('button','完成關懷','secondary');cancel.type=complete.type='button';save.type='submit';cancel.onclick=()=>{if(!busy&&draft.canLeave()){closeEditor();render();}};
 const submit=async shouldClose=>{
  if(busy||loading||!form.reportValidity())return;if(shouldClose&&!confirm('確定完成 '+row.member_name+' 的關懷流程？'))return;
  const payload={caseId:row.id,stage:stage.value,contactMethod:method.value,summary:summary.value.trim(),nextStep:next.value.trim(),nextFollowUpAt:date.value?new Date(date.value).toISOString():null,close:shouldClose},ticket=generation;
  busy=true;const unlock=lockControls(form);result.textContent='正在儲存…';
  try{await saveCareUpdate(db,church,payload);if(ticket!==generation)return;needsRefresh=true;closeEditor();const refreshed=await load();$('#status').textContent=(shouldClose?'已完成這位新朋友的關懷流程。':'關懷紀錄已儲存。')+(refreshed?'':'清單尚未更新，請重新讀取，勿重複新增紀錄。');}
  catch(error){if(ticket===generation)result.textContent=error.message;}finally{busy=false;unlock();render();}
 };
 form.onsubmit=event=>{event.preventDefault();void submit(false);};complete.onclick=()=>submit(true);actions.append(cancel,save);if(row.status==='open')actions.append(complete);
 form.append(el('h2',row.member_name+' · 關懷紀錄'),stageWrap,methodWrap,dateWrap,summaryWrap,nextWrap,result,actions);editor.append(el('p','電話：'+(row.member_phone||'未填寫')+' · 登記：'+fmt(row.first_visit_at),'muted'),form);
 const history=el('details','','history'),summaryTitle=el('summary','關懷歷程（'+(row.history?.length||0)+'）');history.append(summaryTitle);for(const h of row.history||[]){const item=el('div','','history-item');item.append(el('strong',(methodLabels[h.contact_method]||'紀錄')+' · '+fmt(h.created_at)),el('p',h.summary||'沒有摘要'),el('small',h.next_step?'下一步：'+h.next_step:''));history.append(item);}editor.append(history);draft.attach(form);render();editor.scrollIntoView({block:'start'});stage.focus();
}
async function load(){
 if(loading)return false;loading=true;$('main').setAttribute('aria-busy','true');const ticket=++generation;$('#refresh').disabled=true;$('#status').textContent='正在載入…';
 try{const data=await loadCareCases(db,church);if(ticket!==generation)return false;rows=data;needsRefresh=false;render();$('#status').textContent='共載入 '+rows.length+' 位新朋友的關懷資料。';return true;}
 catch(error){if(ticket===generation){if(/權限|登入/.test(error.message)){rows=[];closeEditor();}$('#status').textContent='清單尚未更新：'+error.message;}return false;}finally{if(ticket===generation){loading=false;$('#refresh').disabled=false;render();}}
}
function changeFilter(){if(busy||loading||!draft.canLeave()){$('#filter').value=filterValue;$('#care-search').value=searchValue;return;}filterValue=$('#filter').value;searchValue=$('#care-search').value;closeEditor();render();}
$('#filter').onchange=changeFilter;$('#care-search-apply').onclick=changeFilter;$('#care-search').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();changeFilter();}};$('#refresh').onclick=()=>{if(!busy&&!loading&&draft.canLeave()){closeEditor();void load();}};
$('#logout').onclick=async()=>{if(busy||!draft.canLeave())return;closeEditor();await db.auth.signOut();location.replace('admin-login.html');};db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){generation++;closeEditor();rows=[];loading=false;render();$('#status').textContent='已登出，請重新登入。';}});
async function init(){try{const ticket=generation,result=await dashboardAccess(db,params.get('church'));if(ticket!==generation)return;church=result.church;$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 新朋友持續關懷';if($('#dashboard'))$('#dashboard').href='admin-dashboard.html?church='+encodeURIComponent(church);if($('#members'))$('#members').href='members.html?church='+encodeURIComponent(church);const requested=params.get('filter');if(['open','overdue','all'].includes(requested))$('#filter').value=requested;filterValue=$('#filter').value;await load();}catch(error){$('#status').textContent=error.message;}}init();
