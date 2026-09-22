import {db} from './admin-db.mjs';
import {listAmenities,saveAmenity,setAmenityActive} from './space-management.mjs';

const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null,$=selector=>document.querySelector(selector);
let items=[],busy=false,showInactive=false;
const el=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node;};

function edit(row=null){
  const area=$('#editor');area.replaceChildren();area.hidden=false;
  const form=document.createElement('form'),grid=el('div','','edit-grid');
  const name=document.createElement('input'),quantity=document.createElement('input');name.value=row?.name||'';name.required=true;quantity.type='number';quantity.min='0';quantity.value=String(row?.quantity??1);quantity.required=true;
  for(const [label,input] of [['設備名稱',name],['可用數量',quantity]]){const wrap=el('label',label);wrap.append(input);grid.append(wrap);}
  const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','儲存設備');cancel.type='button';cancel.onclick=()=>{area.hidden=true;area.replaceChildren();};actions.append(cancel,save);
  form.append(el('h2',row?'編輯設備':'新增設備'),grid,actions);form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;try{await saveAmenity(db,church,{name:name.value,quantity:quantity.value},row);area.hidden=true;await load();$('#status').textContent='設備已儲存。';}catch(error){$('#status').textContent=error.message;}finally{busy=false;}};
  area.append(form);area.scrollIntoView({behavior:'smooth',block:'start'});name.focus();
}

async function changeState(row,active){
  if(busy||!confirm(active?'恢復 '+row.name+'？':'停用 '+row.name+'？既有資料會保留。'))return;busy=true;
  try{await setAmenityActive(db,church,row,active);await load();$('#status').textContent=active?'設備已恢復。':'設備已停用。';}catch(error){$('#status').textContent=error.message;}finally{busy=false;}
}

function render(){
  const area=$('#items');area.replaceChildren();const visible=items.filter(row=>showInactive?!row.is_active:row.is_active);
  for(const row of visible){const card=el('article','',row.is_active?'amenity-card':'amenity-card inactive');card.append(el('h3',row.name),el('p','數量：'+row.quantity,'muted'));
    if(row.is_active){const editButton=el('button','編輯','secondary'),disable=el('button','停用','secondary');editButton.onclick=()=>edit(row);disable.onclick=()=>changeState(row,false);card.append(editButton,disable);}
    else{const restore=el('button','恢復設備','secondary');restore.onclick=()=>changeState(row,true);card.append(restore);}area.append(card);}
  if(!visible.length)area.append(el('p',showInactive?'目前沒有停用設備。':'目前沒有使用中的設備。','muted'));
  $('#toggle').textContent=showInactive?'顯示使用中設備':'查看停用設備';
}

async function load(){try{items=await listAmenities(db,church);render();$('#status').textContent='使用中 '+items.filter(row=>row.is_active).length+' 項、停用 '+items.filter(row=>!row.is_active).length+' 項設備。';}catch(error){$('#status').textContent=error.message;}}

$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 設備管理';$('#back').href='spaces.html?church='+encodeURIComponent(church||'');$('#new').onclick=()=>edit();$('#toggle').onclick=()=>{showInactive=!showInactive;render();};load();
