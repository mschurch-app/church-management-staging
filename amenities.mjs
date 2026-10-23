import {db} from './admin-db.mjs?v=20261012-readable2';
import {listAmenities,saveAmenity,setAmenityActive} from './space-management.mjs';

import {operationsWorkflow} from './operations-workflow.mjs?v=20261023-operations1';

const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null,$=selector=>document.querySelector(selector);
let items=[],showInactive=false;
const el=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node;};

const flow=operationsWorkflow({db,editor:$('#editor'),status:$('#status'),read:()=>listAmenities(db,church),apply:data=>{items=data;render();},clear:()=>{items=[];$('#items').replaceChildren();$('#count').textContent='';},close:()=>{$('#editor').hidden=true;$('#editor').replaceChildren();}});

function edit(row=null){
  if(!flow.ready||!flow.canLeave())return;
  const area=$('#editor');area.replaceChildren();area.hidden=false;
  const form=document.createElement('form'),grid=el('div','','edit-grid');
  const name=document.createElement('input'),quantity=document.createElement('input');name.name='name';quantity.name='quantity';name.maxLength=100;name.value=row?.name||'';name.required=true;quantity.type='number';quantity.min='0';quantity.value=String(row?.quantity??1);quantity.required=true;
  for(const [label,input] of [['設備名稱',name],['可用數量',quantity]]){const wrap=el('label',label);wrap.append(input);grid.append(wrap);}
  const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','儲存設備');cancel.type='button';cancel.onclick=()=>flow.close();actions.append(cancel,save);
  form.append(el('h2',row?'編輯設備':'新增設備'),grid,actions);form.onsubmit=event=>{event.preventDefault();flow.write(()=>saveAmenity(db,church,{name:name.value,quantity:quantity.value},row),'設備已儲存。');};
  area.append(form);flow.open(form);area.scrollIntoView({behavior:'smooth',block:'start'});name.focus();
}

function changeState(row,active){if(!flow.ready||!flow.canLeave()||!confirm(active?'恢復 '+row.name+'？':'停用 '+row.name+'？既有資料會保留。'))return;flow.write(()=>setAmenityActive(db,church,row,active),active?'設備已恢復。':'設備已停用。');}

function render(){
  const area=$('#items');area.replaceChildren();const term=$('#search').value.trim().toLocaleLowerCase(),visible=items.filter(row=>(showInactive?!row.is_active:row.is_active)&&(!term||row.name.toLocaleLowerCase().includes(term)));$('#count').textContent=`顯示 ${visible.length} 項；使用中 ${items.filter(r=>r.is_active).length} 項、停用 ${items.filter(r=>!r.is_active).length} 項。`;
  for(const row of visible){const card=el('article','',row.is_active?'amenity-card':'amenity-card inactive');card.append(el('h3',row.name),el('p','數量：'+row.quantity,'muted'));
    if(row.is_active){const editButton=el('button','編輯','secondary'),disable=el('button','停用','secondary');editButton.onclick=()=>edit(row);disable.onclick=()=>changeState(row,false);card.append(editButton,disable);}
    else{const restore=el('button','恢復設備','secondary');restore.onclick=()=>changeState(row,true);card.append(restore);}area.append(card);}
  if(!visible.length)area.append(el('p',showInactive?'目前沒有停用設備。':'目前沒有使用中的設備。','muted'));
  $('#toggle').textContent=showInactive?'顯示使用中設備':'查看停用設備';
}

$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 設備管理';$('#back').href='spaces.html?church='+encodeURIComponent(church||'');$('#new').onclick=()=>edit();$('#toggle').onclick=()=>{showInactive=!showInactive;render();};$('#search').oninput=render;$('#clear-filter').onclick=()=>{$('#search').value='';render();};$('#reload').onclick=flow.load;flow.load();
