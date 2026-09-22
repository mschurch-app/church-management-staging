import {db} from './admin-db.mjs';
import {
  listRooms, saveRoom, listBookings, createBooking, updateBooking,
  setBookingStatus, setRoomActive
} from './space-management.mjs';

const values=new URLSearchParams(location.search).getAll('church');
const church=values.length===1?values[0]:null;
const $=selector=>document.querySelector(selector);
const status=$('#status'),editor=$('#editor');
let rooms=[],bookings=[],busy=false,showInactive=false;
const el=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node;};

function field(label,input){const wrap=el('label',label);wrap.append(input);return wrap;}
function closeEditor(){editor.hidden=true;editor.replaceChildren();}

function roomForm(row=null){
  editor.replaceChildren(); editor.hidden=false;
  const form=document.createElement('form'),grid=el('div','','edit-grid'),inputs={};
  for(const [key,label,type,value] of [
    ['name','空間名稱','text',row?.name||''],['floor','樓層','text',row?.floor||'1F'],
    ['capacity','容納人數','number',row?.capacity||50],['equipment','設備說明','text',row?.equipment||''],
    ['hourly_rate','每小時費用','number',row?.hourly_rate||0],['cleaning_fee','清潔費','number',row?.cleaning_fee||0]
  ]){const input=document.createElement('input');input.type=type;input.value=value;input.required=['name','capacity'].includes(key);grid.append(field(label,input));inputs[key]=input;}
  const rent=document.createElement('input');rent.type='checkbox';rent.checked=row?.is_available_for_rent||false;
  const rentLabel=el('label','','check-row');rentLabel.append(rent,el('span','可對外租借'));
  const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','儲存空間');
  cancel.type='button';cancel.onclick=closeEditor;actions.append(cancel,save);
  form.append(el('h2',row?'編輯空間':'新增空間'),grid,rentLabel,actions);
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;try{
    await saveRoom(db,church,{...Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value])),is_available_for_rent:rent.checked},row);
    closeEditor();await load();status.textContent='空間已儲存。';
  }catch(error){status.textContent=error.message;}finally{busy=false;}};
  editor.append(form);editor.scrollIntoView({behavior:'smooth',block:'start'});inputs.name.focus();
}

function bookingForm(row=null){
  const activeRooms=rooms.filter(room=>room.is_active);
  if(!activeRooms.length){status.textContent='請先建立或恢復一個可使用的空間。';return;}
  editor.replaceChildren();editor.hidden=false;
  const form=document.createElement('form'),grid=el('div','','edit-grid');
  const room=document.createElement('select'),name=document.createElement('input'),phone=document.createElement('input');
  const date=document.createElement('input'),start=document.createElement('input'),end=document.createElement('input');
  const purpose=document.createElement('input'),type=document.createElement('select');
  for(const item of activeRooms)room.append(new Option(item.name,item.id));
  name.required=date.required=start.required=end.required=true;
  date.type='date';start.type=end.type='time';
  type.append(new Option('內部聚會','內部聚會'),new Option('對外租借','對外租借'));
  room.value=String(row?.room_id||activeRooms[0].id);name.value=row?.applicant_name||'';phone.value=row?.contact_phone||'';
  date.value=row?.booking_date||new Date().toISOString().slice(0,10);start.value=row?.start_time?.slice(0,5)||'09:00';end.value=row?.end_time?.slice(0,5)||'11:00';
  purpose.value=row?.purpose||'';type.value=row?.booking_type||'內部聚會';
  for(const [label,input] of [['空間',room],['申請人',name],['聯絡電話',phone],['日期',date],['開始時間',start],['結束時間',end],['用途',purpose],['借用類型',type]])grid.append(field(label,input));
  const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button',row?'儲存更正':'送出預約');
  cancel.type='button';cancel.onclick=closeEditor;actions.append(cancel,save);
  form.append(el('h2',row?'更正預約資料':'新增場地預約'),row?el('p','更正後會回到待審核狀態。','muted'):document.createDocumentFragment(),grid,actions);
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;const selected=activeRooms.find(item=>String(item.id)===room.value);busy=true;try{
    const input={applicant_name:name.value,contact_phone:phone.value,booking_date:date.value,start_time:start.value,end_time:end.value,purpose:purpose.value,booking_type:type.value};
    if(row)await updateBooking(db,church,input,row,selected);else await createBooking(db,church,input,selected);
    closeEditor();await load();status.textContent=row?'預約已更正，請重新審核。':'預約已建立並等待審核。';
  }catch(error){status.textContent=error.message;}finally{busy=false;}};
  editor.append(form);editor.scrollIntoView({behavior:'smooth',block:'start'});name.focus();
}

async function changeRoomState(row,active){
  if(busy||!confirm(active?'恢復 '+row.name+'？':'停用 '+row.name+'？歷史預約會保留。'))return;
  busy=true;try{await setRoomActive(db,church,row,active);await load();status.textContent=active?'空間已恢復。':'空間已停用，歷史預約仍保留。';}catch(error){status.textContent=error.message;}finally{busy=false;}
}

async function changeBookingState(row,next,label){
  if(busy||!confirm(label+'這筆預約？'))return;busy=true;
  try{await setBookingStatus(db,church,row,next);await load();status.textContent='預約狀態已更新。';}catch(error){status.textContent=error.message;}finally{busy=false;}
}

function render(){
  const roomArea=$('#rooms'),bookingArea=$('#bookings');roomArea.replaceChildren();bookingArea.replaceChildren();
  const visibleRooms=rooms.filter(room=>showInactive?!room.is_active:room.is_active);
  for(const row of visibleRooms){
    const card=el('article','','member-card');
    card.append(el('h3',row.name),el('p',(row.floor||'未填樓層')+' · 容納 '+row.capacity+' 人','status-badge'),el('p','設備：'+(row.equipment||'無')),el('p',row.is_available_for_rent?'可對外租借；每小時 '+row.hourly_rate+' 元，清潔費 '+row.cleaning_fee+' 元':'僅內部使用','muted'));
    if(row.is_active){const edit=el('button','編輯空間','secondary'),disable=el('button','停用空間','secondary');edit.onclick=()=>roomForm(row);disable.onclick=()=>changeRoomState(row,false);card.append(edit,disable);}
    else{card.append(el('p','已停用，歷史預約仍保留。','muted'));const restore=el('button','恢復空間','secondary');restore.onclick=()=>changeRoomState(row,true);card.append(restore);}
    roomArea.append(card);
  }
  if(!visibleRooms.length)roomArea.append(el('p',showInactive?'目前沒有停用的空間。':'目前沒有可用空間。','muted'));
  for(const row of bookings){
    const room=rooms.find(item=>item.id===row.room_id),card=el('article','','audit-card'),head=el('div','','audit-head');
    head.append(el('strong',(room?.name||'空間')+' · '+row.booking_date),el('span',row.status,'status-badge'));
    card.append(head,el('p',row.start_time.slice(0,5)+'－'+row.end_time.slice(0,5)+' · '+(row.purpose||'聚會活動')),el('p','申請人：'+row.applicant_name+' '+(row.contact_phone||'')),el('p','費用：'+row.total_fee+' 元','muted'));
    if(['待審核','已核准'].includes(row.status)){const edit=el('button','更正預約','secondary');edit.onclick=()=>bookingForm(row);card.append(edit);}
    const actions=row.status==='待審核'?[['核准','已核准'],['駁回','已駁回'],['取消','已取消']]:row.status==='已核准'?[['取消','已取消']]:[];
    for(const [label,next] of actions){const button=el('button',label,'secondary');button.onclick=()=>changeBookingState(row,next,label);card.append(button);}
    bookingArea.append(card);
  }
  if(!bookings.length)bookingArea.append(el('p','目前沒有預約。','muted'));
  $('#room-toggle').textContent=showInactive?'顯示使用中空間':'查看停用空間';
}

async function load(){
  status.textContent='正在載入…';
  try{[rooms,bookings]=await Promise.all([listRooms(db,church,true),listBookings(db,church)]);render();status.textContent='使用中 '+rooms.filter(room=>room.is_active).length+' 個、停用 '+rooms.filter(room=>!room.is_active).length+' 個空間；共 '+bookings.length+' 筆預約。';}
  catch(error){status.textContent=error.message;}
}

$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 場地與預約';
$('#members').href='members.html?church='+encodeURIComponent(church||'');
const amenityLink=el('a','設備管理');amenityLink.href='amenities.html?church='+encodeURIComponent(church||'');$('.page-nav').append(amenityLink);
$('#new-room').onclick=()=>roomForm();$('#new-booking').onclick=()=>bookingForm();
$('#room-toggle').onclick=()=>{showInactive=!showInactive;render();};
load();
