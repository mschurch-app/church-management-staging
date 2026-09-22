import {db} from './admin-db.mjs';
import {listMembers,saveMember,listMemberGroups,FIELDS} from './member-management.mjs?v=20260922-members2';
import {FAITH_OPTIONS,DISTRICTS,ministryOptions,preserveChoice,isInactive} from './member-options.mjs';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null;
const $=s=>document.querySelector(s),status=$('#status'),list=$('#list'),editor=$('#editor');
const groupTerm=church==='SHiNE'?'小家':'小組';
let page=0,search='',generation=0,busy=false,newcomersOnly=false;
const text=(tag,value,cls='')=>{const el=document.createElement(tag);el.textContent=value;el.className=cls;return el;};
function clear(){generation++;list.replaceChildren();editor.replaceChildren();editor.hidden=true;$('#new').disabled=true;$('#newcomer').disabled=true;$('#prev').disabled=true;$('#next').disabled=true;}
function selectControl(values,current){
 const input=document.createElement('select');
 for(const value of preserveChoice(values,current))input.append(new Option(value||'未填寫 / 未選擇',value));
 input.value=current;return input;
}
async function edit(row=null,isNewcomer=false){
 const ticket=generation;busy=true;status.textContent='正在準備會友資料…';
 try{
  const groupNames=await listMemberGroups(db,church);if(ticket!==generation)return;
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
  const fieldset=document.createElement('fieldset');fieldset.append(text('legend','服事恩賜 / 興趣標籤'));
  const chips=text('div','','choice-grid'),selected=new Set((row?.ministry||'').split(',').map(s=>s.trim()).filter(Boolean));let ministryChanged=false;
  for(const option of ministryOptions(church,row?.ministry||'')){
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
 head.append(avatar,nameBox);card.append(head,text('p',row.faith_status||'未填信仰成熟度','status-badge'));
 const dl=document.createElement('dl');
 for(const [label,value] of [['電話',row.phone],['居住區域',row.district],['服事恩賜',row.ministry]]){dl.append(text('dt',label),text('dd',value||'未填寫'));}
 card.append(dl);
 if(row.memo)card.append(text('p',row.memo,'memo-preview'));
 const editButton=text('button','編輯資料','secondary');editButton.onclick=()=>{if(!busy)edit(row);};card.append(editButton);return card;
}
async function load(){
 clear();const ticket=generation;status.textContent='正在載入…';
 try{
  const result=await listMembers(db,church,search,page,newcomersOnly);if(ticket!==generation)return;
  $('#new').disabled=false;$('#newcomer').disabled=false;$('#prev').disabled=page===0;$('#next').disabled=!result.hasNext;
  $('#page-label').textContent='第 '+(page+1)+' 頁';
  status.textContent=result.rows.length?'本頁顯示 '+result.rows.length+' 位會友。':'沒有符合條件的會友，請調整查詢條件。';
  const active=result.rows.filter(r=>!isInactive(r.growth_progress)),inactive=result.rows.filter(r=>isInactive(r.growth_progress));
  const grid=text('div','','member-grid');active.forEach(r=>grid.append(memberCard(r)));list.append(grid);
  if(inactive.length){
   const drawer=document.createElement('details');drawer.className='inactive-drawer';drawer.append(text('summary','很久沒來 · 待關懷羊群（本頁 '+inactive.length+' 人）'));
   const cards=text('div','','member-grid');inactive.forEach(r=>cards.append(memberCard(r)));drawer.append(cards);list.append(drawer);
  }
 }catch(error){if(ticket===generation)status.textContent=error.message;}
}
$('#title').textContent=(church==='M+'?'M＋大雅教會':church==='SHiNE'?'火樂教會':'')+' · 會友名冊';
for(const [id,file] of [['review','binding-review.html'],['form-settings','welcome-settings.html']])$('#'+id).href=file+'?church='+encodeURIComponent(church||'');
$('#search-form').onsubmit=event=>{event.preventDefault();if(busy)return;search=$('#search').value;newcomersOnly=$('#newcomers-only').checked;page=0;load();};
$('#new').onclick=()=>{if(!busy)edit();};$('#newcomer').onclick=()=>{if(!busy)edit(null,true);};
$('#prev').onclick=()=>{if(!busy&&page>0){page--;load();}};$('#next').onclick=()=>{if(!busy){page++;load();}};
$('#logout').onclick=async()=>{clear();await db.auth.signOut();location.replace('admin-login.html');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else load();});
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();status.textContent='已登出，請重新登入。';}});
load();
