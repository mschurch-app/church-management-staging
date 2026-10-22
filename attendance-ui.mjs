import {db} from './admin-db.mjs?v=20261012-readable2';
import {listGroups} from './group-management.mjs?v=20261003-access-guard1';
import {listAttendance,listAttendanceMembers,saveAttendance} from './attendance-management.mjs?v=20261003-access-guard1';
import {loadChurchCustomizations,catalog} from './church-customizations.mjs?v=20261009-stage2';
import {editorDraft,lockControls} from './app-workflow.mjs?v=20261022-experience2';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null;
const $=s=>document.querySelector(s),status=$('#status'),editor=$('#editor'),records=$('#records'),term=church==='SHiNE'?'小家':'小組';
let groups=[],members=[],meetingTypes=[],rows=[],busy=false,loading=false,loaded=false;
const draft=editorDraft(editor),el=(tag,value='',cls='')=>Object.assign(document.createElement(tag),{textContent:value,className:cls}),split=v=>(v||'').split('、').map(x=>x.trim()).filter(Boolean);
function closeEditor(){draft.dispose();editor.replaceChildren();editor.hidden=true;}
function openForm(row=null){
 if(busy||loading||!draft.canLeave())return;closeEditor();editor.hidden=false;
 const form=document.createElement('form'),grid=el('div','','edit-grid'),date=document.createElement('input'),meetingType=document.createElement('select'),group=document.createElement('select'),memo=document.createElement('textarea'),people=el('fieldset');
 date.type='date';date.required=true;const now=new Date();date.value=row?.meeting_date||new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
 meetingType.append(new Option('未選擇',''));for(const value of meetingTypes)meetingType.append(new Option(value,value));if(row?.meeting_type&&!meetingTypes.includes(row.meeting_type))meetingType.append(new Option(row.meeting_type,row.meeting_type));meetingType.value=row?.meeting_type||meetingTypes[0]||'';
 group.append(new Option('請選擇'+term,''));for(const g of groups)group.append(new Option(g.name,g.id));const currentGroup=groups.find(g=>g.name===row?.group_name);if(currentGroup)group.value=String(currentGroup.id);group.required=true;
 memo.maxLength=1000;memo.value=row?.memo||'';memo.rows=3;
 const priorPresent=new Set(split(row?.present_list)),priorAbsent=new Set(split(row?.absent_list)),list=el('div','','choice-grid'),search=document.createElement('input'),searchLabel=el('label','搜尋點名姓名','roster-search'),summary=el('p','','attendance-roster-summary'),empty=el('p','找不到符合的姓名，請調整搜尋。','muted');
 search.type='search';search.placeholder='搜尋不會清除已勾選的人';search.maxLength=80;searchLabel.append(search);summary.setAttribute('role','status');empty.hidden=true;people.append(el('legend','勾選本次出席會友'),searchLabel,summary,list,empty);
 function filterPeople(){
  const q=search.value.trim().toLocaleLowerCase(),boxes=[...list.querySelectorAll('input[type=checkbox]')];let visible=0;
  for(const box of boxes){const match=box.dataset.name.toLocaleLowerCase().includes(q);box.closest('label').hidden=!match;if(match)visible++;}
  const present=boxes.filter(x=>x.checked).length;summary.textContent='出席 '+present+' 人 · 未出席 '+(boxes.length-present)+' 人 · 共 '+boxes.length+' 人'+(q?'（搜尋顯示 '+visible+' 人）':'');empty.hidden=!q||visible>0;
 }
 function renderPeople(){
  list.replaceChildren();const selected=groups.find(g=>String(g.id)===group.value),eligible=members.filter(m=>selected&&(m.group_name||'').trim()===(selected.name||'').trim()),known=new Set(eligible.map(m=>m.name));
  for(const oldName of [...priorPresent,...priorAbsent])if(!known.has(oldName)){eligible.push({name:oldName});known.add(oldName);}
  for(const m of eligible){const label=el('label','','choice'),box=document.createElement('input');box.type='checkbox';box.dataset.name=m.name;box.checked=priorPresent.has(m.name);box.onchange=filterPeople;label.append(box,el('span',m.name));list.append(label);}
  if(!eligible.length)list.append(el('p',selected?'此'+term+'目前沒有會友。':'請先選擇'+term+'，再勾選出席會友。','muted'));filterPeople();
 }
 // The shared capture handler marks any form input; this filter changes only the view.
 search.oninput=search.onchange=event=>{event.stopPropagation();form.dataset.unsavedChanges=String(draft.dirty);filterPeople();};
 let previousGroup=group.value;
 group.onchange=()=>{if(list.querySelector('input:checked')&&!confirm('切換'+term+'會清除本次勾選。要繼續嗎？')){group.value=previousGroup;return;}previousGroup=group.value;priorPresent.clear();priorAbsent.clear();search.value='';renderPeople();};renderPeople();
 for(const [key,label,input] of [['meeting_date','聚會日期（必填）',date],['meeting_type','聚會類型（選填）',meetingType],['group',term+'（必填）',group],['memo','備註（選填）',memo]]){input.name=key;const wrap=el('label',label);wrap.append(input);grid.append(wrap);}
 const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button',row?'儲存更正':'儲存出席'),formStatus=el('p','','status-message');cancel.type='button';save.type='submit';formStatus.setAttribute('role','status');
 cancel.onclick=()=>{if(!busy&&draft.canLeave())closeEditor();};actions.append(cancel,save);form.append(el('h2',row?'更正出席紀錄':'新增聚會出席'),grid,people,formStatus,actions);editor.append(form);draft.attach(form);date.focus();
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||loading||!form.reportValidity())return;
  const selected=groups.find(g=>String(g.id)===group.value);if(!selected){formStatus.textContent='請選擇'+term+'。';group.focus();return;}
  // Keep all people in the payload, including currently hidden search results.
  const boxes=[...list.querySelectorAll('input[type=checkbox]')],present=boxes.filter(x=>x.checked).map(x=>x.dataset.name),absent=boxes.filter(x=>!x.checked).map(x=>x.dataset.name),payload={meeting_date:date.value,meeting_type:meetingType.value,group_name:selected.name,leader_name:selected.leader,present,absent,memo:memo.value};
  busy=true;const unlock=lockControls(form);formStatus.textContent='正在儲存…';
  try{await saveAttendance(db,church,payload,row);closeEditor();const refreshed=await load();status.textContent=(row?'出席紀錄已更正。':'出席紀錄已儲存。')+(refreshed?'':'清單尚未更新，請重新讀取，勿重複新增。');}
  catch(error){formStatus.textContent=error.message;status.textContent=error.message;}finally{busy=false;unlock();}
 };
}
function updateFilters(){
 for(const [id,key] of [['record-group','group_name'],['record-type','meeting_type']]){const control=$('#'+id),current=control.value,options=[...new Set(rows.map(r=>r[key]).filter(Boolean))].sort();control.replaceChildren(new Option('全部',''),...options.map(value=>new Option(value,value)));if(options.includes(current))control.value=current;}
}
function render(){
 const group=$('#record-group').value,type=$('#record-type').value,visible=rows.filter(r=>(!group||r.group_name===group)&&(!type||r.meeting_type===type));records.replaceChildren();
 $('#query-count').textContent='最近 '+rows.length+' 筆中顯示 '+visible.length+' 筆（最多載入 100 筆）';
 const expected=visible.reduce((sum,r)=>sum+(r.total_expected||0),0),present=visible.reduce((sum,r)=>sum+(r.total_present||0),0);
 if(visible.length)records.append(el('p','目前顯示紀錄的出席率：'+(expected?Math.round(present/expected*100):0)+'%（'+present+' / '+expected+'）','status-message'));
 for(const row of visible){
  const card=el('article','','audit-card'),head=el('div','','audit-head');head.append(el('strong',row.meeting_date+' · '+row.group_name),el('span','出席 '+row.total_present+' / '+row.total_expected,'status-badge'));card.append(head);
  if(row.meeting_type)card.append(el('p',row.meeting_type,'status-badge'));card.append(el('p','負責同工：'+(row.leader_name||'未填寫')),el('p','出席：'+(row.present_list||'無')),el('p','缺席：'+(row.absent_list||'無')));if(row.memo)card.append(el('p','備註：'+row.memo,'muted'));
  const edit=el('button','更正紀錄','secondary');edit.type='button';edit.onclick=()=>openForm(row);card.append(edit);records.append(card);
 }
 if(!visible.length)records.append(el('p',rows.length?'沒有符合的紀錄，請調整或清除篩選。':'目前沒有出席紀錄。','people-empty'));
}
async function load(){
 loading=true;$('#new').disabled=true;status.textContent='正在載入…';
 try{const [data,g,m,settings]=await Promise.all([listAttendance(db,church),listGroups(db,church),listAttendanceMembers(db,church),loadChurchCustomizations(db,church)]);rows=data;groups=g;members=m;meetingTypes=catalog(settings,'meeting_types',[]);loaded=true;updateFilters();render();status.textContent='顯示最近 '+rows.length+' 筆出席紀錄。';return true;}
 catch(error){status.textContent='清單尚未更新：'+error.message;return false;}finally{loading=false;$('#new').disabled=!loaded;}
}
$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 出席登記';$('#members').href='members.html?church='+encodeURIComponent(church||'');$('#groups').href='groups.html?church='+encodeURIComponent(church||'');
const reload=el('button','重新讀取','secondary');reload.type='button';reload.onclick=()=>{if(busy||loading||!draft.canLeave())return;closeEditor();void load();};$('.page-nav').append(reload);
$('#new').onclick=()=>openForm();$('#record-group').onchange=render;$('#record-type').onchange=render;$('#clear-filters').onclick=()=>{$('#record-group').value='';$('#record-type').value='';render();};load();
