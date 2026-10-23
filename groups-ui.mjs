import {db} from './admin-db.mjs?v=20261012-readable2';
import {listGroups,listGroupMembers,saveGroup,setGroupArchived} from './group-management.mjs?v=20261003-access-guard1';
import {loadChurchCustomizations,catalog} from './church-customizations.mjs?v=20261023-settings1';
import {editorDraft,lockControls} from './app-workflow.mjs?v=20261022-experience2';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null,$=s=>document.querySelector(s),status=$('#status'),container=$('#groups'),editor=$('#editor'),term=church==='SHiNE'?'小家':'小組',leaderTerm=church==='SHiNE'?'小家長':'小組長';
let groups=[],members=[],busy=false,loading=false,loaded=false,archivedOnly=false,groupTypes=[];
const draft=editorDraft(editor),el=(tag,value='',cls='')=>Object.assign(document.createElement(tag),{textContent:value,className:cls});
function closeEditor(){draft.dispose();editor.replaceChildren();editor.hidden=true;}
function edit(row=null){
 if(busy||loading||!draft.canLeave())return;
 closeEditor();editor.hidden=false;
 const form=document.createElement('form'),grid=el('div','','edit-grid'),inputs={};
 const name=document.createElement('input'),type=document.createElement('select'),leader=document.createElement('select'),meetingTime=document.createElement('input'),location=document.createElement('input'),memo=document.createElement('textarea');
 name.value=row?.name||'';name.maxLength=100;name.required=true;
 type.append(new Option('未選擇',''));for(const value of groupTypes)type.append(new Option(value,value));if(row?.group_type&&!groupTypes.includes(row.group_type))type.append(new Option(row.group_type,row.group_type));type.value=row?.group_type||'';
 leader.append(new Option('請選取負責同工',''));for(const m of members)leader.append(new Option(m.name+(m.phone?' ('+m.phone+')':''),m.name));if(row?.leader&&![...leader.options].some(option=>option.value===row.leader))leader.append(new Option(row.leader+'（原設定）',row.leader));leader.value=row?.leader||'';leader.required=true;
 meetingTime.value=row?.meeting_time||'';meetingTime.maxLength=100;meetingTime.placeholder='例如：每週五 19:30–21:30';location.value=row?.location||'';location.maxLength=200;location.placeholder='例如：組員家庭、線上聚會、教會空間';memo.value=row?.memo||'';memo.maxLength=1000;memo.rows=3;
 for(const [key,label,input] of [['name',term+'名稱（必填）',name],['group_type',term+'類型（選填）',type],['leader',leaderTerm+'（必填）',leader],['meeting_time','聚會時間（選填）',meetingTime],['location','聚會地點（選填）',location],['memo','備註（選填）',memo]]){
  input.name=key;inputs[key]=input;const wrap=el('label',label);wrap.append(input);grid.append(wrap);
 }
 const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','確認儲存'),formStatus=el('p','','status-message');cancel.type='button';save.type='submit';formStatus.setAttribute('role','status');
 cancel.onclick=()=>{if(!busy&&draft.canLeave())closeEditor();};actions.append(cancel,save);form.append(el('h2',row?'編輯'+term:'新增'+term),grid,formStatus,actions);editor.append(form);draft.attach(form);name.focus();
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||loading||!form.reportValidity())return;
  const payload=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]));busy=true;const unlock=lockControls(form);formStatus.textContent='正在儲存…';
  try{
   await saveGroup(db,church,payload,row);closeEditor();const loaded=await load();status.textContent=loaded?'已儲存'+term+'資料。':term+'資料已儲存，清單尚未更新；請重新讀取，勿重複新增。';
  }catch(error){formStatus.textContent=error?.message||'儲存失敗，請稍後再試。';status.textContent=formStatus.textContent;}
  finally{busy=false;unlock();}
 };
}
function render(){
 const query=$('#group-search').value.trim().toLocaleLowerCase(),visible=groups.filter(g=>[g.name,g.leader,g.location].some(value=>String(value||'').toLocaleLowerCase().includes(query)));
 container.replaceChildren();$('#query-count').textContent='顯示 '+visible.length+' / '+groups.length+' 個'+(archivedOnly?'已封存':'使用中')+term;
 for(const g of visible){
  const card=el('article','','member-card');card.append(el('h3',g.name));if(g.group_type)card.append(el('p',g.group_type,'status-badge'));
  card.append(el('p',leaderTerm+'：'+(g.leader||'未設定'),'status-badge'),el('p','時間：'+(g.meeting_time||'時間彈性')),el('p','地點：'+(g.location||'地點自訂')));
  const count=members.filter(m=>(m.group_name||'').trim()===(g.name||'').trim()).length;card.append(el('p','成員：'+count+' 人','muted'));if(g.memo)card.append(el('p',g.memo,'memo-preview'));
  const actions=el('div','','people-card-actions'),button=el('button','編輯'+term,'secondary'),archive=el('button',g.archived_at?'恢復':'封存','secondary');button.type=archive.type='button';button.onclick=()=>edit(g);
  archive.onclick=async()=>{
   if(busy||loading||!draft.canLeave())return;const restoring=Boolean(g.archived_at);if(!confirm((restoring?'恢復 ':'封存 ')+g.name+'？'))return;
   closeEditor();busy=true;const unlock=lockControls(card);status.textContent=restoring?'正在恢復…':'正在封存…';
   try{await setGroupArchived(db,church,g,!restoring);const loaded=await load();status.textContent=(restoring?'已恢復':'已封存')+term+'。'+(loaded?'':'清單尚未更新，請重新讀取。');}catch(error){status.textContent=error.message;}finally{busy=false;unlock();}
  };
  actions.append(button,archive);card.append(actions);container.append(card);
 }
 if(!visible.length)container.append(el('p',query?'找不到符合的'+term+'，請調整或清除搜尋。':'目前沒有'+(archivedOnly?'已封存':'使用中')+term+'。','people-empty'));
}
async function load(archive=archivedOnly){
 loading=true;$('#new').disabled=true;status.textContent='正在載入…';
 try{
  const [g,m,settings]=await Promise.all([listGroups(db,church,archive),listGroupMembers(db,church),loadChurchCustomizations(db,church)]);
  groups=g;members=m;loaded=true;groupTypes=catalog(settings,'group_types',[]);archivedOnly=archive;render();archivedButton.textContent=archivedOnly?'返回使用中'+term:'查看已封存'+term;status.textContent='共 '+groups.length+' 個'+(archivedOnly?'已封存':'使用中')+term+'。';return true;
 }catch(error){status.textContent='清單尚未更新：'+error.message;return false;}
 finally{loading=false;$('#new').disabled=archivedOnly||!loaded;}
}
$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · '+term+'管理';$('#members').href='members.html?church='+encodeURIComponent(church||'');
const manageLink=el('a',term+'成員管理');manageLink.href='group-members.html?church='+encodeURIComponent(church||'');
const archivedButton=el('button','查看已封存'+term,'secondary'),reload=el('button','重新讀取','secondary');archivedButton.type=reload.type='button';
archivedButton.onclick=()=>{if(busy||loading||!draft.canLeave())return;closeEditor();void load(!archivedOnly);};reload.onclick=()=>{if(busy||loading||!draft.canLeave())return;closeEditor();void load();};
$('.page-nav').append(manageLink,archivedButton,reload);$('#new').onclick=()=>edit();$('#group-search').oninput=render;$('#clear-search').onclick=()=>{$('#group-search').value='';render();$('#group-search').focus();};load();
