import {assistantChurch, buildAppointmentDraft} from './pastoral-assistant-management.mjs?v=20260924-2';
import {authenticateStaff, signOut, staffLineIdToken} from './auth.mjs?v=20260925-1';
import {PASTORAL_CALENDAR_ENDPOINT} from './config.mjs?v=20260925-1';
const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
let church;
let calendarConnected = false;
let previewMode = false;
let staffRole = '';

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
      calendar_unavailable:'目前無法查詢行事曆，請稍後重試。', login_required:'LINE 登入已失效，請重新登入。'}[result.error];
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
  try { await navigator.clipboard.writeText($('#draft-text').textContent); $('#draft-status').textContent = '已複製草稿，可以貼給秘書確認。'; }
  catch { $('#draft-status').textContent = '無法自動複製，請選取上方文字後複製。'; }
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
    church = assistantChurch(staff, params.get('church'));
    $('#church-name').textContent = (church === 'M+' ? 'M＋大雅教會' : '火樂教會') + ' / PASTORAL ASSISTANT';
    $('#identity').textContent = `${staff.name}｜${{pastor:'牧師',secretary:'秘書',admin:'管理者'}[staff.role]}`;
    $('#back').hidden = false;
    $('#back').addEventListener('click', event => { event.preventDefault(); signOut(); });
    $('#workspace').hidden = false;
    if (!preview) {
      try { const status = await calendarApi('status'); setCalendarStatus(status.connected, status.accountEmail); }
      catch { setCalendarStatus(false, null); $('#calendar-connection-copy').textContent = '目前無法確認行事曆連線狀態，請稍後重新整理。'; }
    } else setCalendarStatus(false, null);
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
  button.disabled = true; result.textContent = '正在查詢 M+ 共用行事曆…';
  try {
    const date = $('#date').value, time = $('#time').value, duration = Number($('#duration').value);
    if (!date || !time || ![30, 60, 90, 120].includes(duration)) throw new Error('請先填妥日期、開始時間與時長。');
    const start = new Date(`${date}T${time}:00+08:00`);
    const end = new Date(start.getTime() + duration * 60000);
    if (!Number.isFinite(start.getTime()) || end <= start) throw new Error('日期或時間不正確。');
    const busy = await calendarApi('freebusy', {timeMin:new Date(start.getTime()-30*60000).toISOString(), timeMax:new Date(end.getTime()+30*60000).toISOString()});
    result.textContent = busy.busy.length ? '這段時間或前後 30 分鐘已有行事曆安排，請與同工確認其他時段。' : 'M+ 共用行事曆在此時段及前後 30 分鐘沒有安排。';
  } catch (error) { result.textContent = error.message || '無法查詢行事曆。'; }
  finally { button.disabled = false; }
});

$('#draft-form').addEventListener('input', () => { $('#calendar-query-result').textContent = ''; });

load();
