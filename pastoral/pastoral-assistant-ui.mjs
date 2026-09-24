import {assistantChurch, buildAppointmentDraft} from './pastoral-assistant-management.mjs?v=20260924-2';
import {authenticateStaff, signOut, staffLineIdToken} from './auth.mjs?v=20260925-1';
import {PASTORAL_CALENDAR_ENDPOINT, PASTORAL_TASKS_ENDPOINT} from './config.mjs?v=20260925-2';
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

function invalidateDraft(){
  $('#draft-result').hidden = true;
  $('#draft-text').textContent = '';
  $('#draft-status').textContent = '';
  $('#create-event').hidden = true;
  $('#create-event-status').textContent = '';
  pendingCalendarRequestId = null;
}
$('#draft-form').addEventListener('input', invalidateDraft);
$('#draft-form').addEventListener('change', invalidateDraft);
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
  currentStaffId=scheduleStaff.find(person=>person.isSelf)?.id||currentStaffId;
  const appointmentSelect=$('#appointment-staff');
  appointmentSelect.replaceChildren(...scheduleStaff.map(person=>{const option=document.createElement('option');option.value=person.id;option.textContent=person.name;return option;}));
  appointmentSelect.value=currentStaffId;
  $('#appointment-staff-field').hidden=false;
  const select=$('#schedule-staff');
  select.replaceChildren(...scheduleStaff.map(person=>{
    const option=document.createElement('option'); option.value=person.id; option.textContent=person.name; return option;
  }));
  $('#schedule-staff-field').hidden=!['pastor','admin'].includes(staffRole);
  select.disabled=!['pastor','admin'].includes(staffRole);
  select.value=currentStaffId;
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
    $('#task-form').hidden = preview || !['pastor','admin'].includes(staffRole);
    $('#tab-schedule').hidden = preview;
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
    if (!preview) { try { await loadScheduleSettings(); } catch { $('#schedule-status').textContent='目前無法載入休息日設定，請稍後重試。'; } }
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
  $('#event-confirm-status').textContent='';
  $('#event-confirm-dialog').showModal();
});
$('#cancel-create-event').addEventListener('click', () => $('#event-confirm-dialog').close());
$('#confirm-create-event').addEventListener('click', async () => {
  const button=$('#confirm-create-event'),status=$('#create-event-status');
  button.disabled=true; button.textContent='正在建立…';
  $('#event-confirm-status').textContent='正在再次確認排程與行事曆空檔…';
  try{
    const date=$('#date').value,time=$('#time').value,duration=Number($('#duration').value);
    const start=new Date(`${date}T${time}:00+08:00`),end=new Date(start.getTime()+duration*60000);
    const result=await calendarApi('create-event',{
      staffId:$('#appointment-staff').value||currentStaffId,
      summary:$('#summary').value.trim(),location:$('#location').value.trim(),
      start:start.toISOString(),end:end.toISOString(),emergency:$('#emergency').checked,
      requestId:pendingCalendarRequestId,confirmed:true,
    });
    $('#event-confirm-status').textContent='';
    $('#event-confirm-dialog').close();
    $('#create-event').hidden=true;
    status.textContent=result.created?'已建立活動到 M+ 共用行事曆，沒有寄送邀請通知。':'這項活動先前已建立，未重複新增。';
    pendingCalendarRequestId=null;
  }catch(error){
    $('#event-confirm-status').textContent=error.message||'目前無法建立活動，請稍後重試。';
  }finally{
    button.disabled=false;button.textContent='確認建立';
  }
});

$('#draft-form').addEventListener('input', () => { $('#calendar-query-result').textContent = ''; });


async function tasksApi(action,payload={}){
  const token=await staffLineIdToken();
  const response=await fetch(PASTORAL_TASKS_ENDPOINT,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000),
    body:JSON.stringify({action,entityKey:church==='M+'?'mplus':'shine',...payload}),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    const message={login_required:'LINE 登入已失效，請重新登入。',entity_forbidden:'沒有此堂會的同工工作權限。',
      pastor_required:'只有牧師或管理者可以建立、送交或核准工作。',invalid_assignee:'請選擇此堂會已啟用的同工。',
      invalid_task:'請檢查工作內容、期限及負責同工。',task_not_found:'找不到這項工作，請重新整理。',
      invalid_transition:'這項工作目前無法進行所選操作。'}[result.error];
    throw new Error(message||'同工工作服務暫時無法使用。');
  }
  return result;
}
const taskStatusText={draft:'草稿',pending:'待牧師核准',approved:'執行中',completed:'已完成',cancelled:'已取消'};
const taskTypeText={general:'一般',sermon:'講道',event:'活動',care:'關懷',document:'公文'};
function taskButton(label,id,action,secondary=false){
  const button=document.createElement('button');button.type='button';button.className='button'+(secondary?' secondary':'');
  button.textContent=label;button.dataset.taskId=id;button.dataset.taskAction=action;return button;
}
function renderTasks(tasks){
  const list=$('#task-list');list.replaceChildren();
  if(!tasks.length){const p=document.createElement('p');p.className='muted';p.textContent='目前沒有符合權限的工作。';list.append(p);return;}
  for(const task of tasks){
    const article=document.createElement('article');article.className='task-item';
    const top=document.createElement('div');top.className='task-item-top';
    const title=document.createElement('h3');title.textContent=task.title;top.append(title);
    const badge=document.createElement('span');badge.className='task-badge task-'+task.status;badge.textContent=taskStatusText[task.status]||task.status;top.append(badge);
    article.append(top);
    const meta=document.createElement('p');meta.className='task-meta';
    meta.textContent=`${taskTypeText[task.taskType]||'一般'}｜負責：${task.assigneeName||'未指派'}${task.dueAt?'｜期限：'+new Date(task.dueAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):''}`;
    article.append(meta);
    if(task.description){const description=document.createElement('p');description.className='task-description';description.textContent=task.description;article.append(description);}
    const actions=document.createElement('div');actions.className='task-actions';
    if(task.canSubmit)actions.append(taskButton('送交同工核准',task.id,'submit'));
    if(task.canApprove)actions.append(taskButton('核准並開始執行',task.id,'approve'));
    if(task.canComplete)actions.append(taskButton('標記完成',task.id,'complete',true));
    if(actions.childElementCount)article.append(actions);
    list.append(article);
  }
}
async function loadTasks(){
  if(previewMode)return;
  const status=$('#task-status');status.textContent='正在載入同工工作…';
  $('#refresh-tasks').disabled=true;
  try{
    const [result,people]=await Promise.all([tasksApi('list'),tasksApi('assignees')]);
    const select=$('#task-assignee'),previous=select.value;
    select.replaceChildren(...people.staff.map(person=>{const option=document.createElement('option');option.value=person.id;option.textContent=person.name;return option;}));
    if(people.staff.some(person=>person.id===previous))select.value=previous;
    renderTasks(result.tasks||[]);
    status.textContent=`已載入 ${(result.tasks||[]).length} 項工作。`;
  }catch(error){status.textContent=error.message||'無法載入同工工作。';}
  finally{$('#refresh-tasks').disabled=false;}
}
$('#tab-tasks').addEventListener('click',()=>loadTasks());
$('#refresh-tasks').addEventListener('click',()=>loadTasks());
$('#task-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!['pastor','admin'].includes(staffRole))return;
  const button=$('#save-task'),status=$('#task-form-status');button.disabled=true;status.textContent='正在儲存草稿…';
  try{
    const dueValue=$('#task-due').value;
    await tasksApi('create',{title:$('#task-title').value.trim(),description:$('#task-description').value.trim(),
      taskType:$('#task-type').value,assignedTo:$('#task-assignee').value,
      dueAt:dueValue?new Date(dueValue).toISOString():null,idempotencyKey:crypto.randomUUID()});
    $('#task-form').reset();status.textContent='草稿已儲存。可在工作清單中送交同工核准。';
    await loadTasks();
  }catch(error){status.textContent=error.message||'無法儲存工作。';}
  finally{button.disabled=false;}
});
$('#task-list').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-task-action]');if(!button)return;
  button.disabled=true;$('#task-status').textContent='正在更新工作狀態…';
  try{await tasksApi(button.dataset.taskAction,{taskId:button.dataset.taskId});await loadTasks();}
  catch(error){$('#task-status').textContent=error.message||'無法更新工作狀態。';button.disabled=false;}
});

load();
