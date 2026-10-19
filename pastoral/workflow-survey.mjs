import { authenticateStaff, staffLineIdToken } from './auth.mjs?v=20261009-stage4';
import { PASTORAL_WORKFLOW_SURVEY_ENDPOINT } from './config.mjs?v=20261019-workflow1';

const $ = selector => document.querySelector(selector);
const entityNames = { mplus: 'M+ 大雅教會', shine: '火樂教會', tcsc: '台灣基督教社會關懷協會' };
const churchKeys = { 'M+': 'mplus', SHiNE: 'shine', 台灣基督教社會關懷協會: 'tcsc' };
const cadenceNames = { daily: '每天', weekly: '每週', biweekly: '每兩週', monthly: '每月', bimonthly: '每兩個月', quarterly: '每季', yearly: '每年', as_needed: '有需要時' };
const timingNames = { weekday: '平日', monday: '週一', tuesday: '週二', wednesday: '週三', thursday: '週四', friday: '週五', saturday: '週六', sunday: '週日', weekend: '週末', varies: '時間不固定' };
const usageNames = { daily: '幾乎每天', weekly: '每週', monthly: '每月幾次', rarely: '很少使用', never: '尚未使用' };
const errors = {
  login_required: '登入已失效，請重新登入教會 OS。', staff_forbidden: '這個帳號尚未獲授權填寫同工問卷。',
  entity_forbidden: '你沒有這個單位的填寫權限。', area_required: '請選擇至少一個工作範圍。',
  task_required: '請填寫至少一件例行工作。', invalid_task: '請確認每件例行工作都有名稱和頻率。',
  too_many_tasks: '例行工作最多八件。', friction_required: '請選擇至少一項目前的阻礙。',
  improvement_required: '請選擇至少一項希望改善的功能。', answers_too_large: '填寫內容過長，請精簡後再送出。',
  invalid_frictions: '「目前沒有明顯阻礙」不能與其他阻礙一起選。',
  invalid_improvements: '「目前不需要新功能」不能與其他改善一起選。',
  forbidden: '你沒有查看其他同工回覆的權限。', unavailable: '暫時無法連接問卷服務，請稍後重試。',
};
let activeEntity = 'mplus';
let dirty = false;
let saving = false;

const selected = selector => [...document.querySelectorAll(`${selector} input:checked`)].map(input => input.value);
const setSelections = (selector, values) => {
  document.querySelectorAll(`${selector} input`).forEach(input => { input.checked = Array.isArray(values) && values.includes(input.value); });
};
function message(text, error = false) {
  const target = $('#form-status');
  target.textContent = text;
  target.dataset.error = String(error);
}
async function api(action, payload = {}) {
  const token = await staffLineIdToken();
  let response;
  try {
    response = await fetch(PASTORAL_WORKFLOW_SURVEY_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ action, entityKey: activeEntity, ...payload }),
    });
  } catch { throw new Error(errors.unavailable); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errors[result.error] || '目前無法完成操作，請稍後再試。');
  return result;
}
function updateRoutineNumbers() {
  const items = [...document.querySelectorAll('.routine-item')];
  items.forEach((item, index) => { item.querySelector('[data-routine-number]').textContent = String(index + 1); });
  $('#add-routine').disabled = items.length >= 8;
  for (const item of items) item.querySelector('.remove-routine').hidden = items.length <= 1;
}
function addRoutine(value = {}) {
  if (document.querySelectorAll('.routine-item').length >= 8) return;
  const fragment = $('#routine-template').content.cloneNode(true);
  const item = fragment.querySelector('.routine-item');
  item.querySelector('[data-routine-title]').value = value.title || '';
  item.querySelector('[data-routine-cadence]').value = value.cadence || 'weekly';
  item.querySelector('[data-routine-timing]').value = value.timing || 'varies';
  item.querySelector('[data-routine-done]').value = value.doneMeans || '';
  item.querySelector('[data-routine-reminder]').checked = value.needsReminder === true;
  item.querySelector('.remove-routine').addEventListener('click', () => {
    item.remove(); updateRoutineNumbers(); dirty = true;
  });
  $('#routine-list').append(item);
  updateRoutineNumbers();
}
function fillForm(answers = {}) {
  setSelections('#areas-options', answers.areas);
  $('#area-other').value = answers.areaOther || '';
  $('#routine-list').replaceChildren();
  const tasks = Array.isArray(answers.routineTasks) && answers.routineTasks.length ? answers.routineTasks : [{}];
  tasks.slice(0, 8).forEach(addRoutine);
  $('#irregular-work').value = answers.irregularWork || '';
  $('#missed-steps').value = answers.missedSteps || '';
  $('#handoff').value = answers.handoff || '';
  $('#os-usage').value = answers.osUsage || 'rarely';
  setSelections('#current-tools-options', answers.currentTools);
  setSelections('#frictions-options', answers.frictions);
  $('#friction-other').value = answers.frictionOther || '';
  setSelections('#improvements-options', answers.improvements);
  $('#improvement-other').value = answers.improvementOther || '';
  $('#reminder-channel').value = answers.reminderChannel || 'app';
  $('#reminder-lead').value = answers.reminderLead || 'day_before';
  $('#first-change').value = answers.firstChange || '';
  dirty = false;
  message('');
}
function collectAnswers() {
  const routineTasks = [...document.querySelectorAll('.routine-item')].map(item => ({
    title: item.querySelector('[data-routine-title]').value.trim(),
    cadence: item.querySelector('[data-routine-cadence]').value,
    timing: item.querySelector('[data-routine-timing]').value,
    doneMeans: item.querySelector('[data-routine-done]').value.trim(),
    needsReminder: item.querySelector('[data-routine-reminder]').checked,
  })).filter(task => task.title || task.doneMeans);
  return {
    areas: selected('#areas-options'), areaOther: $('#area-other').value.trim(), routineTasks,
    irregularWork: $('#irregular-work').value.trim(), missedSteps: $('#missed-steps').value.trim(),
    handoff: $('#handoff').value.trim(), osUsage: $('#os-usage').value, currentTools: selected('#current-tools-options'),
    frictions: selected('#frictions-options'), frictionOther: $('#friction-other').value.trim(),
    improvements: selected('#improvements-options'), improvementOther: $('#improvement-other').value.trim(),
    reminderChannel: $('#reminder-channel').value, reminderLead: $('#reminder-lead').value,
    firstChange: $('#first-change').value.trim(),
  };
}
function checkAnswers(answers) {
  if (!answers.areas.length && !answers.areaOther) return ['請選擇至少一個工作範圍。', '#areas-title'];
  if (!answers.routineTasks.length) return ['請填寫至少一件固定工作。', '#routine-title'];
  if (answers.routineTasks.some(task => !task.title)) return ['請填寫每件固定工作的名稱。', '[data-routine-title]'];
  if (!answers.frictions.length && !answers.frictionOther) return ['請選擇至少一項目前的阻礙。', '#friction-title'];
  if (!answers.improvements.length && !answers.improvementOther) return ['請選擇至少一項希望改善的功能。', '#improve-title'];
  if (answers.frictions.includes('目前沒有明顯阻礙') && answers.frictionOther) return ['「目前沒有明顯阻礙」不能與其他阻礙一起填。', '#friction-title'];
  if (answers.improvements.includes('目前不需要新功能') && answers.improvementOther) return ['「目前不需要新功能」不能與其他想法一起填。', '#improve-title'];
  return null;
}
function formatTime(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' }).format(new Date(value)); }
  catch { return ''; }
}
async function loadMine() {
  $('#saved-note').textContent = '正在讀取你先前的回覆…';
  $('#survey-form').hidden = true; $('#reload-survey').hidden = true;
  $('#response-summary').replaceChildren(); $('#response-list').replaceChildren(); $('#manager-status').textContent = '';
  try {
    const result = await api('load');
    fillForm(result.response?.answers || {});
    $('#saved-note').textContent = result.response
      ? `已載入你上次於 ${formatTime(result.response.updated_at)} 儲存的回覆，可以直接修改。`
      : '目前尚未填寫。你可以先寫最重要的工作，之後再補充。';
    $('#survey-form').hidden = false;
    $('#manager-section').hidden = !result.canManage;
  } catch (error) {
    $('#saved-note').textContent = `${error.message} 請重新載入，確認上次的回覆後再填寫。`;
    $('#manager-section').hidden = true;
    $('#reload-survey').hidden = false;
  }
}
function appendText(parent, tag, content, className = '') {
  const element = document.createElement(tag); element.textContent = content;
  if (className) element.className = className;
  parent.append(element); return element;
}
function countChoices(items, key) {
  const counts = new Map();
  for (const item of items) for (const value of Array.isArray(item.answers?.[key]) ? item.answers[key] : [])
    counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
}
function renderSummary(items) {
  const container = $('#response-summary'); container.replaceChildren();
  const sections = [
    ['已填回覆', `${items.length} 位同工`],
    ['教會 OS 使用頻率', Object.entries(usageNames).map(([key, label]) => `${label} ${items.filter(item => item.answers?.osUsage === key).length}`).join('、')],
    ['最常見阻礙', countChoices(items, 'frictions').map(([name, count]) => `${name} ${count}`).join('、') || '尚無選項'],
    ['最期待改善', countChoices(items, 'improvements').map(([name, count]) => `${name} ${count}`).join('、') || '尚無選項'],
  ];
  for (const [heading, content] of sections) {
    const card = document.createElement('article'); card.className = 'summary-card';
    appendText(card, 'strong', heading); appendText(card, 'p', content); container.append(card);
  }
}
function renderResponses(items) {
  const container = $('#response-list'); container.replaceChildren();
  for (const item of items) {
    const answers = item.answers || {};
    const card = document.createElement('article'); card.className = 'response-card';
    appendText(card, 'h3', item.name || '教會同工');
    appendText(card, 'p', `更新：${formatTime(item.updatedAt)}`, 'meta');
    appendText(card, 'p', `範圍：${[...(answers.areas || []), answers.areaOther].filter(Boolean).join('、') || '未填'}`);
    const tasks = Array.isArray(answers.routineTasks) ? answers.routineTasks : [];
    if (tasks.length) {
      appendText(card, 'p', '固定工作：');
      const list = document.createElement('ul');
      for (const task of tasks) appendText(list, 'li', `${task.title}（${cadenceNames[task.cadence] || ''}／${timingNames[task.timing] || ''}）${task.needsReminder ? '；需要提醒' : ''}${task.doneMeans ? `；完成：${task.doneMeans}` : ''}`);
      card.append(list);
    }
    appendText(card, 'p', `最容易漏掉：${answers.missedSteps || '未填'}`);
    appendText(card, 'p', `目前阻礙：${[...(answers.frictions || []), answers.frictionOther].filter(Boolean).join('、') || '未填'}`);
    appendText(card, 'p', `希望改善：${[...(answers.improvements || []), answers.improvementOther].filter(Boolean).join('、') || '未填'}`);
    const details = document.createElement('details'); appendText(details, 'summary', '查看補充與提醒偏好');
    appendText(details, 'p', `目前記錄方式：${(answers.currentTools || []).join('、') || '未填'}`);
    appendText(details, 'p', `教會 OS 使用頻率：${usageNames[answers.osUsage] || '未填'}`);
    appendText(details, 'p', `其他工作：${answers.irregularWork || '未填'}`);
    appendText(details, 'p', `交接方式：${answers.handoff || '未填'}`);
    const channel = { app: '教會 OS App', line: 'LINE 私訊', calendar: '手機行事曆', none: '不需要' }[answers.reminderChannel] || '未填';
    const lead = { day_before: '前一天', same_day: '當天', both: '前一天及當天', none: '不需要' }[answers.reminderLead] || '未填';
    appendText(details, 'p', `提醒偏好：${channel}／${lead}`);
    appendText(details, 'p', `最先想改：${answers.firstChange || '未填'}`);
    card.append(details); container.append(card);
  }
}
async function loadResponses() {
  const button = $('#load-responses'); button.disabled = true;
  $('#manager-status').textContent = '正在彙整同工回覆…';
  try {
    const result = await api('list');
    renderSummary(result.items || []); renderResponses(result.items || []);
    $('#manager-status').textContent = result.items?.length ? '只顯示目前單位的回覆，且不含未送出的草稿。' : '目前尚無同工送出回覆。';
  } catch (error) { $('#manager-status').textContent = error.message; }
  finally { button.disabled = false; }
}
async function start() {
  try {
    const staff = await authenticateStaff({ interactive: true, returnUrl: location.href });
    const keys = [...new Set((staff.churches || []).map(church => churchKeys[church]).filter(Boolean))];
    if (!keys.length) throw new Error('這個帳號尚未設定可填寫的使用單位。');
    $('#staff-label').textContent = `${staff.name || '教會同工'}，請依你的實際工作填寫`;
    const entity = $('#entity');
    entity.replaceChildren();
    for (const key of keys) entity.add(new Option(entityNames[key], key));
    const preferred = new URLSearchParams(location.search).get('entity');
    activeEntity = preferred && keys.includes(preferred) ? preferred : keys[0];
    entity.value = activeEntity;
    $('#entity-field').hidden = keys.length === 1;
    $('#auth-screen').hidden = true; $('#survey-root').hidden = false;
    await loadMine();
  } catch (error) {
    $('#auth-status').textContent = error.message || '目前無法確認同工權限，請稍後再試。';
    $('#login-actions').hidden = false;
  }
}

$('#add-routine').addEventListener('click', () => { addRoutine(); dirty = true; });
$('#survey-form').addEventListener('input', () => { dirty = true; });
$('#survey-form').addEventListener('change', () => { dirty = true; });
for (const id of ['frictions-options', 'improvements-options']) {
  $(`#${id}`).addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.checked) return;
    const group = $(`#${id}`);
    if (input.dataset.exclusive !== undefined) {
      group.querySelectorAll('input').forEach(other => { if (other !== input) other.checked = false; });
    } else {
      group.querySelector('input[data-exclusive]').checked = false;
    }
  });
}
$('#entity').addEventListener('change', async event => {
  if (dirty && !confirm('目前有尚未送出的修改。切換單位會清除這些修改，確定切換嗎？')) {
    event.target.value = activeEntity; return;
  }
  activeEntity = event.target.value; await loadMine();
});
$('#survey-form').addEventListener('submit', async event => {
  event.preventDefault(); if (saving) return;
  const answers = collectAnswers(); const invalid = checkAnswers(answers);
  if (invalid) { message(invalid[0], true); $(invalid[1])?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  saving = true; const button = $('#submit-survey'); button.disabled = true; button.textContent = '正在儲存…';
  message('正在確認資料已安全儲存…');
  try {
    const result = await api('save', { answers });
    dirty = false;
    message(`已儲存你的回覆（${formatTime(result.updatedAt)}）。謝謝你，之後仍可回來修改。`);
    $('#saved-note').textContent = '這份回覆已儲存，可以直接在本頁修改。';
  } catch (error) { message(`${error.message} 你填寫的內容仍留在本頁，請稍後重試。`, true); }
  finally { saving = false; button.disabled = false; button.textContent = '更新工作流程回覆'; }
});
$('#load-responses').addEventListener('click', loadResponses);
$('#reload-survey').addEventListener('click', loadMine);
window.addEventListener('beforeunload', event => { if (!dirty || saving) return; event.preventDefault(); event.returnValue = ''; });
start();
