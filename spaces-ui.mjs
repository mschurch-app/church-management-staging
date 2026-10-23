import {db} from './admin-db.mjs?v=20261012-readable2';
import {
  listRooms, saveRoom, listBookings, createBooking, updateBooking,
  setBookingStatus, setRoomActive
} from './space-management.mjs';

import {operationsWorkflow} from './operations-workflow.mjs?v=20261023-operations1';

const values=new URLSearchParams(location.search).getAll('church');
const church=values.length===1?values[0]:null;
const $=selector=>document.querySelector(selector);
const status=$('#status'),editor=$('#editor');
let rooms=[],bookings=[],showInactive=false;
const el=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node;};

function field(label,input){const wrap=el('label',label);wrap.append(input);return wrap;}
const flow=operationsWorkflow({db,editor,status,read:()=>Promise.all([listRooms(db,church,true),listBookings(db,church)]),apply:data=>{[rooms,bookings]=data;render();},clear:()=>{rooms=[];bookings=[];$('#rooms').replaceChildren();$('#bookings').replaceChildren();$('#count').textContent='';},close:()=>{editor.hidden=true;editor.replaceChildren();}});
function closeEditor(){flow.close();}
function begin(){return flow.ready&&flow.canLeave();}

function roomForm(row=null){
  if(!begin())return;
  editor.replaceChildren(); editor.hidden=false;
  const form=document.createElement('form'),grid=el('div','','edit-grid'),inputs={};
  for(const [key,label,type,value] of [
    ['name','空間名稱','text',row?.name||''],['floor','樓層','text',row?.floor||'1F'],
    ['capacity','容納人數','number',row?.capacity||50],['equipment','設備說明','text',row?.equipment||''],
    ['hourly_rate','每小時費用','number',row?.hourly_rate||0],['cleaning_fee','清潔費','number',row?.cleaning_fee||0]
  ]){const input=document.createElement('input');input.name=key;input.type=type;input.value=value;if(type==='number')input.min=key==='capacity'?'1':'0';input.required=['name','capacity'].includes(key);grid.append(field(label,input));inputs[key]=input;}
  const rent=document.createElement('input');rent.type='checkbox';rent.checked=row?.is_available_for_rent||false;
  const rentLabel=el('label','','check-row');rentLabel.append(rent,el('span','可對外租借'));
  const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','儲存空間');
  cancel.type='button';cancel.onclick=closeEditor;actions.append(cancel,save);
  form.append(el('h2',row?'編輯空間':'新增空間'),grid,rentLabel,actions);
  form.onsubmit=event=>{event.preventDefault();flow.write(()=>saveRoom(db,church,{...Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value])),is_available_for_rent:rent.checked},row),'空間已儲存。');};
  editor.append(form);flow.open(form);editor.scrollIntoView({behavior:'smooth',block:'start'});inputs.name.focus();
}

function bookingForm(row=null){
  if(!begin())return;
  const activeRooms=rooms.filter(room=>room.is_active);
  if(!activeRooms.length){status.textContent='請先建立或恢復一個可使用的空間。';return;}
  editor.replaceChildren();editor.hidden=false;
  const form=document.createElement('form'),grid=el('div','','edit-grid');
  const room=document.createElement('select'),name=document.createElement('input'),phone=document.createElement('input');
  const date=document.createElement('input'),start=document.createElement('input'),end=document.createElement('input');
  const purpose=document.createElement('input'),type=document.createElement('select');
  for(const item of activeRooms)room.append(new Option(item.name,item.id));
  room.required=name.required=date.required=start.required=end.required=true;
  date.type='date';start.type=end.type='time';
  type.append(new Option('內部聚會','內部聚會'),new Option('對外租借','對外租借'));
  room.value=String(row?.room_id||activeRooms[0].id);name.value=row?.applicant_name||'';phone.value=row?.contact_phone||'';
  date.value=row?.booking_date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());start.value=row?.start_time?.slice(0,5)||'09:00';end.value=row?.end_time?.slice(0,5)||'11:00';
  for(const [key,input] of Object.entries({room_id:room,applicant_name:name,contact_phone:phone,booking_date:date,start_time:start,end_time:end,purpose,booking_type:type}))input.name=key;phone.type='tel';
  purpose.value=row?.purpose||'';type.value=row?.booking_type||'內部聚會';
  for(const [label,input] of [['空間',room],['申請人',name],['聯絡電話',phone],['日期',date],['開始時間',start],['結束時間',end],['用途',purpose],['借用類型',type]])grid.append(field(label,input));
  const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button',row?'儲存更正':'送出預約');
  cancel.type='button';cancel.onclick=closeEditor;actions.append(cancel,save);
  form.append(el('h2',row?'更正預約資料':'新增場地預約'),row?el('p','更正後會回到待審核狀態。','muted'):document.createDocumentFragment(),grid,actions);
  form.onsubmit=event=>{event.preventDefault();if(end.value<=start.value){end.setCustomValidity('結束時間必須晚於開始時間。');end.reportValidity();return;}const selected=activeRooms.find(item=>String(item.id)===room.value),input={applicant_name:name.value,contact_phone:phone.value,booking_date:date.value,start_time:start.value,end_time:end.value,purpose:purpose.value,booking_type:type.value};flow.write(()=>row?updateBooking(db,church,input,row,selected):createBooking(db,church,input,selected),row?'預約已更正，請重新審核。':'預約已建立並等待審核。');};
  end.oninput=start.oninput=()=>end.setCustomValidity('');
  editor.append(form);flow.open(form);editor.scrollIntoView({behavior:'smooth',block:'start'});name.focus();
}

function changeRoomState(row,active){if(!begin()||!confirm(active?'恢復 '+row.name+'？':'停用 '+row.name+'？歷史預約會保留。'))return;flow.write(()=>setRoomActive(db,church,row,active),active?'空間已恢復。':'空間已停用，歷史預約仍保留。');}
function changeBookingState(row,next,label){if(!begin()||!confirm(label+'這筆預約？'))return;flow.write(()=>setBookingStatus(db,church,row,next),'預約狀態已更新。');}

function render(){
  const roomArea=$('#rooms'),bookingArea=$('#bookings');roomArea.replaceChildren();bookingArea.replaceChildren();
  const term=$('#search').value.trim().toLocaleLowerCase(),state=$('#booking-state').value,match=values=>!term||values.some(v=>String(v||'').toLocaleLowerCase().includes(term));
  const visibleRooms=rooms.filter(room=>(showInactive?!room.is_active:room.is_active)&&match([room.name,room.floor,room.equipment]));
  const visibleBookings=bookings.filter(row=>(state==='all'||row.status===state)&&match([row.applicant_name,row.purpose,rooms.find(r=>r.id===row.room_id)?.name]));
  $('#count').textContent=`顯示 ${visibleRooms.length} 個空間、${visibleBookings.length} 筆預約；預約搜尋範圍為最近 100 筆。`;
  for(const row of visibleRooms){
    const card=el('article','','member-card');
    card.append(el('h3',row.name),el('p',(row.floor||'未填樓層')+' · 容納 '+row.capacity+' 人','status-badge'),el('p','設備：'+(row.equipment||'無')),el('p',row.is_available_for_rent?'可對外租借；每小時 '+row.hourly_rate+' 元，清潔費 '+row.cleaning_fee+' 元':'僅內部使用','muted'));
    if(row.is_active){const edit=el('button','編輯空間','secondary'),disable=el('button','停用空間','secondary');edit.onclick=()=>roomForm(row);disable.onclick=()=>changeRoomState(row,false);card.append(edit,disable);}
    else{card.append(el('p','已停用，歷史預約仍保留。','muted'));const restore=el('button','恢復空間','secondary');restore.onclick=()=>changeRoomState(row,true);card.append(restore);}
    roomArea.append(card);
  }
  if(!visibleRooms.length)roomArea.append(el('p',showInactive?'目前沒有停用的空間。':'目前沒有可用空間。','muted'));
  for(const row of visibleBookings){
    const room=rooms.find(item=>item.id===row.room_id),card=el('article','','audit-card'),head=el('div','','audit-head');
    head.append(el('strong',(room?.name||'空間')+' · '+row.booking_date),el('span',row.status,'status-badge'));
    card.append(head,el('p',row.start_time.slice(0,5)+'－'+row.end_time.slice(0,5)+' · '+(row.purpose||'聚會活動')),el('p','申請人：'+row.applicant_name+' '+(row.contact_phone||'')),el('p','費用：'+row.total_fee+' 元','muted'));
    if(['待審核','已核准'].includes(row.status)){const edit=el('button','更正預約','secondary');edit.onclick=()=>bookingForm(row);card.append(edit);}
    const actions=row.status==='待審核'?[['核准','已核准'],['駁回','已駁回'],['取消','已取消']]:row.status==='已核准'?[['取消','已取消']]:[];
    for(const [label,next] of actions){const button=el('button',label,'secondary');button.onclick=()=>changeBookingState(row,next,label);card.append(button);}
    bookingArea.append(card);
  }
  if(!visibleBookings.length)bookingArea.append(el('p','目前沒有預約。','muted'));
  $('#room-toggle').textContent=showInactive?'顯示使用中空間':'查看停用空間';
}

$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 場地與預約';
$('#members').href='members.html?church='+encodeURIComponent(church||'');
const amenityLink=el('a','設備管理');amenityLink.href='amenities.html?church='+encodeURIComponent(church||'');$('.page-nav').append(amenityLink);
$('#new-room').onclick=()=>roomForm();$('#new-booking').onclick=()=>bookingForm();
$('#room-toggle').onclick=()=>{showInactive=!showInactive;render();};
$('#search').oninput=render;$('#booking-state').onchange=render;$('#clear-filter').onclick=()=>{$('#search').value='';$('#booking-state').value='all';render();};$('#reload').onclick=flow.load;flow.load();
