import {assistantChurch, buildAppointmentDraft} from './pastoral-assistant-management.mjs?v=20260924-2';
import {authenticateStaff, signOut, staffLineIdToken} from './auth.mjs?v=20260925-1';
import {PASTORAL_CALENDAR_ENDPOINT} from './config.mjs?v=20260925-1';
const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
let church;
let calendarConnected = false;
let previewMode = false;
let staffRole = '';
let scheduleStaff = [];
let currentStaffId = '';
let pendingCalendarRequestId = null;

async function calendarApi(action, payload = {}) {
  const token = await staffLineIdToken();
  const response = await fetch(PASTORAL_CALENDAR_ENDPOINT, {
    method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
    body: JSON.stringify({action, ...payload}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = {calendar_not_configured:'Google 行事曆授權尚未設定。', calendar_not_connected:'尚未連接 M+ 共用行事曆。',
      pastor_required:'只有牧師或管理者可以連接共用行事曆。', mplus_access_required:'此帳號沒有 M+ 行事曆權限。',
      calendar_unavailable:'目前無法查詢行事曆，請稍後重試。', login_required:'LINE 登入已失效，請重新登入。',
      rest_day:'當天是這位同工設定的休息日。', outside_schedule:'此時間不在該同工可安排時段內。',
      emergency_not_allowed:'此同工的設定不允許緊急行程例外。', calendar_conflict:'行事曆時段已被占用，請重新查詢其他時間。', invalid_staff:'請選擇有效的 M+ 同工。', confirmation_required:'請先在確認視窗按下建立。'}[result.error];
    throw new Error(message || '行事曆服務暫時無法使用。');
  }
  return result;
}

function setCalendarStatus(connected, email) {
  calendarConnected = connected;
  $('#calendar-dot').style.background = connected ? '#64876b' : '#ba8b48';
  $('#calendar-connection-title').textContent = connected ? 'M+ 共用行事曆已連接' : 'Google 行事曆尚未連接';
  $('#calendar-connection-copy').textContent = connected
    ? `已連接 ${email || 'mbot@tcsc.org.tw'}。查詢僅回傳忙碌時段；不讀取行程標題。`
    : '授權後可查詢 M+ 共用行事曆空檔；連線只供已授權的教會同工使用。';
  $('#calendar-connection-label').textContent = connected ? '已連線' : '等待授權';
  $('#connect-calendar').hidden = previewMode || connected || !['pastor', 'admin'].includes(staffRole);
  $('#check-freebusy').hidden = previewMode || !connected;
}

function activateTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`#panel-${button.dataset.tab}`).hidden = !active;
  });
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

$('#draft-form').addEventListener('input', () => {
  $('#draft-result').hidden = true;
  $('#draft-text').textContent = '';
  $('#draft-status').textContent = '';
  $('#create-event').hidden = true;
  $('#create-event-status').textContent = '';
  pendingCalendarRequestId = null;
});
$('#draft-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    $('#draft-text').textContent = buildAppointmentDraft({church, summary: $('#summary').value,
      date: $('#date').value, time: $('#time').value, duration: $('#duration').value, location: $('#location').value});
    $('#draft-result').hidden = false;
    $('#draft-status').textContent = '草稿已整理，尚未排入行事曆。';
  } catch (error) { $('#draft-status').textContent = error.message; }
});
$('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#draft-text').textContent); $('#draft-status').textContent = '已複製草稿，可以貼給同工確認。'; }
  catch { $('#draft-status').textContent = '無法自動複製，請選取上方文字後複製。'; }
});

async function loadScheduleSettings(){
  const result=await calendarApi('list-schedule-staff');
  scheduleStaff=result.staff||[];
  const appointmentSelect=$('#appointment-staff');
  appointmentSelect.replaceChildren(...scheduleStaff.map(person=>{const option=document.createElement('option');option.value=person.id;option.textContent=person.name;return option;}));
  appointmentSelect.value=currentStaffId;
  $('#appointment-staff-field').hidden=false;
  const select=$('#schedule-staff');
  select.replaceChildren(...scheduleStaff.map(person=>{
    const option=document.createElement('option'); option.value=person.id; option.textContent=person.name; return option;
  }));
  select.addEventListener('change',renderScheduleSettings);
  renderScheduleSettings();
}
function renderScheduleSettings(){
  const person=scheduleStaff.find(item=>item.id===$('#schedule-staff').value);
  if(!person)return;
  document.querySelectorAll('input[name="rest-day"]').forEach(box=>{box.checked=person.restDays.includes(Number(box.value));});
  $('#schedule-start').value=person.workStart;
  $('#schedule-end').value=person.workEnd;
  $('#schedule-emergency').checked=person.allowEmergencyOverride;
  $('#schedule-status').textContent='';
}
$('#schedule-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#save-schedule'),status=$('#schedule-status');
  button.disabled=true; status.textContent='正在儲存個人排程設定…';
  try{
    const person={
      staffId:$('#schedule-staff').value,
      restDays:[...document.querySelectorAll('input[name="rest-day"]:checked')].map(box=>Number(box.value)),
      workStart:$('#schedule-start').value,workEnd:$('#schedule-end').value,
      allowEmergencyOverride:$('#schedule-emergency').checked,
    };
    await calendarApi('save-schedule-preferences',person);
    Object.assign(scheduleStaff.find(item=>item.id===person.staffId),person);
    status.textContent='個人設定已儲存，行程檢查會使用這份設定。';
  }catch(error){status.textContent=error.message||'無法儲存設定。';}
  finally{button.disabled=false;}
});

async function load() {
  try {
    let staff;
    const preview = params.get('preview') === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    previewMode = preview;
    if (preview) {
      // Localhost-only static preview. Never fetches private records or tokens.
      staff = {name: '示範使用者', role: 'pastor', churches: ['M+']};
      $('#auth-status').textContent = '本機介面預覽：示範身分，不連接 LINE、會友資料或 Google 行事曆。';
    } else {
      staff = await authenticateStaff();
      $('#auth-status').textContent = '已驗證 LINE 身分與教會同工授權。';
    }
    staffRole = staff.role;
    currentStaffId = staff.id || '';
    $('#tab-schedule').hidden = preview || !['pastor','admin'].includes(staffRole);
    church = assistantChurch(staff, params.get('church'));
    $('#church-name').textContent = (church === 'M+' ? 'M＋大雅教會' : '火樂教會') + ' / PASTORAL ASSISTANT';
    $('#identity').textContent = `${staff.name}｜${{pastor:'牧師',secretary:'同工',admin:'管理者'}[staff.role]}`;
    $('#back').hidden = false;
    $('#back').addEventListener('click', event => { event.preventDefault(); signOut(); });
    $('#workspace').hidden = false;
    if (!preview) {
      try { const status = await calendarApi('status'); setCalendarStatus(status.connected, status.accountEmail); }
      catch { setCalendarStatus(false, null); $('#calendar-connection-copy').textContent = '目前無法確認行事曆連線狀態，請稍後重新整理。'; }
    } else setCalendarStatus(false, null);
    if (!preview && ['pastor','admin'].includes(staffRole)) { try { await loadScheduleSettings(); } catch {} }
  } catch (error) {
    $('#workspace').hidden = true;
    $('#auth-status').textContent = error.message || '無法載入工作台。';
    $('#login').hidden = false;
  }
}
$('#connect-calendar').addEventListener('click', async () => {
  const button = $('#connect-calendar');
  button.disabled = true; button.textContent = '正在開啟 Google 授權…';
  try { const result = await calendarApi('connect'); location.assign(result.authorizationUrl); }
  catch (error) { $('#calendar-connection-copy').textContent = error.message; button.disabled = false; button.textContent = '連接共用行事曆'; }
});

$('#check-freebusy').addEventListener('click', async () => {
  const button = $('#check-freebusy'), result = $('#calendar-query-result');
  button.disabled = true; result.textContent = '正在檢查同工排程與 M+ 共用行事曆…';
  $('#create-event').hidden = true;
  $('#create-event-status').textContent = '';
  pendingCalendarRequestId = null;
  try {
    const date = $('#date').value, time = $('#time').value, duration = Number($('#duration').value);
    if (!date || !time || ![30, 60, 90, 120].includes(duration)) throw new Error('請先填妥日期、開始時間與時長。');
    const start = new Date(`${date}T${time}:00+08:00`);
    const end = new Date(start.getTime() + duration * 60000);
    if (!Number.isFinite(start.getTime()) || end <= start) throw new Error('日期或時間不正確。');
    const availability = await calendarApi('check-availability', {
      staffId:$('#appointment-staff').value || currentStaffId,
      summary:$('#summary').value.trim(), location:$('#location').value.trim(),
      start:start.toISOString(), end:end.toISOString(), emergency:$('#emergency').checked,
    });
    result.textContent = availability.available
      ? '符合這位同工的個人排程，M+ 共用行事曆在此時段及前後 30 分鐘也沒有安排。'
      : '這段時間或前後 30 分鐘已有行事曆安排，請與同工確認其他時段。';
    if (availability.available && ['pastor','admin'].includes(staffRole)) {
      pendingCalendarRequestId = crypto.randomUUID();
      $('#create-event').hidden = false;
    }
  } catch (error) { result.textContent = error.message || '無法查詢行事曆。'; }
  finally { button.disabled = false; }
});


$('#create-event').addEventListener('click', () => {
  if (!pendingCalendarRequestId) return;
  const person=scheduleStaff.find(item=>item.id===$('#appointment-staff').value);
  const target=person?.name||'目前登入同工';
  $('#event-confirm-details').textContent=`${target}｜${$('#date').value} ${$('#time').value}｜${$('#duration').value} 分鐘｜${$('#summary').value.trim()}${$('#location').value.trim()? `｜${$('#location').value.trim()}`:''}`;
  $('#event-confirm-dialog').showModal();
});
$('#cancel-create-event').addEventListener('click', () => $('#event-confirm-dialog').close());
$('#confirm-create-event').addEventListener('click', async () => {
  const button=$('#confirm-create-event'),status=$('#create-event-status');
  button.disabled=true; button.textContent='正在建立…';
  try{
    const date=$('#date').value,time=$('#time').value,duration=Number($('#duration').value);
    const start=new Date(`${date}T${time}:00+08:00`),end=new Date(start.getTime()+duration*60000);
    const result=await calendarApi('create-event',{
      staffId:$('#appointment-staff').value||currentStaffId,
      summary:$('#summary').value.trim(),location:$('#location').value.trim(),
      start:start.toISOString(),end:end.toISOString(),emergency:$('#emergency').checked,
      requestId:pendingCalendarRequestId,confirmed:true,
    });
    $('#event-confirm-dialog').close();
    $('#create-event').hidden=true;
    status.textContent=result.created?'已建立活動到 M+ 共用行事曆，沒有寄送邀請通知。':'這項活動先前已建立，未重複新增。';
    pendingCalendarRequestId=null;
  }catch(error){
    status.textContent=error.message||'目前無法建立活動，請稍後重試。';
  }finally{
    button.disabled=false;button.textContent='確認建立';
  }
});

$('#draft-form').addEventListener('input', () => { $('#calendar-query-result').textContent = ''; });

load();
