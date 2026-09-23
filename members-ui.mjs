import {db} from './admin-db.mjs';
import {listMembers,saveMember,listMemberGroups,setMemberArchived,batchUpdateMembers,FIELDS} from './member-management.mjs?v=20260923-members5';
import {FAITH_OPTIONS,ATTENDANCE_OPTIONS,DISTRICTS,loadMinistryOptions,preserveChoice,isInactive} from './member-options.mjs?v=20260923-members5';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null;
const $=s=>document.querySelector(s),status=$('#status'),list=$('#list'),editor=$('#editor');
const groupTerm=church==='SHiNE'?'小家':'小組';
let page=0,search='',generation=0,busy=false,newcomersOnly=false,groupName='',sort='id',archivedOnly=false;
const selected=new Map();
let visibleRows=[];
let memberGroups=[];
let compactView=false;
const text=(tag,value,cls='')=>{const el=document.createElement(tag);el.textContent=value;el.className=cls;return el;};
function clear(){generation++;list.replaceChildren();editor.replaceChildren();editor.hidden=true;$('#new').disabled=true;$('#newcomer').disabled=true;$('#prev').disabled=true;$('#next').disabled=true;updateBatchBar();}
function updateBatchBar(){const bar=$('#batch-actions');if(bar)bar.hidden=selected.size===0;const count=$('#selected-count');if(count)count.textContent=String(selected.size);}
function updateBatchValues(){
 const field=$('#batch-field').value,current=$('#batch-value').value,values=field==='faith_status'?FAITH_OPTIONS:field==='group_name'?['未編組',...memberGroups]:ATTENDANCE_OPTIONS;
 $('#batch-value').replaceChildren(...values.map(value=>new Option(value,value)));
 if(values.includes(current))$('#batch-value').value=current;
}
function exportCsv(){if(!visibleRows.length){status.textContent='目前沒有可匯出的資料。';return;}const keys=['name','gender','phone','group_name','birthday','baptism_date','faith_status','district','growth_progress','ministry','memo','welcome_status','know_us_from','age_group'];const labels=['姓名','性別','電話','小組／小家','生日','受洗日期','信仰成熟度','居住區域','聚會近況','服事恩賜','備註','迎新狀態','認識管道','年齡層'];const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const csv='\\uFEFF'+[labels,...visibleRows.map(row=>keys.map(k=>row[k]))].map(row=>row.map(esc).join(',')).join('\\r\\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(church||'church')+'-members-page-'+(page+1)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportAllCsv(){if(!visibleRows.length){status.textContent='目前沒有可匯出的資料。';return;}if(busy)return;busy=true;const all=[];try{for(let p=0;p<=10000;p++){status.textContent='正在準備匯出第 '+(p+1)+' 頁…';const result=await listMembers(db,church,search,p,newcomersOnly,{groupName,sort});all.push(...result.rows);if(!result.hasNext)break;}const keys=['name','gender','phone','group_name','birthday','baptism_date','faith_status','district','growth_progress','ministry','memo','welcome_status','know_us_from','age_group'];const labels=['姓名','性別','電話','小組／小家','生日','受洗日期','信仰成熟度','居住區域','聚會近況','服事恩賜','備註','迎新狀態','認識管道','年齡層'];const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const csv='\\uFEFF'+[labels,...all.map(row=>keys.map(k=>row[k]))].map(row=>row.map(esc).join(',')).join('\\r\\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(church||'church')+'-members.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已匯出 '+all.length+' 筆會員資料。';}catch(error){status.textContent='匯出失敗：'+error.message;}finally{busy=false;}}
function setPageSelection(checked){for(const box of list.querySelectorAll('input[data-member-id]')){box.checked=checked;const row=box._memberRow;if(checked)selected.set(row.id,row);else selected.delete(row.id);}updateBatchBar();}
async function applyBatchChange(){
 if(busy||!selected.size)return;
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
 const ticket=generation;busy=true;status.textContent='正在準備會友資料…';
 try{
  const [groupNames,availableMinistries]=await Promise.all([listMemberGroups(db,church),loadMinistryOptions(db,church,row?.ministry||'')]);if(ticket!==generation)return;
  editor.replaceChildren();editor.hidden=false;
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
    key==='faith_status'?selectControl(['',...FAITH_OPTIONS],current):
    key==='district'?selectControl(['',...(DISTRICTS[church]||[])],current):
    document.createElement(key==='memo'?'textarea':'input');
   if(!['gender','group_name','faith_status','district'].includes(key)){input.maxLength=max;input.value=current;}
   input.name=key;input.required=key==='name';
   if(key==='phone')input.type='tel';
   if(key==='birthday')input.placeholder='例如：1990/08/15；原資料僅有 08/15 也可保留';
   if(key==='baptism_date')input.placeholder='例如：2023/12/25';
   if(key==='memo')wrap.classList.add('full-width');
   wrap.append(input);if(key==='memo')memoWrap=wrap;else if(['welcome_status','know_us_from','age_group'].includes(key))extraGrid.append(wrap);else grid.append(wrap);inputs[key]=input;getters[key]=()=>input.value;
  }
  form.append(grid);
  const inactiveLabel=text('label','','check-panel'),inactive=document.createElement('input');inactive.type='checkbox';inactive.checked=isInactive(row?.growth_progress);
  let inactiveChanged=false;inactive.onchange=()=>inactiveChanged=true;
  inactiveLabel.append(inactive,text('span','很久沒來（勾選後暫時移至名冊底部收納區）'));form.append(inactiveLabel);
  getters.growth_progress=()=>row&&!inactiveChanged?(row.growth_progress??''):inactive.checked?'很久沒來(都沒出現）':'穩定聚會(8成以上)';
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
   if(row.photo_url?.startsWith(church+'/')){
    const photoStatus=text('p','照片載入中…');details.append(photoStatus);
    db.storage.from('newcomer-photos').createSignedUrl(row.photo_url,60).then(({data,error})=>{
     if(!form.isConnected)return;if(error){photoStatus.textContent='照片尚未完成上傳或無權查看。';return;}
     const img=document.createElement('img');img.alt='新朋友照片';img.className='member-photo';img.src=data.signedUrl;photoStatus.replaceWith(img);
    });
   }
   form.append(details);
  }
  const actions=text('div','','editor-actions'),save=text('button','確認儲存'),cancel=text('button','取消','secondary');cancel.type='button';
  cancel.onclick=()=>{editor.replaceChildren();editor.hidden=true;};
  actions.append(cancel,save);form.append(actions);editor.append(form);heading.focus();status.textContent='已載入，可編輯會友資料。';
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;busy=true;form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=true);
   const submitTicket=generation;
   try{await saveMember(db,church,Object.fromEntries(Object.entries(getters).map(([k,get])=>[k,get()])),row);if(submitTicket===generation){await load();status.textContent='已儲存並重新載入名單。';}}
   catch(error){if(submitTicket===generation){status.textContent=error.message;form.querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false);}}
   finally{busy=false;}
  };
 }catch(error){if(ticket===generation)status.textContent=error.message;}finally{busy=false;}
}
function memberCard(row){
 const card=text('article','','member-card'),head=text('div','','card-head'),avatar=text('span',(row.name||'？').slice(0,1),'avatar');
 const nameBox=text('div');nameBox.append(text('h3',row.name),text('p',(row.gender||'未填性別')+' · '+(row.group_name||'未編組'),'muted'));
 const statusRow=text('div','','member-status-row');statusRow.append(text('span',row.faith_status||'未填信仰階段','status-badge'),text('span',row.growth_progress||'未填聚會近況','status-badge attendance-badge'));
 head.append(avatar,nameBox);card.append(head,statusRow);
 const dl=document.createElement('dl');
 for(const [label,value] of [['電話',row.phone],['居住區域',row.district],['服事恩賜',row.ministry]]){dl.append(text('dt',label),text('dd',value||'未填寫'));}
 card.append(dl);
 if(row.memo)card.append(text('p',row.memo,'memo-preview'));
 const actions=text('div','','card-actions'),pick=document.createElement('input');pick.type='checkbox';pick.dataset.memberId=row.id;pick._memberRow=row;pick.checked=selected.has(row.id);pick.setAttribute('aria-label','選取 '+(row.name||'會友'));pick.onchange=()=>{if(pick.checked)selected.set(row.id,row);else selected.delete(row.id);updateBatchBar();};actions.append(pick,text('span','選取'));const editButton=text('button','編輯資料','secondary');editButton.onclick=()=>{if(!busy)edit(row);};const archiveButton=text('button',row.archived_at?'恢復':'封存','secondary');archiveButton.onclick=async()=>{if(busy||!confirm((row.archived_at?'恢復 ':'封存 ')+row.name+'？資料不會被刪除。'))return;busy=true;try{await setMemberArchived(db,church,row,!row.archived_at);await load();status.textContent=row.archived_at?'已恢復會員。':'已封存會員。';}catch(error){status.textContent=error.message;}finally{busy=false;}};actions.append(editButton,archiveButton);card.append(actions);return card;
}
async function load(){
 clear();const ticket=generation;status.textContent='正在載入…';
 try{
  const result=await listMembers(db,church,search,page,newcomersOnly,{groupName,sort,archivedOnly});if(ticket!==generation)return;visibleRows=result.rows;if(typeof exportButton!=='undefined')exportButton.disabled=!visibleRows.length;
  $('#new').disabled=false;$('#newcomer').disabled=false;$('#prev').disabled=page===0;$('#next').disabled=!result.hasNext;
  $('#page-label').textContent='第 '+(page+1)+' 頁';
  status.textContent=result.rows.length?'本頁顯示 '+result.rows.length+' 位會友。':'沒有符合條件的會友，請調整查詢條件。';
  const active=result.rows.filter(r=>!isInactive(r.growth_progress)),inactive=result.rows.filter(r=>isInactive(r.growth_progress));
  const grid=text('div','','member-grid');active.forEach(r=>grid.append(memberCard(r)));list.append(grid);
  if(inactive.length){
   const drawer=document.createElement('details');drawer.className='inactive-drawer';drawer.append(text('summary','很久沒來 · 待關懷羊群（本頁 '+inactive.length+' 人）'));
   const cards=text('div','','member-grid');inactive.forEach(r=>cards.append(memberCard(r)));drawer.append(cards);list.append(drawer);
  }
  const pageBoxes=[...list.querySelectorAll('input[data-member-id]')];selectPageButton.textContent=pageBoxes.length&&pageBoxes.every(box=>box.checked)?'取消本頁選取':'選取本頁';
 }catch(error){if(ticket===generation)status.textContent=error.message;}
}
$('#title').textContent=(church==='M+'?'M＋大雅教會':church==='SHiNE'?'火樂教會':'')+' · 會友名冊';
$('#dashboard').href='admin-dashboard.html?church='+encodeURIComponent(church||'');
$('#review').href='binding-review.html?church='+encodeURIComponent(church||'');
const auditLink=text('a','操作日誌');auditLink.href='member-audit.html?church='+encodeURIComponent(church||'');$('.page-nav').append(auditLink);
const archivedLabel=text('label','','check-row'),archivedBox=document.createElement('input');archivedBox.type='checkbox';archivedLabel.append(archivedBox,text('span','查看已封存會員'));$('#search-form').append(archivedLabel);
$('#search-form').onsubmit=event=>{event.preventDefault();if(busy)return;search=$('#search').value;groupName=$('#group-filter').value;sort=$('#sort-order').value;newcomersOnly=$('#newcomers-only').checked;archivedOnly=archivedBox.checked;page=0;selected.clear();load();};
$('#new').onclick=()=>{if(!busy)edit();};$('#newcomer').onclick=()=>{if(!busy)edit(null,true);};
const exportButton=text('button','匯出本頁 CSV','secondary');exportButton.disabled=true;exportButton.onclick=exportCsv;$('.toolbar-actions').append(exportButton);const originalLoad=load;const refreshExport=()=>{exportButton.disabled=!visibleRows.length||busy;};
exportButton.textContent='匯出全部 CSV';
const viewButton=text('button','切換表格檢視','secondary');viewButton.type='button';viewButton.onclick=()=>{compactView=!compactView;list.classList.toggle('compact-member-list',compactView);viewButton.textContent=compactView?'切換卡片檢視':'切換表格檢視';};$('.toolbar-actions').append(viewButton);
$('#batch-field').onchange=updateBatchValues;$('#batch-apply').onclick=applyBatchChange;$('#batch-clear').onclick=()=>{selected.clear();for(const box of list.querySelectorAll('input[data-member-id]'))box.checked=false;updateBatchBar();};updateBatchValues();
$('#prev').onclick=()=>{if(!busy&&page>0){page--;load();}};$('#next').onclick=()=>{if(!busy){page++;load();}};
$('#logout').onclick=async()=>{clear();await db.auth.signOut();location.replace('admin-login.html');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else load();});
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();status.textContent='已登出，請重新登入。';}});
exportButton.onclick=exportAllCsv;
const selectPageButton=text('button','選取本頁','secondary');selectPageButton.type='button';selectPageButton.onclick=()=>{const boxes=[...list.querySelectorAll('input[data-member-id]')],allSelected=boxes.length&&boxes.every(box=>box.checked);setPageSelection(!allSelected);selectPageButton.textContent=allSelected?'選取本頁':'取消本頁選取';};$('.toolbar-actions').append(selectPageButton);
listMemberGroups(db,church).then(groups=>{memberGroups=groups;const select=$('#group-filter');for(const name of groups)select.append(new Option(name,name));updateBatchValues();}).catch(()=>{});
load();
