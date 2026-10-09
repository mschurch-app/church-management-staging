import {LINE_MEMBER_ENDPOINT} from './line-config.mjs?v=20261009-plus-state1';

const church='M+';
const lineEntry='https://mscos.mchurch.online/line-member.html?church=M%2B&feature=service_signup&entry=20261009-clean-state5';
const $=selector=>document.querySelector(selector);
const app=$('#app');
const status=$('#status');
const ministries={
  media:['🎛️','影音'],
  worship:['🎶','敬拜團'],
  welcome:['🤝','接待'],
  children:['🧒','兒童主日學'],
};
const roles={
  sound:'音控',projection_director:'投影字幕／導播',lighting:'燈光',
  worship_leader:'主領',assistant_worship_leader:'副主領',keyboard:'鍵盤',
  drums:'爵士鼓',guitar:'吉他',bass:'Bass',singer:'歌手',
  welcome:'接待',children_teacher:'老師',children_assistant:'助手',
};
const groupedRoles={keyboard:['keyboard_1','keyboard_2'],singer:['singer_1','singer_2','singer_3'],welcome:['welcome_1','welcome_2']};
const publicRole=role=>Object.entries(groupedRoles).find(([,members])=>members.includes(role))?.[0]||role;

let idToken='';
let accessToken='';
let data={};
let step=1;
let memberName='';
let roleIndex=0;
let busy=false;
const selectedMinistries=new Set();
const selectedRoles=new Set();
const roleSlots=new Map();

const tokenKey='line-member-token:M+';
const accessTokenKey='line-member-access-token:M+';
const readCredentials=()=>{try{return {idToken:sessionStorage.getItem(tokenKey)||'',accessToken:sessionStorage.getItem(accessTokenKey)||''};}catch{return {idToken:'',accessToken:''};}};
const forgetCredentials=()=>{try{sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(accessTokenKey);}catch{}};
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const timeoutSignal=milliseconds=>typeof AbortSignal!=='undefined'&&typeof AbortSignal.timeout==='function'?AbortSignal.timeout(milliseconds):undefined;
const fmt=date=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'long',day:'numeric',weekday:'short'}).format(new Date(date+'T12:00:00+08:00'));

async function api(action,extra={}){
  const response=await fetch(LINE_MEMBER_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',credentials:'omit',signal:timeoutSignal(30000),body:JSON.stringify({action,church,idToken,accessToken,...extra})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.ok!==true){const error=new Error(body.error||'unavailable');error.code=body.error;throw error;}
  return body;
}

function season(){return data.seasons?.[0];}
function chosenRoles(){return [...selectedRoles];}
function slotsForRole(role){const keys=groupedRoles[role]||[role];return (season()?.slots||[]).filter(slot=>keys.includes(slot.role_key));}
function chosenChoices(){return chosenRoles().flatMap(role=>[...(roleSlots.get(role)||[])].map(service_date=>({role_key:role,service_date}))).sort((a,b)=>a.service_date.localeCompare(b.service_date)||a.role_key.localeCompare(b.role_key));}
function capacityFor(role,serviceDate){const slots=slotsForRole(role).filter(slot=>slot.service_date===serviceDate);return{capacity:slots.reduce((sum,slot)=>sum+Number(slot.capacity||0),0),taken:slots.reduce((sum,slot)=>sum+Number(slot.registered_count||0),0)};}
function occupiedDates(exceptRole){
  const dates=new Set((data.registrations||[]).map(record=>record.service_date));
  for(const [role,selectedDates] of roleSlots){
    if(role===exceptRole)continue;
    for(const date of selectedDates)dates.add(date);
  }
  return dates;
}
function shell(title,copy,body,actions=''){
  app.innerHTML=`<div class="stepbar">${[1,2,3,4].map(number=>`<i class="${number<=step?'on':''}"></i>`).join('')}</div><section class="panel"><h2>${title}</h2><p>${copy}</p>${body}${actions?`<div class="actions">${actions}</div>`:''}</section>`;
}
function existingRegistrations(){
  const currentSeason=season();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
  return (data.registrations||[]).map(record=>{
    const slot=currentSeason?.slots.find(item=>Number(item.id)===Number(record.slot_id));
    const request=(data.change_requests||[]).find(item=>Number(item.registration_id)===Number(record.id)&&['leader_review','admin_review'].includes(item.status));
    const started=currentSeason?.starts_on&&today>=currentSeason.starts_on;
    const label=record.status==='waitlisted'?`候補第 ${record.queue_number} 位`:record.status==='offered'?`名額已釋出，請於 ${record.offer_expires_at?new Date(record.offer_expires_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'24 小時內'} 接受`:record.status==='confirmed'?'已由負責人確認':'已登記，等待負責人協調';
    const review=request?`<small class="review-state">${request.status==='leader_review'?'等待服事領袖初審':'領袖已通過，等待鈺庭複審'}</small>`:'';
    const actions=record.status==='offered'?`<button data-offer="${record.id}">接受候補邀請</button>`:request?'':started?`<span class="registration-actions"><button data-adjust="${record.id}">申請調整</button><button data-cancel="${record.id}">申請取消</button></span>`:`<span class="registration-actions"><button data-adjust="${record.id}">修改</button><button data-cancel="${record.id}">刪除</button></span>`;
    return `<div class="registration"><span><strong>${fmt(record.service_date)}・${esc(roles[publicRole(slot?.role_key)]||'服事')}</strong><small>${label}</small>${review}</span>${actions}</div>`;
  }).join('');
}

function renderIdentityAndMinistries(){
  const existing=existingRegistrations();
  const body=`<label class="field name-field"><span>會友姓名 <b>必填</b></span><input id="member-name" maxlength="80" autocomplete="name" placeholder="請輸入會友名冊上的姓名" value="${esc(memberName)}"><small>姓名會與已綁定的會友名冊核對，不使用 LINE 顯示名稱代替。</small></label><h3>選擇服事類別（可複選）</h3><div class="choice-grid">${Object.entries(ministries).map(([key,value])=>`<button type="button" class="choice ${selectedMinistries.has(key)?'selected':''}" data-ministry="${key}"><span>${value[0]}</span><div><strong>${value[1]}</strong><small>查看可參與的服事項目</small></div></button>`).join('')}</div>${existing?`<h3>我的登記</h3>${existing}`:''}`;
  shell('先確認姓名與服事類別','每位登記者都必須填寫姓名；服事類別可以複選。',body,`<button class="primary" id="next" ${!memberName.trim()||!selectedMinistries.size?'disabled':''}>選擇服事項目</button>`);
  const input=$('#member-name');
  input.oninput=()=>{memberName=input.value;$('#next').disabled=!memberName.trim()||!selectedMinistries.size;};
  app.querySelectorAll('[data-ministry]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.ministry;
    if(selectedMinistries.has(key)){
      selectedMinistries.delete(key);
      for(const role of [...selectedRoles]){if(slotsForRole(role).some(slot=>slot.ministry_key===key)){selectedRoles.delete(role);roleSlots.delete(role);}}
    }else selectedMinistries.add(key);
    render();
  });
  app.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>cancelRegistration(Number(button.dataset.cancel)));
  app.querySelectorAll('[data-adjust]').forEach(button=>button.onclick=()=>adjustRegistration(Number(button.dataset.adjust)));
  app.querySelectorAll('[data-offer]').forEach(button=>button.onclick=()=>respondOffer(Number(button.dataset.offer),true));
  $('#next').onclick=()=>{step=2;render();};
}

function renderRoles(){
  const groups=[...selectedMinistries].map(ministry=>{
    const keys=[...new Set((season()?.slots||[]).filter(slot=>slot.ministry_key===ministry).map(slot=>publicRole(slot.role_key)))];
    return `<section class="role-group"><h3>${ministries[ministry][0]} ${ministries[ministry][1]}</h3><div class="choice-grid">${keys.map(role=>`<button type="button" class="choice ${selectedRoles.has(role)?'selected':''}" data-role="${role}"><div><strong>${esc(roles[role]||role)}</strong><small>可選擇多個主日</small></div></button>`).join('')}</div></section>`;
  }).join('');
  shell('選擇服事項目','可複選多項；下一步會依序為每一項選擇可服事日期。',groups,'<button class="secondary" id="back">上一步</button><button class="primary" id="next" '+(!selectedRoles.size?'disabled':'')+'>選擇日期</button>');
  app.querySelectorAll('[data-role]').forEach(button=>button.onclick=()=>{
    const role=button.dataset.role;
    if(selectedRoles.has(role)){selectedRoles.delete(role);roleSlots.delete(role);}else selectedRoles.add(role);
    render();
  });
  $('#back').onclick=()=>{step=1;render();};
  $('#next').onclick=()=>{roleIndex=0;step=3;render();};
}

function renderRoleDates(){
  const roleList=chosenRoles();
  const role=roleList[roleIndex];
  if(!role){step=2;render();return;}
  const selected=roleSlots.get(role)||new Set();
  const blockedDates=occupiedDates(role);
  const slots=slotsForRole(role);
  const dates=[...new Set(slots.map(slot=>slot.service_date))];
  const list=dates.map(serviceDate=>{
    const blocked=blockedDates.has(serviceDate),chosen=selected.has(serviceDate),availability=capacityFor(role,serviceDate),full=availability.taken>=availability.capacity;
    const note=blocked?'這一天已用於其他服事':full?'目前額滿，送出後列入候補':'可登記';
    return `<button type="button" class="date-choice ${full?'full':''} ${chosen?'selected':''}" data-date="${serviceDate}" ${blocked?'disabled':''}><span class="date-copy"><span class="date-day">${serviceDate.slice(-2)}</span><span><strong>${fmt(serviceDate)}</strong><small>${note}</small></span></span><span class="badge">${blocked?'已排除':chosen?'已選':full?'候補':'可登記'}</span></button>`;
  }).join('')||'<div class="empty">此服事項目目前沒有開放日期。</div>';
  const count=selected.size;
  shell(`第 ${roleIndex+1} 項：${roles[role]||role}`,`日期可複選。後面的服事項目會自動排除這裡已選的日期。（${roleIndex+1}/${roleList.length}）`,`<div class="selection-count">已選 ${count} 個主日</div><div class="date-list">${list}</div>`,`<button class="secondary" id="back">上一步</button><button class="primary" id="next" ${count?'':'disabled'}>${roleIndex<roleList.length-1?'下一項服事':'確認全部'}</button>`);
  app.querySelectorAll('[data-date]').forEach(button=>button.onclick=()=>{
    const date=button.dataset.date,set=roleSlots.get(role)||new Set();
    set.has(date)?set.delete(date):set.add(date);
    roleSlots.set(role,set);
    render();
  });
  $('#back').onclick=()=>{if(roleIndex>0){roleIndex--;render();}else{step=2;render();}};
  $('#next').onclick=()=>{if(roleIndex<roleList.length-1){roleIndex++;render();}else{step=4;render();}};
}

function renderConfirmation(){
  const selections=chosenChoices();
  const rows=selections.map(choice=>{const availability=capacityFor(choice.role_key,choice.service_date);return `<article><small>${esc(roles[choice.role_key]||choice.role_key)}</small><strong>${fmt(choice.service_date)}</strong><span>${availability.taken>=availability.capacity?'候補':'可登記'}</span></article>`;}).join('');
  const body=`<div class="identity-summary"><small>登記姓名</small><strong>${esc(memberName.trim())}</strong></div><div class="summary">${rows}</div><p class="confirmation-note">共 ${selections.length} 個主日；同一天只會安排一項服事。</p>`;
  shell('確認全部登記','送出後會一次處理所有選擇；若其中一筆無法登記，整批都不會寫入。',body,'<button class="secondary" id="back">修改日期</button><button class="primary" id="submit">確認送出</button>');
  $('#back').onclick=()=>{roleIndex=Math.max(0,chosenRoles().length-1);step=3;render();};
  $('#submit').onclick=submit;
}

function render(){
  status.hidden=true;
  app.hidden=false;
  if(data.binding_status!=='approved'){
    shell('先完成會友身分綁定','你的 LINE 尚未對應會友名冊。完成既有的 LINE 綁定審核後，就能填寫姓名並登記主日服事。','<div class="notice">綁定申請會送到現有的「LINE 綁定審核」後台，不會建立重複的會友資料。</div>','<button class="primary" id="bind">前往 LINE 綁定</button>');
    $('#bind').onclick=()=>location.href='newcomer.html?church=M%2B';
    return;
  }
  if(!season()){
    shell('目前尚未開放登記','下一季的服事登記還在預備中。開放後再回來就可以選擇。','<div class="empty">尚無開放中的季度</div>');
    return;
  }
  if(step===1)renderIdentityAndMinistries();
  else if(step===2)renderRoles();
  else if(step===3)renderRoleDates();
  else renderConfirmation();
}

async function submit(){
  if(busy)return;
  const choices=chosenChoices();
  if(!memberName.trim()||!choices.length)return;
  busy=true;
  const button=$('#submit');
  button.disabled=true;
  try{
    const result=await api('service_signup_register_batch',{memberName:memberName.trim(),choices});
    data=await api('content',{feature:'service_signup'});
    const records=result.registrations||[],waitlisted=records.filter(record=>record.status==='waitlisted').length;
    memberName='';selectedMinistries.clear();selectedRoles.clear();roleSlots.clear();roleIndex=0;step=1;
    render();
    const note=document.createElement('section');note.className='panel notice';
    note.textContent=`已完成 ${records.length} 筆登記${waitlisted?`，其中 ${waitlisted} 筆為候補`:''}。負責人確認班表後會再通知。`;
    app.prepend(note);
  }catch(error){
    const messages={member_name_required:'請先填寫姓名。',member_name_mismatch:'姓名與會友名冊不一致，請輸入名冊上的姓名或聯絡同工確認。',one_service_per_sunday:'選擇中有重複日期，或該主日已登記其他服事。',slot_unavailable:'部分名額已停止登記，請重新選擇。',binding_required:'LINE 尚未完成會友綁定。'};
    alert(messages[error.code]||'暫時無法送出，請稍後再試。');
  }finally{busy=false;if(button.isConnected)button.disabled=false;}
}

async function cancelRegistration(id){
  if(busy||!confirm('確定刪除或提出取消這筆服事？當季開始後會送交領袖與鈺庭審核。'))return;
  busy=true;
  try{const result=await api('service_signup_cancel',{registrationId:id});data=await api('content',{feature:'service_signup'});render();alert(result.direct?'已刪除，可重新選擇服事與日期。':'已送出取消申請，等待服事領袖初審。');}
  catch{alert('取消未完成，請稍後再試。');}
  finally{busy=false;}
}
async function adjustRegistration(id){
  const currentSeason=season(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
  if(currentSeason?.starts_on&&today<currentSeason.starts_on){
    if(confirm('季前修改會先刪除這筆登記，再讓你重新選擇。確定繼續？'))await cancelRegistration(id);
    return;
  }
  const note=prompt('請寫下希望調整的日期、服事項目或其他需求。服事領袖會先與你協調，再送鈺庭複審。','');
  if(!note?.trim()||busy)return;
  busy=true;
  try{await api('service_signup_change_request',{registrationId:id,requestType:'adjust',note:note.trim()});data=await api('content',{feature:'service_signup'});render();alert('調整需求已送出，等待服事領袖初審。');}
  catch(error){alert(error.code==='request_exists'?'這筆服事已有待審申請。':'申請未送出，請稍後再試。');}
  finally{busy=false;}
}
async function respondOffer(id,accept){
  if(busy)return;
  busy=true;
  try{await api('service_signup_offer',{registrationId:id,accept});data=await api('content',{feature:'service_signup'});render();}
  catch(error){alert(error.code==='offer_expired'?'確認期限已過，系統會通知下一位候補。':'目前無法回覆候補邀請，請重新載入。');data=await api('content',{feature:'service_signup'}).catch(()=>data);render();}
  finally{busy=false;}
}
async function load(){data=await api('content',{feature:'service_signup'});render();}
async function start(){
  ({idToken,accessToken}=readCredentials());
  if(idToken||accessToken){
    try{await load();return;}
    catch(error){
      if(error.code!=='login_required'){
        status.hidden=false;app.hidden=true;status.querySelector('.spinner')?.remove();
        status.querySelector('strong').textContent='暫時無法載入服事登記';
        status.querySelector('small').textContent=error.code==='binding_required'?'請先完成 LINE 會友身分確認，再回來登記。':'連線暫時中斷，登入資料仍保留，請稍後重試。';
        let retry=status.querySelector('button');if(!retry){retry=document.createElement('button');retry.type='button';retry.textContent='重新載入';status.append(retry);}retry.onclick=async()=>{retry.disabled=true;try{await start();}finally{retry.disabled=false;}};
        return;
      }
      forgetCredentials();idToken='';accessToken='';
    }
  }
  status.querySelector('strong').textContent='正在前往 LINE 登入';
  status.querySelector('small').textContent='登入後會自動回到 2027 服事登記';
  location.replace(lineEntry);
}
start();
