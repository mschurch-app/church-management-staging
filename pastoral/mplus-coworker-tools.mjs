import {draftGuard,lockControls} from '../app-workflow.mjs?v=20261022-experience2';
import {mountMplusFunctionNavigation} from '../mplus-function-nav.mjs?v=20261020-dock1';
import { authenticateStaff, signOut, staffLineIdToken } from './auth.mjs?v=20261009-stage4';
import { PASTORAL_CALENDAR_ENDPOINT, PASTORAL_TOOLS_ENDPOINT } from './config.mjs?v=20260930-1';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
let staff;
let leaveBusy=false,clockBusy=false,leaveGeneration=0,attendanceGeneration=0;
const leaveDraft=draftGuard(document.querySelector('#leave-form'));
function toolMessage(selector,message,tone='neutral'){const node=document.querySelector(selector);node.textContent=message;node.dataset.tone=tone;}
let entityKey = 'mplus';
let entityKeys = [];

const entityNames = { mplus: 'M+大雅教會', shine: '火樂教會', tcsc: '台灣基督教社會關懷協會' };
const churchKeys = { 'M+': 'mplus', 'SHiNE': 'shine', '台灣基督教社會關懷協會': 'tcsc' };
const errorText = {
  login_required: '教會 OS 登入已失效，請重新登入。',
  staff_forbidden: '此教會 OS 帳號尚未獲授權使用同工工具。',
  entity_forbidden: '你沒有這個單位的使用權限。',
  already_clocked_in: '今天已經完成上班打卡。',
  clock_in_required: '請先完成上班打卡，再下班打卡。',
  already_clocked_out: '今天已經完成下班打卡。',
  invalid_leave: '請確認請假日期、時段與類別。',
  leave_overlap: '這段日期已有一筆待處理或已核准的請假。',
  leave_not_pending: '這筆申請已處理。',
  drive_not_connected: 'Google 雲端硬碟尚未授權，請先按「授權 Google 雲端硬碟」。',
  drive_not_configured: '雲端硬碟服務尚未完成設定。',
  drive_permission_required: 'Google 授權尚未包含雲端硬碟，請重新授權後再試。',
  drive_folder_not_set: '請先設定照片共用資料夾。',
  drive_picker_not_configured: '尚未完成 Google 共用資料夾選擇器設定。',
  drive_folder_access_required: '目前授權無法使用此資料夾，請重新選擇共用資料夾。',
  drive_folder_forbidden: '這個資料夾不可新增檔案，請選擇有編輯權的資料夾。',
  invalid_photo: '請選擇 JPG、PNG 或 WebP 照片，且檔案不可超過 10 MB。',
  drive_upload_failed: '上傳到 Google 雲端硬碟失敗，請稍後再試。',
  forbidden: '你沒有權限處理這項操作。',
};

async function api(action, payload = {}) {
  const token = await staffLineIdToken();
  const response = await fetch(PASTORAL_TOOLS_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ action, entityKey, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok||result.ok!==true) throw new Error(errorText[result.error] || '尚無法確認操作結果，請先重新讀取原紀錄，避免重複送出。');
  return result;
}
function setPhotoFormEnabled(enabled) {
  $('#photo-form').querySelectorAll('input,button').forEach(control=>{control.disabled=!enabled;});
}
async function loadToolsStatus() {
  const status=$('#drive-setup-status'),formStatus=$('#photo-status');
  try {
    const state=await api('tools-status'),ready=state.driveConnected&&state.folderConfigured;
    setPhotoFormEnabled(ready);
    if(!state.driveConnected){status.textContent='尚未授權 Google 雲端硬碟。請先按「授權 Google 雲端硬碟」。';formStatus.textContent='完成 Google 授權後才能上傳照片。';}
    else if(!state.folderConfigured){status.textContent='Google 已授權，尚未選擇教會共用資料夾。';formStatus.textContent='請先按「選擇共用資料夾」。';}
    else {status.textContent='Google 雲端硬碟與共用資料夾已設定完成。';formStatus.textContent='可以選擇照片上傳。';}
  } catch(error) {setPhotoFormEnabled(false);status.textContent=error.message;formStatus.textContent='目前無法確認照片歸檔設定。';}
}
function showItems(container, items, emptyText) {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = emptyText;
    container.append(empty); return;
  }
}
function newCard(title, content) {
  const card = document.createElement('article'); card.className = 'record-card';
  const heading = document.createElement('h3'); heading.textContent = title;
  card.append(heading);
  if (content) { const body = document.createElement('p'); body.textContent = content; card.append(body); }
  return card;
}
function meta(card, text) {
  const row = card.querySelector('.record-meta') || document.createElement('div'); row.className = 'record-meta';
  const item = document.createElement('span'); item.textContent = text; row.append(item);
  if (!row.parentNode) card.append(row);
}
function activateTab(name) {
  if(!['attendance','photos'].includes(name))name='attendance';
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    const panel = $(`#panel-${button.dataset.tab}`);
    if (panel) panel.hidden = !active;
  });
  mountMplusFunctionNavigation({church:'M+',center:name==='photos'?'website':'admin'});
  const titles={attendance:'出勤與請假',photos:'照片資料庫'};
  if($('#tools-page-title'))$('#tools-page-title').textContent=titles[name]||'團隊工具';
  document.querySelectorAll('[data-tool-nav]').forEach(link=>link.classList.toggle('is-active',link.dataset.toolNav===name));
  const url = new URL(location.href); url.searchParams.set('tab', name); history.replaceState(null, '', url);
  if (name === 'attendance') { loadAttendance(); loadLeave(); if (['pastor', 'admin'].includes(staff?.role)) loadAttendanceAdmin(); }
  if (name === 'photos') { loadToolsStatus(); loadPhotos(); }
}
const tabs = [...document.querySelectorAll('[data-tab]')];
tabs.forEach((button, index) => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') target = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === 'Home') target = tabs[0];
    if (event.key === 'End') target = tabs.at(-1);
    if (target) { event.preventDefault(); activateTab(target.dataset.tab); target.focus(); }
  });
});
$('#sign-out').addEventListener('click',()=>location.replace('../mplus-dashboard.html?church=M%2B'));

async function loadAttendance() {
  $('#attendance-date').textContent=new Date().toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'full'});
  try{const {item}=await api('today-attendance');
   const format=value=>value?new Date(value).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}):'';
   $('#attendance-status').textContent=item?`上班 ${format(item.clocked_in_at)||'尚未打卡'} · 下班 ${format(item.clocked_out_at)||'尚未打卡'}`:'今天尚未打卡';
   $('#clock-in').disabled=Boolean(item);$('#clock-out').disabled=!item?.clocked_in_at||Boolean(item?.clocked_out_at);return true;
  }catch(error){$('#clock-in').disabled=true;$('#clock-out').disabled=true;toolMessage('#attendance-message','尚無法讀取打卡狀態，請按「重新讀取打卡狀態」，勿重複打卡。','warning');return false;}
}
async function clock(action){
 if(clockBusy)return;clockBusy=true;const row=$('#clock-in').parentElement,unlock=lockControls(row);let saved=false,error=null;
 toolMessage('#attendance-message',action==='clock-in'?'正在記錄上班時間…':'正在記錄下班時間…','busy');
 try{await api(action);saved=true;}catch(e){error=e;}finally{unlock();row.setAttribute('aria-busy','true');}
 try{const loaded=await loadAttendance();toolMessage('#attendance-message',saved?(loaded?(action==='clock-in'?'已記錄上班時間。':'已記錄下班時間。'):'打卡已記錄，但狀態尚未讀回；請重新讀取，勿再次打卡。'):(error?.message||'尚無法確認打卡結果，請重新讀取。'),saved&&loaded?'success':'warning');}
 finally{clockBusy=false;row.removeAttribute('aria-busy');}
}
$('#clock-in').addEventListener('click',()=>void clock('clock-in'));
$('#clock-out').addEventListener('click',()=>void clock('clock-out'));
$('#refresh-clock').addEventListener('click',async()=>{if(clockBusy)return;clockBusy=true;$('#refresh-clock').disabled=true;try{if(await loadAttendance())toolMessage('#attendance-message','已重新讀取打卡狀態。','success');}finally{clockBusy=false;$('#refresh-clock').disabled=false;}});
$('#leave-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;if(leaveBusy||!form.reportValidity())return;
 if($('#leave-end').value<$('#leave-start').value){$('#leave-end').setCustomValidity('結束日期不可早於開始日期。');$('#leave-end').reportValidity();return;}
 leaveBusy=true;const unlock=lockControls(form);toolMessage('#leave-status','正在送出請假申請，請勿重複送出…','busy');
 try{await api('create-leave',{startDate:$('#leave-start').value,endDate:$('#leave-end').value,period:$('#leave-period').value,leaveType:$('#leave-type').value,reason:$('#leave-reason').value});form.reset();leaveDraft.clear();const loaded=await loadLeave();toolMessage('#leave-status',loaded?'申請已送出，原因只有你和核准同工可看。':'請假申請已送出，但紀錄尚未讀回；請重新整理請假紀錄，勿再送出。',loaded?'success':'warning');}
 catch(error){toolMessage('#leave-status',error.message,'error');}
 finally{unlock();leaveBusy=false;}
});
for(const id of ['leave-start','leave-end'])$('#'+id).addEventListener('input',()=>$('#leave-end').setCustomValidity(''));
const leaveLabels = { annual: '休假', personal: '事假', sick: '病假', family: '家庭照顧', other: '其他' };
const leaveStatus = { pending: '等候核准', approved: '已核准', rejected: '未核准', cancelled: '已取消' };
const periodLabels = { full_day: '全天', morning: '上午', afternoon: '下午' };
async function loadLeave() {
  const list = $('#leave-list'),ticket=++leaveGeneration;list.setAttribute('aria-busy','true');$('#refresh-leave').disabled=true;$('#refresh-leave').setAttribute('aria-busy','true');
  try {
    const { items } = await api('list-leave');if(ticket!==leaveGeneration)return false;list.replaceChildren();
    showItems(list, items, '還沒有請假申請。');
    for (const item of items) {
      const card = newCard(`${item.staff_name ? item.staff_name + ' · ' : ''}${item.start_date}${item.end_date === item.start_date ? '' : ' 至 ' + item.end_date}`, item.reason || '（未填寫原因）');
      meta(card, `${leaveLabels[item.leave_type] || item.leave_type} · ${periodLabels[item.period] || item.period}`);
      meta(card, leaveStatus[item.status] || item.status);
      if (item.review_note) meta(card, `核准回覆：${item.review_note}`);
      if (['pastor', 'admin'].includes(staff.role) && item.status === 'pending') {
        const actions = document.createElement('div'); actions.className = 'record-actions';
        for (const [decision, label] of [['approved', '核准'], ['rejected', '暫不核准']]) {
          const button = document.createElement('button'); button.className = 'button secondary'; button.type = 'button'; button.textContent = label;
          button.addEventListener('click', async () => {
            if(actions.getAttribute('aria-busy')==='true')return;const unlock=lockControls(actions);let saved=false;toolMessage('#leave-status','正在儲存請假審核結果…','busy');
            try{await api('review-leave',{leaveId:item.id,decision});saved=true;const loaded=await loadLeave();toolMessage('#leave-status',loaded?'請假審核結果已儲存。':'審核結果已儲存，請重新整理紀錄，勿再次審核。',loaded?'success':'warning');}
            catch(error){toolMessage('#leave-status',error.message,'error');}
            finally{unlock();if(saved&&actions.isConnected)actions.querySelectorAll('button').forEach(node=>node.disabled=true);}
          }); actions.append(button);
        }
        card.append(actions);
      }
      list.append(card);
    }
    return true;
  }catch(error){if(ticket===leaveGeneration)toolMessage('#leave-status','請假紀錄暫時無法讀取，原有紀錄保留；請重新整理。','warning');return false;}finally{if(ticket===leaveGeneration){list.removeAttribute('aria-busy');$('#refresh-leave').disabled=false;$('#refresh-leave').removeAttribute('aria-busy');}}
}
$('#refresh-attendance').addEventListener('click', loadAttendanceAdmin);
async function loadAttendanceAdmin() {
  const list = $('#attendance-list'); if (!list) return;
  const ticket=++attendanceGeneration,key=entityKey;list.setAttribute('aria-busy','true');$('#refresh-attendance').disabled=true;
  try {
    const { items } = await api('list-attendance');if(ticket!==attendanceGeneration||key!==entityKey)return;list.replaceChildren();
    showItems(list, items, '最近七天尚無出勤紀錄。');
    for (const item of items) {
      const inTime = item.clocked_in_at ? new Date(item.clocked_in_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }) : '未打卡';
      const outTime = item.clocked_out_at ? new Date(item.clocked_out_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }) : '尚未下班';
      const card = newCard(item.staff_name, item.work_date);
      meta(card, `上班 ${inTime} · 下班 ${outTime}`);
      list.append(card);
    }
  }catch(error){if(ticket===attendanceGeneration){list.querySelector('[data-load-error]')?.remove();const note=document.createElement('p');note.dataset.loadError='true';note.textContent='出勤紀錄暫時無法讀取，原有內容保留；請重新整理。';list.prepend(note);}}finally{if(ticket===attendanceGeneration){list.removeAttribute('aria-busy');$('#refresh-attendance').disabled=false;}}
}
$('#refresh-leave').addEventListener('click', loadLeave);

async function loadPhotos() {
  const list = $('#photo-list'); list.replaceChildren();
  try {
    const { items } = await api('list-photos');
    showItems(list, items, '還沒有歸檔的照片。');
    for (const item of items) {
      const card = newCard(item.album || item.file_name, item.caption || '');
      meta(card, `${new Date(item.created_at).toLocaleString('zh-TW')} · ${(item.size_bytes / 1024 / 1024).toFixed(1)} MB`);
      const actions = document.createElement('div'); actions.className = 'record-actions';
      const link = document.createElement('a'); link.className = 'button secondary record-link'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '在 Google 雲端硬碟開啟';
      link.href = `https://drive.google.com/open?id=${encodeURIComponent(item.drive_file_id)}`;
      actions.append(link); card.append(actions); list.append(card);
    }
  } catch (error) { list.textContent = error.message; }
}
$('#photo-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, file = $('#photo-file').files?.[0], button = $('#upload-photo');
  if (!file) return;
  button.disabled = true; $('#photo-status').textContent = '正在直接上傳到 Google 共用資料夾…';
  try {
    const idToken = await staffLineIdToken(), data = new FormData();
    data.set('idToken', idToken); data.set('action', 'upload-photo'); data.set('entityKey', entityKey);
    data.set('album', $('#photo-album').value); data.set('caption', $('#photo-caption').value); data.set('file', file);
    const response = await fetch(PASTORAL_TOOLS_ENDPOINT, { method: 'POST', body: data, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(40000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorText[result.error] || '上傳失敗，請稍後再試。');
    form.reset(); $('#photo-status').textContent = '照片已歸檔到 Google 共用資料夾。'; await loadPhotos();
  } catch (error) { $('#photo-status').textContent = error.message || '無法上傳照片。'; }
  finally { button.disabled = false; }
});
$('#refresh-photos').addEventListener('click', loadPhotos);

async function authorizeDrive() {
  const token = await staffLineIdToken();
  const response = await fetch(PASTORAL_CALENDAR_ENDPOINT, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
    body: JSON.stringify({ action: 'connect-drive' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.authorizationUrl) throw new Error(errorText[result.error] || '無法啟動 Google 授權。');
  location.assign(result.authorizationUrl);
}
$('#authorize-drive').addEventListener('click', async () => {
  $('#drive-setup-status').textContent = '正在開啟 Google 授權…';
  try { await authorizeDrive(); } catch (error) { $('#drive-setup-status').textContent = error.message; }
});

function loadPickerSdk() {
  return new Promise((resolve, reject) => {
    if (window.gapi?.load) { window.gapi.load('picker', { callback: resolve }); return; }
    const script = document.createElement('script'); script.src = 'https://apis.google.com/js/api.js'; script.onload = () => window.gapi.load('picker', { callback: resolve });
    script.onerror = () => reject(new Error('無法載入 Google 資料夾選擇器。')); document.head.append(script);
  });
}
$('#choose-folder').addEventListener('click', async () => {
  const status = $('#drive-setup-status'); status.textContent = '正在開啟共用資料夾選擇器…';
  try {
    const config = await api('picker-config'); await loadPickerSdk();
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setEnableDrives(true);
    const picker = new google.picker.PickerBuilder().addView(view).setOAuthToken(config.accessToken).setDeveloperKey(config.apiKey).setAppId(config.appId).setOrigin(location.origin)
      .setTitle('選擇照片歸檔用的共用資料夾').setCallback(async data => {
        if (data.action !== google.picker.Action.PICKED) return;
        const folderId = data.docs?.[0]?.id; if (!folderId) return;
        status.textContent = '正在確認資料夾寫入權限…';
        try { const saved = await api('set-drive-folder', { folderId }); status.textContent = `已設定「${saved.folderName}」。`; await loadToolsStatus(); }
        catch (error) { status.textContent = error.message; }
      }).build();
    picker.setVisible(true); status.textContent = '請選擇同工有編輯權的 Google 共用資料夾。';
  } catch (error) { status.textContent = error.message || '資料夾選擇器無法使用。'; }
});

async function start() {
  try {
    staff = await authenticateStaff({ interactive: true, returnUrl: location.href });
    entityKeys = [...new Set((staff.churches || []).map(name => churchKeys[name]).filter(Boolean))];
    if (!entityKeys.includes('mplus')) throw new Error('此入口僅適用 M＋同工，請返回所屬堂會的教會 OS。');
    entityKeys=['mplus'];
    $('#entity').replaceChildren(...entityKeys.map(key => { const option = document.createElement('option'); option.value = key; option.textContent = entityNames[key]; return option; }));
    entityKey = entityKeys.includes('mplus') ? 'mplus' : entityKeys[0]; $('#entity').value = entityKey;
    $('#drive-admin-tools').hidden = !['pastor', 'admin'].includes(staff.role);
    $('#attendance-admin-card').hidden = !['pastor', 'admin'].includes(staff.role);
    $('#auth-status').textContent = `已登入：${staff.name}。出勤、請假與照片依你的同工權限管理。`;
    $('#tools').hidden = false;
    const initial = ['attendance', 'photos'].includes(params.get('tab')) ? params.get('tab') : 'attendance';
    activateTab(initial);
  } catch (error) {
    $('#auth-status').textContent = error.message || '無法確認同工權限，請先登入教會 OS；原有 LINE 入口仍可使用。';
  }
}
start();
