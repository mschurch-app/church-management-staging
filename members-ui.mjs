import {editorDraft,lockControls} from './app-workflow.mjs?v=20261022-experience2';
import {readAccess,canOpen} from './admin-access.mjs?v=20261022-experience5';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {listMembers,saveMember,listMemberGroups,setMemberArchived,batchUpdateMembers,FIELDS} from './member-management.mjs?v=20261003-access-guard1';
import {FAITH_OPTIONS,ATTENDANCE_OPTIONS,DISTRICTS,loadMinistryOptions,preserveChoice,isInactive} from './member-options.mjs?v=20260924-custom2';
import {loadChurchCustomizations,catalog} from './church-customizations.mjs?v=20261009-stage2';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null;
const $=s=>document.querySelector(s),status=$('#status'),list=$('#list'),editor=$('#editor');
const draft=editorDraft(editor);let editorOwnerId=null,viewerId=null,restoreEditor=false,resumeInFlight=false,privateSuspended=false;
const groupTerm=church==='SHiNE'?'小家':'小組';
let page=0,search='',generation=0,busy=false,newcomersOnly=false,groupName='',sort='id',archivedOnly=false;
const selected=new Map();
let visibleRows=[];
let memberGroups=[];
let faithOptions=[...FAITH_OPTIONS],attendanceOptions=[...ATTENDANCE_OPTIONS],newcomerStages=['新朋友','已聯絡','持續關懷','加入小組／小家','穩定聚會'];
let compactView=false;
const text=(tag,value,cls='')=>{const el=document.createElement(tag);el.textContent=value;el.className=cls;return el;};
async function memberPhotoUrl(row){
 const value=String(row?.photo_url||'');
 if(value.startsWith(church+'/')){const {data,error}=await db.storage.from('newcomer-photos').createSignedUrl(value,600);return error?'':data?.signedUrl||'';}
 if(/^https:\/\/aqanuwilmvdtlzuqlrau\.supabase\.co\/storage\/v1\/object\/public\/church-media\/members\//.test(value))return value;
 return '';
}
function loadMemberAvatar(row,avatar){
 if(!row.photo_url)return;
 memberPhotoUrl(row).then(url=>{if(!url||!avatar.isConnected)return;const image=document.createElement('img');image.alt=(row.name||'會友')+'的照片';image.decoding='async';image.referrerPolicy='no-referrer';image.onload=()=>{if(!avatar.isConnected)return;avatar.replaceChildren(image);avatar.classList.add('has-photo');};image.src=url;});
}
function clear({preserveEditor=false}={}){generation++;list.replaceChildren();visibleRows=[];if(!preserveEditor){draft.dispose();editor.replaceChildren();editor.hidden=true;editorOwnerId=null;restoreEditor=false;}$('#new').disabled=true;$('#newcomer').disabled=true;$('#prev').disabled=true;$('#next').disabled=true;if(typeof exportButton!=='undefined')exportButton.disabled=true;updateBatchBar();}
function message(value,tone='neutral'){status.textContent=value;status.dataset.tone=tone;const inline=editor.querySelector('.editor-result');if(inline){inline.textContent=value;inline.dataset.tone=tone;}}
function updateBatchBar(){const bar=$('#batch-actions');if(bar)bar.hidden=selected.size===0;const count=$('#selected-count');if(count)count.textContent=String(selected.size);}
function updateBatchValues(){
 const field=$('#batch-field').value,current=$('#batch-value').value,values=field==='faith_status'?faithOptions:field==='group_name'?['未編組',...memberGroups]:attendanceOptions;
 $('#batch-value').replaceChildren(...values.map(value=>new Option(value,value)));
 if(values.includes(current))$('#batch-value').value=current;
}
function exportCsv(){if(!visibleRows.length){status.textContent='目前沒有可匯出的資料。';return;}const keys=['name','gender','phone','group_name','birthday','baptism_date','faith_status','district','growth_progress','ministry','memo','welcome_status','know_us_from','age_group'];const labels=['姓名','性別','電話','小組／小家','生日','受洗日期','信仰成熟度','居住區域','聚會近況','服事恩賜','備註','迎新狀態','認識管道','年齡層'];const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const csv='\\uFEFF'+[labels,...visibleRows.map(row=>keys.map(k=>row[k]))].map(row=>row.map(esc).join(',')).join('\\r\\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(church||'church')+'-members-page-'+(page+1)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportAllCsv(){if(!visibleRows.length){status.textContent='目前沒有可匯出的資料。';return;}if(busy||privateSuspended)return;busy=true;const all=[];try{for(let p=0;p<=10000;p++){status.textContent='正在準備匯出第 '+(p+1)+' 頁…';const result=await listMembers(db,church,search,p,newcomersOnly,{groupName,sort,archivedOnly});all.push(...result.rows);if(!result.hasNext)break;}const keys=['name','gender','phone','group_name','birthday','baptism_date','faith_status','district','growth_progress','ministry','memo','welcome_status','know_us_from','age_group'];const labels=['姓名','性別','電話','小組／小家','生日','受洗日期','信仰成熟度','居住區域','聚會近況','服事恩賜','備註','迎新狀態','認識管道','年齡層'];const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const csv='\\uFEFF'+[labels,...all.map(row=>keys.map(k=>row[k]))].map(row=>row.map(esc).join(',')).join('\\r\\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(church||'church')+'-members.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已匯出 '+all.length+' 筆會友資料。';}catch(error){status.textContent='匯出失敗：'+error.message;}finally{busy=false;}}
function setPageSelection(checked){for(const box of list.querySelectorAll('input[data-member-id]')){box.checked=checked;const row=box._memberRow;if(checked)selected.set(row.id,row);else selected.delete(row.id);}updateBatchBar();}
async function applyBatchChange(){
 if(busy||privateSuspended||!selected.size)return;
 const rows=[...selected.values()],field=$('#batch-field').value,value=$('#batch-value').value,labels={growth_progress:'聚會近況',faith_status:'信仰階段',group_name:'所屬'+groupTerm};
 const names=rows.slice(0,3).map(row=>row.name).join('、')+(rows.length>3?'等 '+rows.length+' 位':'');
 if(!window.confirm('確定將「'+names+'」的'+labels[field]+'調整為「'+value+'」嗎？\n\n這項變更會寫入操作日誌。'))return;
 busy=true;$('#batch-apply').disabled=true;status.textContent='正在批次更新 '+rows.length+' 位會友…';
 try{await batchUpdateMembers(db,church,rows,field,value);selected.clear();await load();status.textContent='已完成：'+rows.length+' 位會友的'+labels[field]+'已調整為「'+value+'」。';}
 catch(error){status.textContent=error.message;}
 finally{busy=false;$('#batch-apply').disabled=false;updateBatchBar();}
}
function selectControl(values,current){
 const input=document.createElement('select');
 for(const value of preserveChoice(values,current))input.append(new Option(value||'未填寫 / 未選擇',value));
 input.value=current;return input;
}
async function edit(row=null,isNewcomer=false){
 if(busy||privateSuspended||!draft.canLeave())return;
 const ticket=generation;busy=true;status.textContent='正在準備會友資料…';
 try{
  const access=await readAccess(db);if(!canOpen(access,church,'members'))throw Error('沒有此堂會的會友管理權限。');
  const [groupNames,availableMinistries]=await Promise.all([listMemberGroups(db,church),loadMinistryOptions(db,church,row?.ministry||'')]);if(ticket!==generation)return;
  draft.dispose();editor.replaceChildren();editor.hidden=false;editorOwnerId=access.user.id;
  const form=document.createElement('form'),grid=text('div','','edit-grid'),inputs={},getters={},supplement=document.createElement('details');let memoWrap;
  supplement.className='registration-details';supplement.append(text('summary','迎新跟進資料'));const extraGrid=text('div','','edit-grid');supplement.append(extraGrid);
  const heading=text('h2',row?'編輯會友資料':'新增會友資料');heading.tabIndex=-1;
  form.append(heading,text('p','保留原版欄位；日期可填完整年月日，原有月日資料也能保留。','muted'));
  for(const [key,[label,max]] of Object.entries(FIELDS)){
   if(['growth_progress','ministry'].includes(key))continue;
   const defaultValue={gender:'弟兄',group_name:'未編組',faith_status:'新朋友（初次聚會）',welcome_status:isNewcomer?'新朋友':''}[key]||'';
   const current=row?(row[key]??''):defaultValue;
   const wrap=text('label',key==='group_name'?'所屬'+groupTerm:label),input=
    key==='gender'?selectControl(['','弟兄','姊妹'],current):
    key==='group_name'?selectControl(['','未編組',...groupNames],current):
    key==='faith_status'?selectControl(['',...faithOptions],current):
    key==='welcome_status'?selectControl(['',...newcomerStages],current):
    key==='district'?selectControl(['',...(DISTRICTS[church]||[])],current):
    document.createElement(key==='memo'?'textarea':'input');
   if(!['gender','group_name','faith_status','welcome_status','district'].includes(key)){input.maxLength=max;input.value=current;}
   input.name=key;input.required=key==='name';
   if(key==='phone')input.type='tel';
   if(key==='birthday')input.placeholder='例如：1990/08/15；原資料僅有 08/15 也可保留';
   if(key==='baptism_date')input.placeholder='例如：2023/12/25';
   if(key==='memo')wrap.classList.add('full-width');
   wrap.append(input);if(key==='memo')memoWrap=wrap;else if(['welcome_status','know_us_from','age_group'].includes(key))extraGrid.append(wrap);else grid.append(wrap);inputs[key]=input;getters[key]=()=>input.value;
  }
  form.append(grid);
  const progressWrap=text('label','聚會近況'),progress=selectControl(['',...attendanceOptions],row?.growth_progress||attendanceOptions[0]||'');
  progressWrap.className='check-panel';progressWrap.append(progress);form.append(progressWrap);getters.growth_progress=()=>progress.value;
  const fieldset=document.createElement('fieldset');fieldset.append(text('legend','服事恩賜'));
  const chips=text('div','','choice-grid'),selected=new Set((row?.ministry||'').split(',').map(s=>s.trim()).filter(Boolean));let ministryChanged=false;
  for(const option of availableMinistries){
   const label=text('label','','choice'),box=document.createElement('input');box.type='checkbox';box.checked=selected.has(option);
   box.onchange=()=>{ministryChanged=true;if(box.checked)selected.add(option);else selected.delete(option);};
   label.append(box,text('span',option));chips.append(label);
  }
  fieldset.append(chips);form.append(fieldset,memoWrap,supplement);getters.ministry=()=>row&&!ministryChanged?(row.ministry??''):[...selected].join(', ');
  if(row){
   const details=document.createElement('details');details.className='registration-details';details.append(text('summary','查看迎新填答與照片'));
   details.append(text('p','期待感受：'+(row.desired_feelings||[]).join('、')),text('p','生活興趣：'+(row.interest_tags||[]).join('、')));
   if(row.photo_url){
    const photoStatus=text('p','照片載入中…');details.append(photoStatus);
    memberPhotoUrl(row).then(url=>{
     if(!form.isConnected)return;if(!url){photoStatus.textContent='照片尚未完成上傳或無權查看。';return;}
     const img=document.createElement('img');img.alt='新朋友照片';img.className='member-photo';img.referrerPolicy='no-referrer';img.src=url;photoStatus.replaceWith(img);
    });
   }
   form.append(details);
  }
  const actions=text('div','','editor-actions'),save=text('button','確認儲存'),cancel=text('button','取消','secondary');cancel.type='button';
  cancel.onclick=()=>{if(busy||privateSuspended||!draft.canLeave())return;draft.dispose();editor.replaceChildren();editor.hidden=true;editorOwnerId=null;};
  save.type='submit';const inline=text('p','','editor-result');inline.setAttribute('aria-live','off');actions.append(cancel,save);form.append(inline,actions);editor.append(form);draft.attach(form);heading.focus();status.textContent='已載入，可編輯會友資料。';
  form.onsubmit=async event=>{
   event.preventDefault();if(busy||privateSuspended||!form.reportValidity())return;busy=true;const unlock=lockControls(form);message('正在儲存會友資料，請稍候…','busy');
   try{
    const saved=await saveMember(db,church,Object.fromEntries(Object.entries(getters).map(([k,get])=>[k,get()])),row);
    if(!form.isConnected)return;
    draft.clear();draft.dispose();editor.replaceChildren();editor.hidden=true;editorOwnerId=null;restoreEditor=false;
    const loaded=document.hidden?false:await load();
    message(saved.newcomerNotification==='failed'?'新朋友資料已儲存，但 LINE 群組通知未送出，請聯絡系統管理員。':loaded?'已儲存並重新載入名單。':'會友資料已儲存，名單尚未更新；請重新查詢，勿重複新增。',saved.newcomerNotification==='failed'||!loaded?'warning':'success');
   }catch(error){if(form.isConnected)message(error.message,'error');}
   finally{unlock();busy=false;}
  };
 }catch(error){if(ticket===generation)status.textContent=error.message;}finally{busy=false;}
}
function memberCard(row){
 const card=text('article','','member-card'),head=text('div','','card-head'),avatar=text('span',(row.name||'？').slice(0,1),'avatar');
 loadMemberAvatar(row,avatar);
 const nameBox=text('div');nameBox.append(text('h3',row.name),text('p',(row.gender||'未填性別')+' · '+(row.group_name||'未編組'),'muted'));
 const statusRow=text('div','','member-status-row');statusRow.append(text('span',row.faith_status||'未填信仰階段','status-badge'),text('span',row.growth_progress||'未填聚會近況','status-badge attendance-badge'),text('span',row.line_bound?'已綁定 LINE':'尚未綁定 LINE','status-badge '+(row.line_bound?'line-bound-badge':'line-unbound-badge')));
 head.append(avatar,nameBox);card.append(head,statusRow);
 const dl=document.createElement('dl');
 for(const [label,value] of [['電話',row.phone],['居住區域',row.district],['服事恩賜',row.ministry]]){dl.append(text('dt',label),text('dd',value||'未填寫'));}
 card.append(dl);
 if(row.memo)card.append(text('p',row.memo,'memo-preview'));
 const actions=text('div','','card-actions'),pick=document.createElement('input');pick.type='checkbox';pick.dataset.memberId=row.id;pick._memberRow=row;pick.checked=selected.has(row.id);pick.setAttribute('aria-label','選取 '+(row.name||'會友'));pick.onchange=()=>{if(pick.checked)selected.set(row.id,row);else selected.delete(row.id);updateBatchBar();};actions.append(pick,text('span','選取'));const editButton=text('button','編輯資料','secondary');editButton.onclick=()=>{if(!busy)edit(row);};const archiveButton=text('button',row.archived_at?'恢復':'封存','secondary');archiveButton.onclick=async()=>{if(busy||privateSuspended||!confirm((row.archived_at?'恢復 ':'封存 ')+row.name+'？資料不會被刪除。'))return;busy=true;try{await setMemberArchived(db,church,row,!row.archived_at);await load();status.textContent=row.archived_at?'已恢復會友。':'已封存會友。';}catch(error){status.textContent=error.message;}finally{busy=false;}};actions.append(editButton,archiveButton);card.append(actions);return card;
}
async function load({preserveEditor=false}={}){
 if(!preserveEditor&&!draft.canLeave())return false;
 clear({preserveEditor});list.setAttribute('aria-busy','true');const ticket=generation;message('正在載入…','busy');
 try{
  const result=await listMembers(db,church,search,page,newcomersOnly,{groupName,sort,archivedOnly});if(ticket!==generation||document.hidden)return false;viewerId=(await readAccess(db)).user.id;if(ticket!==generation||document.hidden)return false;visibleRows=result.rows;if(typeof exportButton!=='undefined')exportButton.disabled=!visibleRows.length;
  $('#new').disabled=false;$('#newcomer').disabled=false;$('#prev').disabled=page===0;$('#next').disabled=!result.hasNext;
  $('#page-label').textContent='第 '+(page+1)+' 頁';
  message(result.rows.length?'本頁顯示 '+result.rows.length+' 位會友。':'沒有符合條件的會友，請調整查詢條件。');
  const active=result.rows.filter(r=>!isInactive(r.growth_progress)),inactive=result.rows.filter(r=>isInactive(r.growth_progress));
  const grid=text('div','','member-grid');active.forEach(r=>grid.append(memberCard(r)));list.append(grid);
  if(inactive.length){
   const drawer=document.createElement('details');drawer.className='inactive-drawer';drawer.append(text('summary','很久沒來 · 待關懷羊群（本頁 '+inactive.length+' 人）'));
   const cards=text('div','','member-grid');inactive.forEach(r=>cards.append(memberCard(r)));drawer.append(cards);list.append(drawer);
  }
  const pageBoxes=[...list.querySelectorAll('input[data-member-id]')];selectPageButton.textContent=pageBoxes.length&&pageBoxes.every(box=>box.checked)?'取消本頁選取':'選取本頁';
 return true;
 }catch(error){if(ticket===generation)message(error.message,'error');return false;}finally{if(ticket===generation)list.removeAttribute('aria-busy');}
}

$('#title').textContent=(church==='M+'?'M＋大雅教會':church==='SHiNE'?'火樂教會':'')+' · 會友與新朋友名冊';
$('#dashboard').href='admin-dashboard.html?church='+encodeURIComponent(church||'');
$('#review').href='binding-review.html?church='+encodeURIComponent(church||'');
const auditLink=text('a','操作日誌');auditLink.href='member-audit.html?church='+encodeURIComponent(church||'');$('.page-nav').append(auditLink);
const archivedLabel=text('label','','check-row'),archivedBox=document.createElement('input');archivedBox.type='checkbox';archivedLabel.append(archivedBox,text('span','查看已封存會友'));$('#search-form').append(archivedLabel);
$('#search-form').onsubmit=event=>{event.preventDefault();if(busy||privateSuspended)return;search=$('#search').value;groupName=$('#group-filter').value;sort=$('#sort-order').value;newcomersOnly=$('#newcomers-only').checked;archivedOnly=archivedBox.checked;page=0;selected.clear();load();};
$('#new').onclick=()=>{if(!busy)edit();};$('#newcomer').onclick=()=>{if(!busy)edit(null,true);};
const exportButton=text('button','匯出本頁 CSV','secondary');exportButton.disabled=true;exportButton.onclick=exportCsv;$('.toolbar-actions').append(exportButton);const originalLoad=load;const refreshExport=()=>{exportButton.disabled=!visibleRows.length||busy;};
exportButton.textContent='匯出全部 CSV';
const viewButton=text('button','切換表格檢視','secondary');viewButton.type='button';viewButton.onclick=()=>{compactView=!compactView;list.classList.toggle('compact-member-list',compactView);viewButton.textContent=compactView?'切換卡片檢視':'切換表格檢視';};$('.toolbar-actions').append(viewButton);
$('#batch-field').onchange=updateBatchValues;$('#batch-apply').onclick=applyBatchChange;$('#batch-clear').onclick=()=>{selected.clear();for(const box of list.querySelectorAll('input[data-member-id]'))box.checked=false;updateBatchBar();};updateBatchValues();
$('#prev').onclick=()=>{if(!busy&&page>0){page--;load();}};$('#next').onclick=()=>{if(!busy){page++;load();}};
$('#logout').onclick=async()=>{if(busy||privateSuspended||!draft.canLeave())return;clear();selected.clear();await db.auth.signOut();location.replace('admin-login.html');};
async function resume(){
 if(document.hidden||resumeInFlight)return;resumeInFlight=true;const ticket=generation;
 try{message('正在重新確認登入與權限…','busy');const access=await readAccess(db,{fresh:true});if(ticket!==generation||document.hidden)return;
  if(!canOpen(access,church,'members')){clear();selected.clear();updateBatchBar();$('#resume-editor').hidden=false;message('帳號或權限已變更，原編輯內容已關閉。請重新核對權限。','error');return;}
  if((editorOwnerId&&editorOwnerId!==access.user.id)||(viewerId&&viewerId!==access.user.id)){clear();selected.clear();updateBatchBar();viewerId=access.user.id;const loaded=await load();privateSuspended=!loaded;$('#resume-editor').hidden=loaded;message(loaded?'帳號或權限已變更，原編輯內容已關閉；已依目前帳號重新讀取名單。':'帳號已變更，原編輯內容已關閉；名單尚未讀取，請重試恢復。','warning');return;}
  const keep=restoreEditor&&!!editor.querySelector('form'),loaded=await load({preserveEditor:keep});
  if(loaded&&!document.hidden){privateSuspended=false;editor.hidden=!keep;restoreEditor=false;$('#resume-editor').hidden=true;if(keep)message('已恢復原本的編輯內容，尚未儲存的修改仍保留。');}
  else if(keep)$('#resume-editor').hidden=false;
 }catch(error){message('尚無法核對登入與權限，編輯內容暫時隱藏；請重試恢復。','warning');$('#resume-editor').hidden=false;}
 finally{resumeInFlight=false;}
}
$('#resume-editor').onclick=resume;
document.addEventListener('visibilitychange',()=>{if(document.hidden){privateSuspended=true;$('#resume-editor').hidden=false;restoreEditor=restoreEditor||(!editor.hidden&&!!editor.querySelector('form'));clear({preserveEditor:true});editor.hidden=true;}else void resume();});
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){privateSuspended=true;clear();selected.clear();updateBatchBar();status.textContent='已登出，請重新登入。';}});
exportButton.onclick=exportAllCsv;
const selectPageButton=text('button','選取本頁','secondary');selectPageButton.type='button';selectPageButton.onclick=()=>{const boxes=[...list.querySelectorAll('input[data-member-id]')],allSelected=boxes.length&&boxes.every(box=>box.checked);setPageSelection(!allSelected);selectPageButton.textContent=allSelected?'選取本頁':'取消本頁選取';};$('.toolbar-actions').append(selectPageButton);
Promise.all([listMemberGroups(db,church),loadChurchCustomizations(db,church)]).then(([groups,settings])=>{memberGroups=groups;faithOptions=catalog(settings,'faith_status',FAITH_OPTIONS);attendanceOptions=catalog(settings,'growth_progress',ATTENDANCE_OPTIONS);newcomerStages=catalog(settings,'newcomer_stages',newcomerStages);const select=$('#group-filter');for(const name of groups)select.append(new Option(name,name));updateBatchValues();}).catch(()=>{}).finally(load);
