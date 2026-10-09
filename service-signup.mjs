import {LINE_MEMBER_ENDPOINT} from './line-config.mjs?v=20261009-plus-state1';
import {journeyCard} from './service-signup-journey.mjs?v=20261009-signup-finish1';

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
let view=null;
let canReturnToList=false;
let feedback='';
let needsRefresh=false;
let lockedControls=[];
let journeyYear=null;
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
function setBusy(value){
  busy=value;app.setAttribute('aria-busy',String(value));
  if(value){lockedControls=[...app.querySelectorAll('button,input')].map(node=>({node,disabled:node.disabled}));lockedControls.forEach(({node})=>node.disabled=true);}
  else{lockedControls.forEach(({node,disabled})=>{if(node.isConnected)node.disabled=disabled;});lockedControls=[];}
}
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
  if(view==='form'&&canReturnToList){
    const back=document.createElement('button');back.type='button';back.className='list-return';back.textContent='返回我的登記';
    back.onclick=()=>{if(!busy){view='list';render();}};
    app.prepend(back);
  }
  if(view==='form'&&data.binding_status==='approved'){
    app.insertAdjacentHTML('afterbegin',journeyCard(data,currentJourneyYear()));bindJourneyYear();
  }
}
function currentJourneyYear(){return journeyYear||Number(season()?.starts_on?.slice(0,4))||Number(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()).slice(0,4));}
function bindJourneyYear(){const select=$('#journey-year');if(select)select.onchange=()=>{journeyYear=Number(select.value);render();};}
function renderCompletion(){
  const records=data.registrations||[],offered=records.filter(record=>record.status==='offered').length;
  app.innerHTML=`${journeyCard(data,currentJourneyYear())}<section class="panel completion-panel" aria-labelledby="completion-heading"><p class="completion-kicker">謝謝你的參與</p><h2 id="completion-heading" tabindex="-1">登記已完成</h2><p class="completion-lead">${esc(registrationName())}，謝謝你願意一起服事。<br>我們已收到你的 ${records.length} 筆登記。</p><section class="next-steps"><h3>接下來做什麼？</h3><ol><li>負責人會協調並確認班表，實際服事安排以負責人確認為準。</li><li>請留意教會 LINE 的後續通知。若名額釋出，候補邀請需在通知期限內接受。</li></ol>${offered?`<p class="notice">你有 ${offered} 筆候補邀請等待回覆，請回到登記清單確認。</p>`:''}</section><section class="return-guide"><h3>之後想查看或調整？</h3><p>回到 <strong>M＋大雅教會首頁</strong>，點選 <strong>「2027 讓我們一起服事」</strong>，使用<strong>這次登記的同一個 LINE 帳號</strong>登入，再按「修改我的登記」。</p><small>季前可直接修改、刪除；當季開始後，調整會交由服事負責人協調審核。</small></section><div class="completion-actions"><a class="primary home-link" href="https://mchurch.online/">完成，返回首頁</a><button type="button" class="secondary" id="view-my-registration">查看／修改我的登記</button></div></section>`;
  bindJourneyYear();$('#view-my-registration').onclick=()=>{view='list';render();$('#registration-heading')?.focus({preventScroll:true});app.scrollIntoView({block:'start'});};
}
function registrationName(){return data.member?.name||memberName.trim()||'會友';}
function openRegistrationForm(){
  if(busy||needsRefresh)return;
  memberName=data.member?.name||memberName.trim();
  selectedMinistries.clear();selectedRoles.clear();roleSlots.clear();roleIndex=0;step=1;
  view='form';canReturnToList=true;feedback='';render();
  $('#member-name')?.focus({preventScroll:true});
  app.scrollIntoView({block:'start'});
}
function bindRegistrationActions(){
  app.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>cancelRegistration(Number(button.dataset.cancel)));
  app.querySelectorAll('[data-adjust]').forEach(button=>button.onclick=()=>adjustRegistration(Number(button.dataset.adjust)));
  app.querySelectorAll('[data-offer]').forEach(button=>button.onclick=()=>respondOffer(Number(button.dataset.offer),true));
}
function renderRegistrationList(){
  const records=data.registrations||[];
  app.innerHTML=`${journeyCard(data,currentJourneyYear())}<section class="panel registration-panel" aria-labelledby="registration-heading"><header class="registration-header"><div><small>我的服事登記</small><h2 id="registration-heading" tabindex="-1">${esc(registrationName())}</h2></div><span class="registration-count">${records.length} 筆登記</span></header><p>${esc(season()?.title||'我的主日服事')}・依主日日期排列</p>${records.length?'<button type="button" class="secondary modify-entry" id="modify-registration">修改我的登記</button>':''}${!season()?'<div class="notice">目前尚未開放新登記，仍可查看自己的紀錄。</div>':''}${feedback?`<div class="notice list-feedback" role="status">${esc(feedback)}</div>`:''}${needsRefresh?'<button type="button" class="secondary" id="refresh-list">重新載入清單</button>':''}<div class="registration-list">${existingRegistrations()||'<div class="empty">目前沒有服事登記。準備好時，可以重新選擇服事與日期。</div>'}</div><div class="actions registration-footer">${records.length?`<button type="button" class="primary" id="finish-registration" ${needsRefresh?'disabled':''}>完成</button>`:''}<button type="button" class="${records.length?'secondary':'primary'}" id="add-registration" ${needsRefresh||!season()?'disabled':''}>${records.length?'新增服事登記':'重新選擇服事'}</button></div></section>`;
  bindJourneyYear();
  bindRegistrationActions();
  if(records.length){
    $('#modify-registration').onclick=()=>{const target=app.querySelector('[data-adjust],.registration');target?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});target?.focus?.({preventScroll:true});};
    $('#finish-registration').onclick=()=>{if(busy||needsRefresh)return;view='done';render();$('#completion-heading')?.focus({preventScroll:true});app.scrollIntoView({block:'start'});};
  }
  if(needsRefresh)app.querySelectorAll('.registration button').forEach(button=>button.disabled=true);
  $('#add-registration').onclick=()=>{if(!busy&&confirm('是否重新選擇服事與日期？已完成的其他登記會保留。'))openRegistrationForm();};
  if(needsRefresh)$('#refresh-list').onclick=async()=>{
    if(busy)return;setBusy(true);
    try{data=await api('content',{feature:'service_signup'});needsRefresh=false;feedback='清單已更新。';}
    catch{feedback='暫時無法更新清單，請稍後重新載入。已完成的操作不會再次送出。';}
    finally{setBusy(false);render();}
  };
}
async function refreshAfterMutation(message){
  view='list';canReturnToList=true;feedback=message;
  try{data=await api('content',{feature:'service_signup'});needsRefresh=false;}
  catch{needsRefresh=true;feedback=message+' 清單暫時無法更新，請重新載入清單；不要重複送出。';}
  render();
  $('#registration-heading')?.focus({preventScroll:true});
  app.scrollIntoView({block:'start'});
}
function existingRegistrations(){
  const currentSeason=season();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
  return (data.registrations||[]).map(record=>{
    const details=(data.service_journey?.registration_details||[]).find(item=>Number(item.id)===Number(record.id));
    const slot=currentSeason?.slots?.find(item=>Number(item.id)===Number(record.slot_id))||details;
    const request=(data.change_requests||[]).find(item=>Number(item.registration_id)===Number(record.id)&&['leader_review','admin_review'].includes(item.status));
    const startsOn=details?.season_starts_on||currentSeason?.starts_on,started=startsOn&&today>=startsOn;
    const completed=details?.completed===true;
    const label=record.status==='waitlisted'?`候補第 ${record.queue_number} 位`:record.status==='offered'?`名額已釋出，請於 ${record.offer_expires_at?new Date(record.offer_expires_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'24 小時內'} 接受`:record.status==='confirmed'?'已由負責人確認':'已登記，等待負責人協調';
    const review=request?`<small class="review-state">${request.status==='leader_review'?'等待服事領袖初審':'領袖已通過，等待鈺庭複審'}</small>`:'';
    const actions=completed?'':record.status==='offered'?`<button data-offer="${record.id}">接受候補邀請</button>`:request?'':started?`<span class="registration-actions"><button data-adjust="${record.id}">申請調整</button><button data-cancel="${record.id}">申請取消</button></span>`:`<span class="registration-actions"><button data-adjust="${record.id}">修改</button><button data-cancel="${record.id}">刪除</button></span>`;
    return `<div class="registration"><span><strong>${fmt(record.service_date)}・${esc(roles[publicRole(slot?.role_key)]||'服事')}</strong><small>${completed?'已記入恩典腳蹤，謝謝你的擺上':label}</small>${review}</span>${actions}</div>`;
  }).join('');
}

function renderIdentityAndMinistries(){
  const body=`<label class="field name-field"><span>會友姓名 <b>必填</b></span><input id="member-name" maxlength="80" autocomplete="name" placeholder="請輸入會友名冊上的姓名" value="${esc(memberName)}"><small>姓名會與已綁定的會友名冊核對，不使用 LINE 顯示名稱代替。</small></label><h3>選擇服事類別（可複選）</h3><div class="choice-grid">${Object.entries(ministries).map(([key,value])=>`<button type="button" class="choice ${selectedMinistries.has(key)?'selected':''}" data-ministry="${key}"><span>${value[0]}</span><div><strong>${value[1]}</strong><small>查看可參與的服事項目</small></div></button>`).join('')}</div>`;
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
  if(!season())view=view==='done'?'done':'list';
  if(view===null){view=data.registrations?.length?'list':'form';canReturnToList=view==='list';}
  if(view==='list'){renderRegistrationList();return;}
  if(view==='done'){renderCompletion();return;}
  if(step===1)renderIdentityAndMinistries();
  else if(step===2)renderRoles();
  else if(step===3)renderRoleDates();
  else renderConfirmation();
}

async function submit(){
  if(busy)return;
  const choices=chosenChoices();
  if(!memberName.trim()||!choices.length)return;
  setBusy(true);
  const button=$('#submit');
  button.disabled=true;
  try{
    const result=await api('service_signup_register_batch',{memberName:memberName.trim(),choices});
    const records=result.registrations||[],waitlisted=records.filter(record=>record.status==='waitlisted').length;
    memberName=result.member_name||memberName.trim();selectedMinistries.clear();selectedRoles.clear();roleSlots.clear();roleIndex=0;step=1;
    await refreshAfterMutation(`已完成 ${records.length} 筆登記${waitlisted?`，其中 ${waitlisted} 筆為候補`:''}。負責人確認班表後會再通知。`);
  }catch(error){
    const messages={member_name_required:'請先填寫姓名。',member_name_mismatch:'姓名與會友名冊不一致，請輸入名冊上的姓名或聯絡同工確認。',one_service_per_sunday:'選擇中有重複日期，或該主日已登記其他服事。',slot_unavailable:'部分名額已停止登記，請重新選擇。',binding_required:'LINE 尚未完成會友綁定。'};
    alert(messages[error.code]||'暫時無法送出，請稍後再試。');
  }finally{setBusy(false);if(button.isConnected)button.disabled=false;}
}

async function cancelRegistration(id,{reselect=false,confirmed=false}={}){
  if(busy||needsRefresh)return;
  const startsOn=(data.service_journey?.registration_details||[]).find(item=>Number(item.id)===id)?.season_starts_on||season()?.starts_on;
  const started=startsOn&&new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date())>=startsOn;
  if(!confirmed&&!confirm(started?'是否提出取消這筆服事的申請？會先送交服事領袖初審，再由鈺庭複審。':'確定刪除這筆服事登記？其他登記會保留。'))return;
  setBusy(true);
  try{
    const result=await api('service_signup_cancel',{registrationId:id});
    await refreshAfterMutation(result.direct?'這筆服事登記已刪除。':'取消申請已送出，等待服事領袖初審；審核通過前保留原登記。');
    setBusy(false);
    if(result.direct&&!needsRefresh&&(reselect||confirm('已刪除這筆登記。是否重新選擇服事與日期？')))openRegistrationForm();
  }
  catch{alert('取消未完成，請稍後再試。');}
  finally{setBusy(false);}
}
async function adjustRegistration(id){
  if(busy||needsRefresh)return;
  const details=(data.service_journey?.registration_details||[]).find(item=>Number(item.id)===id);
  const currentSeason={starts_on:details?.season_starts_on||season()?.starts_on},today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
  if(currentSeason?.starts_on&&today<currentSeason.starts_on){
    if(confirm('是否重新選擇服事與日期？確認後會先刪除這筆登記，再展開重新登記；其他登記會保留。'))await cancelRegistration(id,{reselect:true,confirmed:true});
    return;
  }
  const note=prompt('請寫下希望調整的日期、服事項目或其他需求。服事領袖會先與你協調，再送鈺庭複審。','');
  if(!note?.trim()||busy)return;
  setBusy(true);
  try{await api('service_signup_change_request',{registrationId:id,requestType:'adjust',note:note.trim()});await refreshAfterMutation('調整需求已送出，等待服事領袖初審；審核通過前保留原登記。');}
  catch(error){alert(error.code==='request_exists'?'這筆服事已有待審申請。':'申請未送出，請稍後再試。');}
  finally{setBusy(false);}
}
async function respondOffer(id,accept){
  if(busy||needsRefresh)return;
  setBusy(true);
  try{await api('service_signup_offer',{registrationId:id,accept});await refreshAfterMutation('已接受候補邀請。');}
  catch(error){alert(error.code==='offer_expired'?'確認期限已過，系統會通知下一位候補。':'目前無法回覆候補邀請，請重新載入。');data=await api('content',{feature:'service_signup'}).catch(()=>data);render();}
  finally{setBusy(false);}
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
