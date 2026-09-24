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
let slotSearchSequence = 0;

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
      rest_day:'所選同工中有人當天休息，請改選時段。', outside_schedule:'所選同工中有人在這段時間不安排工作。',
      emergency_not_allowed:'所選同工中有人未開放緊急行程例外。', calendar_conflict:'行事曆時段已被占用，請重新查詢其他時間。', invalid_staff:'請選擇有效的 M+ 同工，最多 10 位。', invalid_window:'搜尋日期範圍請限 31 天內。', confirmation_required:'請先在確認視窗按下建立。'}[result.error];
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
  $('#find-slots').hidden = previewMode || !connected;
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

function calendarParticipantIds(){
  const primary=$('#appointment-staff').value||currentStaffId;
  return [...new Set([primary,...[...$('#appointment-participants').selectedOptions].map(option=>option.value)].filter(Boolean))];
}
function renderParticipantOptions(){
  const select=$('#appointment-participants'),previous=new Set([...select.selectedOptions].map(option=>option.value));
  const primary=$('#appointment-staff').value||currentStaffId;
  select.replaceChildren(...scheduleStaff.filter(person=>person.id!==primary).map(person=>{
    const option=document.createElement('option');option.value=person.id;option.textContent=person.name;
    option.selected=previous.has(person.id);return option;
  }));
}
function invalidateDraft(){
  $('#draft-result').hidden = true;
  $('#draft-text').textContent = '';
  $('#draft-status').textContent = '';
  $('#create-event').hidden = true;
  $('#create-event-status').textContent = '';
  $('#retry-event-notifications').hidden=true;
  $('#slot-search-status').textContent = '';
  $('#slot-search-results').replaceChildren();
  slotSearchSequence++;
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
  renderParticipantOptions();
  appointmentSelect.addEventListener('change',renderParticipantOptions);
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
    $('#task-form').hidden = preview;
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
    const requestedTab=params.get('tab');
    if(requestedTab==='tasks'){activateTab('tasks');await loadTasks();}
    else if(requestedTab==='progress')activateTab('progress');
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


$('#find-slots').addEventListener('click', async () => {
  const button=$('#find-slots'),status=$('#slot-search-status'),results=$('#slot-search-results');
  const request=++slotSearchSequence;
  button.disabled=true;results.replaceChildren();status.textContent='正在依照同工休息日、工作時段與共用行事曆搜尋…';
  try{
    const dateFrom=$('#slot-date-from').value,dateThrough=$('#slot-date-through').value;
    if(!dateFrom||!dateThrough)throw new Error('請選擇搜尋的起訖日期。');
    if(dateThrough<dateFrom)throw new Error('結束日期需晚於或等於開始日期。');
    const result=await calendarApi('find-available-slots',{
      staffId:$('#appointment-staff').value||currentStaffId,participantIds:calendarParticipantIds(),
      dateFrom,dateThrough,durationMinutes:Number($('#duration').value),
    });
    if(request!==slotSearchSequence)return;
    const slots=result.slots||[];
    if(!slots.length){status.textContent='這段日期內沒有符合條件的空檔，可調整日期或時長再搜尋。';return;}
    status.textContent=`找到 ${slots.length} 個時段；選擇後會再次確認行程與參與同工。`;
    for(const slot of slots){
      const option=document.createElement('button');option.type='button';option.className='slot-option';
      option.textContent=slot.label;option.addEventListener('click',()=>{
        if(!$('#summary').value.trim()){status.textContent='請先填寫行程名稱，再選擇可約時段。';$('#summary').focus();return;}
        $('#date').value=slot.date;$('#time').value=slot.time;
        $('#draft-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        $('#check-freebusy').click();
      });
      results.append(option);
    }
  }catch(error){if(request===slotSearchSequence)status.textContent=error.message||'無法搜尋可約時段。';}
  finally{button.disabled=false;}
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
      staffId:$('#appointment-staff').value || currentStaffId,participantIds:calendarParticipantIds(),
      summary:$('#summary').value.trim(), location:$('#location').value.trim(),
      start:start.toISOString(), end:end.toISOString(), emergency:$('#emergency').checked,
    });
    result.textContent = availability.available
      ? '所有參與同工的可安排時間皆符合，M+ 共用行事曆也沒有衝突。'
      : '共用行事曆已有安排，請改選其他時段。';
    if (availability.available) {
      pendingCalendarRequestId = crypto.randomUUID();
      $('#create-event').hidden = false;
    }
  } catch (error) { result.textContent = error.message || '無法查詢行事曆。'; }
  finally { button.disabled = false; }
});


$('#create-event').addEventListener('click', () => {
  if (!pendingCalendarRequestId) return;
  const person=scheduleStaff.find(item=>item.id===$('#appointment-staff').value);
  const names=calendarParticipantIds().map(id=>scheduleStaff.find(person=>person.id===id)?.name).filter(Boolean);
  const target=person?.name||'目前登入同工';
  $('#event-confirm-details').textContent=`主要安排：${target}｜共同參與：${names.join('、')}｜${$('#date').value} ${$('#time').value}｜${$('#duration').value} 分鐘｜${$('#summary').value.trim()}${$('#location').value.trim()? `｜${$('#location').value.trim()}`:''}`;
  $('#event-confirm-status').textContent='';
  $('#event-confirm-dialog').showModal();
});
$('#cancel-create-event').addEventListener('click', () => $('#event-confirm-dialog').close());
$('#retry-event-notifications').addEventListener('click',()=>{
  $('#event-confirm-title').textContent='重新通知參與同工';
  $('#event-confirm-details').textContent='行程已建立。系統只會重試尚未成功的 LINE 通知，不會重複建立活動。';
  $('#confirm-create-event').textContent='重新通知';
  $('#event-confirm-dialog').showModal();
});
$('#confirm-create-event').addEventListener('click', async () => {
  const button=$('#confirm-create-event'),status=$('#create-event-status');
  button.disabled=true; button.textContent='正在建立…';
  $('#event-confirm-status').textContent='正在再次確認排程與行事曆空檔…';
  try{
    const date=$('#date').value,time=$('#time').value,duration=Number($('#duration').value);
    const start=new Date(`${date}T${time}:00+08:00`),end=new Date(start.getTime()+duration*60000);
    const result=await calendarApi('create-event',{
      staffId:$('#appointment-staff').value||currentStaffId,participantIds:calendarParticipantIds(),
      summary:$('#summary').value.trim(),location:$('#location').value.trim(),
      start:start.toISOString(),end:end.toISOString(),emergency:$('#emergency').checked,
      requestId:pendingCalendarRequestId,confirmed:true,
    });
    $('#event-confirm-status').textContent='';
    $('#event-confirm-dialog').close();
    $('#event-confirm-title').textContent='確認建立行事曆活動';
    $('#confirm-create-event').textContent='確認建立';
    $('#create-event').hidden=true;
    const notify=result.notifications||{status:'not_configured',sent:0,total:calendarParticipantIds().length};
    status.textContent=`${result.created?'行程已建立。':'這項行程已存在，沒有重複建立。'}LINE 通知：${notify.sent}/${notify.total} 位同工已送出。${notify.status==='not_configured'?'尚未設定 LINE Messaging API 權杖，可稍後重試。':notify.status==='partial'?'部分同工通知失敗，可稍後重試。':notify.status==='failed'?'通知未送出，可稍後重試。':''}`;
    $('#retry-event-notifications').hidden=notify.status==='sent';
    pendingCalendarRequestId=notify.status==='sent'?null:pendingCalendarRequestId;
  }catch(error){
    $('#event-confirm-status').textContent=error.message||'目前無法建立活動，請稍後重試。';
  }finally{
    button.disabled=false;
    button.textContent=$('#event-confirm-title').textContent==='重新通知參與同工'?'重新通知':'確認建立';
  }
});


function localToday(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function addLocalDays(date,days){
  const [year,month,day]=date.split('-').map(Number),value=new Date(Date.UTC(year,month-1,day+days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,'0')}-${String(value.getUTCDate()).padStart(2,'0')}`;
}
const today=localToday();
$('#slot-date-from').value=today;
$('#slot-date-through').value=addLocalDays(today,7);
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
      pastor_required:'目前只有牧師或管理者可以執行這項管理操作。',invalid_assignee:'請選擇此堂會已啟用的同工。',
      invalid_task:'請檢查工作內容、期限及負責同工。',task_not_found:'找不到這項工作，請重新整理。',
      invalid_transition:'這項工作目前無法進行所選操作。',completion_report_required:'請填寫執行回報後再完成工作。',
      invalid_report:'請填寫不超過 3,000 字的進度回報。',report_forbidden:'目前無法為這項工作提交進度回報。',
      invalid_attachment:'附件格式或大小不符合規定。',attachment_limit:'每項工作最多附加 5 個檔案。',
      attachment_forbidden:'附件只能在草稿階段由建立者或管理者加入。'}[result.error];
    throw new Error(message||'同工工作服務暫時無法使用。');
  }
  return result;
}
const taskStatusText={draft:'草稿',pending:'待負責同工核准承接',approved:'執行中',completed:'已完成',cancelled:'已取消'};
const taskTypeText={general:'一般',sermon:'講道',event:'活動',care:'關懷',document:'公文'};
function taskButton(label,id,action,secondary=false){
  const button=document.createElement('button');button.type='button';button.className='button'+(secondary?' secondary':'');
  button.textContent=label;button.dataset.taskId=id;button.dataset.taskAction=action;return button;
}
function renderTasks(tasks){
  const list=$('#task-list');list.replaceChildren();
  if(!tasks.length){const p=document.createElement('p');p.className='muted';p.textContent='目前沒有符合權限的工作。';list.append(p);return;}
  for(const task of tasks){
    const article=document.createElement('article');article.className='task-item';article.dataset.taskId=task.id;
    const top=document.createElement('div');top.className='task-item-top';
    const title=document.createElement('h3');title.textContent=task.title;top.append(title);
    const badge=document.createElement('span');badge.className='task-badge task-'+task.status;badge.textContent=taskStatusText[task.status]||task.status;top.append(badge);
    article.append(top);
    const meta=document.createElement('p');meta.className='task-meta';
    meta.textContent=`${taskTypeText[task.taskType]||'一般'}｜負責：${task.assigneeName||'未指派'}${task.dueAt?'｜期限：'+new Date(task.dueAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):''}`;
    article.append(meta);
    if(task.description){const description=document.createElement('p');description.className='task-description';description.textContent=task.description;article.append(description);}
    if(task.workReports?.length){
      const feed=document.createElement('div');feed.className='task-report-feed';
      for(const entry of task.workReports){
        const item=document.createElement('article');item.className='task-report';
        const label=document.createElement('strong');label.textContent=`${entry.authorName}｜${new Date(entry.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`;
        const text=document.createElement('p');text.textContent=entry.text;item.append(label,text);feed.append(item);
      }
      article.append(feed);
    }
    if(task.completionReport){const report=document.createElement('div');report.className='completion-report';const label=document.createElement('strong');label.textContent='完成回報';const text=document.createElement('p');text.textContent=task.completionReport;report.append(label,text);article.append(report);}
    const actions=document.createElement('div');actions.className='task-actions';
    actions.append(taskButton('檢視／下載附件',task.id,'list-attachments',true));
    if(task.canSubmit)actions.append(taskButton('派出並通知負責同工',task.id,'submit'));
    if(task.canApprove)actions.append(taskButton('核准承接並開始執行',task.id,'approve'));
    if(task.canNotify)actions.append(taskButton('重新通知負責同工',task.id,'retry-notification',true));
    if(task.canAttach){
      const input=document.createElement('input');input.type='file';input.multiple=true;
      input.accept='.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp';
      input.className='task-file-input';
      input.setAttribute('aria-label',task.status==='draft'?'選擇派工參考附件':'選擇執行回報附件');
      actions.append(input,taskButton(task.status==='draft'?'上傳參考附件':'上傳回報檔案',task.id,'upload-attachments',true));
    }
    if(task.canReportProgress){
      const progress=document.createElement('textarea');progress.rows=2;progress.maxLength=3000;progress.className='task-progress-input';
      progress.placeholder='回報目前進度、完成項目或需要協助的事項';
      progress.setAttribute('aria-label','進度回報內容');
      actions.append(progress,taskButton('提交進度回報',task.id,'report-progress',true));
    }
    if(task.canComplete){
      const report=document.createElement('textarea');report.rows=3;report.maxLength=3000;report.required=true;
      report.className='task-report-input';report.placeholder='請簡述完成內容、交付結果或需要後續處理的事項';
      report.setAttribute('aria-label','執行回報');
      actions.append(report,taskButton('提交回報並完成',task.id,'complete'));
    }
    article.append(actions);
    const attachmentList=document.createElement('div');attachmentList.className='task-attachments';attachmentList.setAttribute('aria-live','polite');article.append(attachmentList);
    list.append(article);
  }
}
async function uploadTaskAttachment(taskId,file){
  const token=await staffLineIdToken(),form=new FormData();
  form.append('entityKey',church==='M+'?'mplus':'shine');form.append('taskId',taskId);form.append('file',file);
  const response=await fetch(PASTORAL_TASKS_ENDPOINT,{
    method:'POST',headers:{Authorization:`Bearer ${token}`},
    credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000),body:form,
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    const message={invalid_attachment:'附件格式不支援或檔案超過 5 MB。',attachment_limit:'每項工作最多附加 5 個檔案。',
      attachment_forbidden:'附件只能在草稿階段由建立者或管理者加入。',login_required:'LINE 登入已失效，請重新登入。'}[result.error];
    throw new Error(message||'附件上傳失敗。');
  }
  return result;
}
async function showTaskAttachments(taskId,container){
  container.textContent='正在取得安全下載連結…';
  const result=await tasksApi('list-attachments',{taskId});
  container.replaceChildren();
  if(!result.attachments.length){container.textContent='目前沒有附件。';return;}
  for(const file of result.attachments){
    const link=document.createElement('a');link.href=file.url;link.target='_blank';link.rel='noopener noreferrer';
    link.download=file.fileName;link.textContent=`${file.fileName}｜${file.uploadedBy}｜${(file.sizeBytes/1024/1024).toFixed(2)} MB（下載連結 5 分鐘有效）`;
    container.append(link);
  }
}
async function loadTasks(){
  if(previewMode)return;
  const status=$('#task-status');status.textContent='正在載入同工工作…';
  $('#refresh-tasks').disabled=true;
  try{
    const result=await tasksApi('list');
    const people=await tasksApi('assignees'),select=$('#task-assignee'),previous=select.value;
    select.replaceChildren(...people.staff.map(person=>{const option=document.createElement('option');option.value=person.id;option.textContent=person.name;return option;}));
    select.value=people.staff.some(person=>person.id===previous)?previous:(people.staff.some(person=>person.id===currentStaffId)?currentStaffId:(people.staff[0]?.id||''));
    renderTasks(result.tasks||[]);
    status.textContent=`已載入 ${(result.tasks||[]).length} 項工作。`;
  }catch(error){status.textContent=error.message||'無法載入同工工作。';}
  finally{$('#refresh-tasks').disabled=false;}
}
$('#tab-tasks').addEventListener('click',()=>loadTasks());
$('#refresh-tasks').addEventListener('click',()=>loadTasks());
$('#task-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#save-task'),status=$('#task-form-status');button.disabled=true;status.textContent='正在儲存草稿…';
  try{
    const dueValue=$('#task-due').value,files=[...$('#task-files').files];
    if(files.length>5)throw new Error('每項工作最多可附加 5 個檔案。');
    for(const file of files)if(file.size>5*1024*1024)throw new Error(`「${file.name}」超過 5 MB。`);
    const created=await tasksApi('create',{title:$('#task-title').value.trim(),description:$('#task-description').value.trim(),
      taskType:$('#task-type').value,assignedTo:$('#task-assignee').value,
      dueAt:dueValue?new Date(dueValue).toISOString():null,idempotencyKey:crypto.randomUUID()});
    $('#task-form').reset();
    let uploaded=0;
    for(const file of files){await uploadTaskAttachment(created.id,file);uploaded++;}
    status.textContent=files.length?`草稿已儲存，${uploaded} 個附件已安全上傳；可送交同工核准。`:'草稿已儲存。可在工作清單中送交同工核准。';
    await loadTasks();
  }catch(error){status.textContent=error.message||'無法儲存工作或上傳附件。';await loadTasks();}
  finally{button.disabled=false;}
});
$('#task-list').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-task-action]');if(!button)return;
  const article=button.closest('.task-item'),taskId=button.dataset.taskId,action=button.dataset.taskAction;
  button.disabled=true;
  try{
    if(action==='list-attachments'){await showTaskAttachments(taskId,article.querySelector('.task-attachments'));button.disabled=false;return;}
    if(action==='retry-notification'){
      const result=await tasksApi(action,{taskId});await loadTasks();
      $('#task-status').textContent=result.notification?.status==='sent'?'已通知負責同工。':result.notification?.status==='not_configured'?'尚未設定 LINE Messaging API 權杖，請稍後再試。':'通知沒有送出，請檢查同工 LINE 帳號設定。';return;
    }
    if(action==='report-progress'){
      const report=article.querySelector('.task-progress-input')?.value||'';
      await tasksApi('report-progress',{taskId,report});await loadTasks();$('#task-status').textContent='進度回報已送出。';return;
    }
    if(action==='upload-attachments'){
      const input=article.querySelector('.task-file-input'),files=[...(input?.files||[])];
      if(!files.length)throw new Error('請先選擇附件。');
      if(files.length>5)throw new Error('每項工作最多可附加 5 個檔案。');
      $('#task-status').textContent='正在安全上傳附件…';
      for(const file of files)await uploadTaskAttachment(taskId,file);
      await loadTasks();$('#task-status').textContent='附件已上傳。';return;
    }
    $('#task-status').textContent='正在更新工作狀態…';
    const payload={taskId};
    if(action==='complete')payload.report=article.querySelector('.task-report-input')?.value||'';
    const result=await tasksApi(action,payload);await loadTasks();
    if(result.notification){
      $('#task-status').textContent=result.notification.status==='sent'
        ?(action==='submit'?'已派出工作並通知負責同工。':'負責同工已承接，建立者已收到通知。')
        :result.notification.status==='not_configured'?'工作狀態已更新；尚未設定 LINE Messaging API 權杖，請設定後重新通知。':'工作狀態已更新；LINE 通知未送出，請稍後重試。';
    }
  }catch(error){$('#task-status').textContent=error.message||'無法更新工作或附件。';button.disabled=false;}
});

load();
