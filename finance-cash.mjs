import { db } from './admin-db.mjs?v=20261012-readable2';
import { normalizeOfferingCode } from './finance/bulletin.mjs';

const $ = selector => document.querySelector(selector);
const categories = ['十一奉獻','感恩奉獻','宣教奉獻','建堂奉獻','慈惠奉獻','指定奉獻'];
const labels = { entry: '同工登錄', cash_verify: '師母對現金', approve: '牧師複審' };
const errors = {
  forbidden: '沒有此操作權限。', login_required: '登入已過期，請重新登入。',
  version_conflict: '資料已由其他人修改，請重新載入。', batch_locked: '這筆批次已送審，不能直接修改。',
  invalid_counters: '請選兩位不同且有登錄權限的點收同工。', member_code_mismatch: '會友與奉獻編號不一致。',
  unlinked_offering_code: '奉獻編號尚未連結會友，請先查證。', bag_total_mismatch: '袋面總額與分類加總不符。',
  cash_total_mismatch: '現金實點與逐袋總額不符。', verified_cash_mismatch: '師母實點金額與同工點收不符。',
  invalid_transition: '目前狀態不能執行此步驟。', reason_required: '退回時請填寫原因。',
  target_not_mplus_admin: '該帳號沒有 M+ 管理權限。', service_unavailable: '服務暫時無法使用，請稍後再試。'
};
const state = { roles: new Set(), owner: false, workers: [], batch: null, groups: [], busy: false };
let nextGroupId = 1;
const number = value => Number.isSafeInteger(Number(value)) ? Number(value) : NaN;

async function api(action, values = {}) {
  const response = await db.functions.invoke('finance-cash', { body: { action, ...values } });
  if (response.error) {
    let code = 'service_unavailable';
    try { code = (await response.error.context?.json())?.code || code; } catch {}
    throw new Error(errors[code] || `操作未完成（${code}）。`);
  }
  if (!response.data?.ok) throw new Error(errors[response.data?.code] || '操作未完成。');
  return response.data;
}

function status(message, tone = '') {
  const element = $('#finance-status'); element.textContent = message; element.dataset.tone = tone;
}

async function work(task) {
  if (state.busy) return;
  state.busy = true;
  try { await task(); } catch (error) { status(error.message || '操作未完成。', 'error'); }
  finally { state.busy = false; }
}

function tab(name) {
  for (const key of ['batches','editor','roles']) {
    $(`#${key}-panel`).hidden = key !== name;
    const button = $(`[data-tab="${key}"]`);
    button.setAttribute('aria-current', key === name ? 'page' : 'false');
  }
}

function newGroup(anonymous = false) {
  return { key: nextGroupId++, anonymous, memberId: null, offeringCode: '', name: anonymous ? '匿名' : '',
    phone: '', address: '', publicChoice: 'public', hideFromBulletin: false, receiptPreference: 'annual',
    bags: [{ declaredTotal: '', amounts: {}, designation: '' }] };
}

function mostRecentSunday() {
  const pieces = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const day = new Date(`${pieces.year}-${pieces.month}-${pieces.day}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day.toISOString().slice(0, 10);
}

function clearEditor() {
  state.batch = null; state.groups = [newGroup()];
  $('#offering-date').value = mostRecentSunday();
  $('#counted-cash').value = '';
  $('#editor-title').textContent = '新建主日現金批次';
  $('#editor-state').textContent = '儲存後可送師母核對。';
  $('#review-panel').hidden = true;
  $('#cash-form').querySelectorAll('input,select,button').forEach(control => { control.disabled = false; });
  $('#add-donor').disabled = false; $('#add-anonymous').disabled = false;
  $('#submit-batch').hidden = false;
  drawGroups(); totals(); tab('editor');
}

function textNode(tag, text, className = '') {
  const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el;
}
function labelFor(text, input) { const label = document.createElement('label'); label.append(textNode('span', text), input); return label; }
function field(type, value, handler, extra = {}) {
  const input = document.createElement('input'); input.type = type; input.value = value ?? '';
  if (type === 'number') { input.min = extra.min ?? '0'; input.step = '1'; input.inputMode = 'numeric'; }
  if (extra.maxLength) input.maxLength = extra.maxLength;
  input.addEventListener('input', () => handler(input.value));
  return input;
}
function select(options, value, handler) {
  const node = document.createElement('select');
  for (const [optionValue, text] of options) { const option = document.createElement('option'); option.value = optionValue; option.textContent = text; node.append(option); }
  node.value = value; node.addEventListener('change', () => handler(node.value)); return node;
}

async function searchMember(group, results) {
  const term = group.name.trim() || group.offeringCode.trim();
  if (!term) { status('先輸入姓名或奉獻編號。', 'error'); return; }
  const response = await api('members', { search: term });
  results.replaceChildren();
  if (!response.members.length) {
    results.append(textNode('p', '沒有找到會友；可先以姓名暫存，之後補建檔。', 'finance-note'));
    return;
  }
  for (const member of response.members) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${member.name}　${member.offeringCode || '奉獻編號待補'}${member.phone ? `　${member.phone}` : ''}`;
    button.addEventListener('click', () => {
      group.memberId = member.id; group.offeringCode = member.offeringCode || ''; group.name = member.name; group.phone = member.phone || '';
      results.replaceChildren(); drawGroups(); status(`已連結會友 ${member.name}。`);
    });
    results.append(button);
  }
}

function drawBag(group, bag, index) {
  const details = document.createElement('details'); details.className = 'finance-bag'; details.open = true;
  const summary = document.createElement('summary'); summary.textContent = `第 ${index + 1} 袋 · ${bag.declaredTotal || 0} 元`; details.append(summary);
  const grid = document.createElement('div'); grid.className = 'finance-category-grid';
  const choices = group.anonymous ? ['一般／不具名奉獻'] : categories;
  for (const category of choices) {
    const input = field('number', bag.amounts[category] ?? '', value => { bag.amounts[category] = value; totals(); }, { min: '0' });
    grid.append(labelFor(category, input));
  }
  details.append(grid);
  if (!group.anonymous) details.append(labelFor('指定奉獻用途', field('text', bag.designation, value => { bag.designation = value; }, { maxLength: 120 })));
  const footer = document.createElement('div'); footer.className = 'finance-bag-footer';
  footer.append(labelFor('袋面總額', field('number', bag.declaredTotal, value => { bag.declaredTotal = value; summary.textContent = `第 ${index + 1} 袋 · ${value || 0} 元`; totals(); }, { min: '1' })));
  const remove = textNode('button', '移除這袋'); remove.type = 'button'; remove.className = 'secondary';
  remove.addEventListener('click', () => { group.bags.splice(index, 1); drawGroups(); totals(); });
  footer.append(remove); details.append(footer); return details;
}

function drawGroup(group, index) {
  const card = document.createElement('section'); card.className = 'finance-group';
  const head = document.createElement('div'); head.className = 'finance-group-head';
  head.append(textNode('h4', group.anonymous ? '匿名現金' : `奉獻者 ${index + 1}`));
  const remove = textNode('button', '移除奉獻者'); remove.type = 'button'; remove.className = 'secondary';
  remove.addEventListener('click', () => { state.groups.splice(index, 1); drawGroups(); totals(); });
  head.append(remove); card.append(head);
  const fields = document.createElement('div'); fields.className = 'finance-group-fields';
  if (!group.anonymous) {
    const name = field('text', group.name, value => {
      if (group.memberId != null && value !== group.name) { group.memberId = null; group.offeringCode = ''; }
      group.name = value;
    }, { maxLength: 80 });
    const nameWrap = document.createElement('div'); nameWrap.className = 'finance-inline'; nameWrap.append(name);
    const search = textNode('button', '搜尋會友'); search.type = 'button'; search.className = 'secondary';
    const results = document.createElement('div'); results.className = 'finance-search-results';
    search.addEventListener('click', () => void work(() => searchMember(group, results)));
    nameWrap.append(search); const nameBlock = document.createElement('div');
    nameBlock.append(textNode('strong','袋上姓名或奉獻編號'),nameWrap,results); fields.append(nameBlock);
    const codeNote = document.createElement('div');
    codeNote.append(textNode('strong', `奉獻編號：${group.offeringCode || (group.memberId ? '待補' : '未建檔')}`));
    if (group.memberId && !group.offeringCode) {
      const input = field('text', '', () => {}, { maxLength: 4 }); input.placeholder = '四位數';
      const assign = textNode('button', '設定編號'); assign.type = 'button';
      assign.addEventListener('click', () => void work(async () => {
        const offeringCode = normalizeOfferingCode(input.value);
        await api('assign_code', { memberId: group.memberId, offeringCode });
        group.offeringCode = offeringCode; drawGroups(); status('奉獻編號已設定。');
      }));
      const row = document.createElement('div'); row.className = 'finance-inline'; row.append(input, assign); codeNote.append(row);
    }
    fields.append(codeNote);
    fields.append(labelFor('袋上電話（選填）', field('tel', group.phone, value => { group.phone = value; }, { maxLength: 60 })));
    fields.append(labelFor('袋上地址（選填）', field('text', group.address, value => { group.address = value; }, { maxLength: 300 })));
  }
  fields.append(labelFor('週報顯示', select([['public','顯示編號／遮蔽姓名'],['anonymous','匿名'],['unlisted','只計入總額']], group.publicChoice, value => { group.publicChoice = value; })));
  fields.append(labelFor('收據偏好', select([['annual','年度收據'],['single','單次收據'],['none','不開收據']], group.receiptPreference, value => { group.receiptPreference = value; })));
  const hideLabel = document.createElement('label'); hideLabel.className = 'finance-check';
  const hide = document.createElement('input'); hide.type = 'checkbox'; hide.checked = group.hideFromBulletin;
  hide.addEventListener('change', () => { group.hideFromBulletin = hide.checked; });
  hideLabel.append(hide, textNode('span','本筆週報不露出')); fields.append(hideLabel);
  card.append(fields);
  const bags = document.createElement('div'); bags.className = 'finance-bags'; group.bags.forEach((bag, i) => bags.append(drawBag(group, bag, i))); card.append(bags);
  if (!group.anonymous) {
    const add = textNode('button', '＋ 同一人再加一袋'); add.type = 'button'; add.className = 'secondary';
    add.addEventListener('click', () => { group.bags.push({ declaredTotal: '', amounts: {}, designation: '' }); drawGroups(); });
    card.append(add);
  }
  return card;
}

function drawGroups() { $('#donor-groups').replaceChildren(...state.groups.map(drawGroup)); }
function totals() {
  const entered = state.groups.flatMap(group => group.bags).reduce((sum, bag) => sum + (number(bag.declaredTotal) || 0), 0);
  const counted = number($('#counted-cash').value) || 0;
  $('#entered-total').textContent = entered.toLocaleString('zh-TW');
  $('#cash-difference').textContent = (counted - entered).toLocaleString('zh-TW');
  $('#cash-difference').style.color = counted === entered ? '#197453' : '#aa3729';
}

function makePayload() {
  if (!state.groups.length) throw new Error('請至少登錄一位奉獻者或一筆匿名現金。');
  const counters = [$('#counter-one').value, $('#counter-two').value];
  if (!counters[0] || !counters[1] || counters[0] === counters[1]) throw new Error(errors.invalid_counters);
  const bags = state.groups.flatMap(group => group.bags.map(bag => {
    const lines = (group.anonymous ? ['一般／不具名奉獻'] : categories).filter(category => number(bag.amounts[category]) > 0).map(category => ({
      category, amount: number(bag.amounts[category]), ...(category === '指定奉獻' ? { designation: bag.designation.trim() } : {})
    }));
    if (!group.name.trim()) throw new Error('每位奉獻者須填袋上姓名。');
    if (group.memberId && !group.offeringCode) throw new Error('已選會友仍缺奉獻編號，請先補編號。');
    if (!lines.length) throw new Error('每袋至少填一項奉獻分類。');
    if (lines.some(line => line.category === '指定奉獻' && !line.designation)) throw new Error('指定奉獻須填用途。');
    const declaredTotal = number(bag.declaredTotal);
    if (declaredTotal !== lines.reduce((sum, line) => sum + line.amount, 0)) throw new Error(errors.bag_total_mismatch);
    return { bagName: group.name.trim(), bagPhone: group.phone.trim(), bagAddress: group.address.trim(), memberId: group.memberId, offeringCode: group.offeringCode || null,
      anonymous: group.anonymous, publicChoice: group.publicChoice, hideFromBulletin: group.hideFromBulletin,
      receiptPreference: group.receiptPreference, declaredTotal, lines };
  }));
  const countedCash = number($('#counted-cash').value);
  if (!Number.isSafeInteger(countedCash) || countedCash <= 0) throw new Error('請輸入現金實點總額。');
  return { offeringDate: $('#offering-date').value, counterUserIds: counters, countedCash, bags };
}

async function save() {
  const data = makePayload();
  const result = await api('save', { batchId: state.batch?.id || null, version: state.batch?.version || null, data });
  state.batch = result.batch; await openBatch(result.batch.id); status('草稿已儲存。');
}

async function transition(step) {
  if (!state.batch) throw new Error('請先儲存草稿。');
  let verifiedCash = null, reason = null;
  if (step === 'verify_cash') {
    const value = prompt('請輸入師母現場實點金額');
    if (value === null) return;
    verifiedCash = number(value);
    if (!Number.isSafeInteger(verifiedCash) || verifiedCash <= 0) throw new Error('實點金額不正確。');
  }
  if (step === 'return') {
    reason = prompt('請填寫退回原因');
    if (reason === null) return;
    if (!reason.trim()) throw new Error(errors.reason_required);
  }
  const result = await api('transition', { batchId: state.batch.id, version: state.batch.version, step, verifiedCash, reason });
  await openBatch(result.batch.id); status('狀態已更新。');
}

async function openBatch(id) {
  const response = await api('get', { batchId: id }); const batch = response.batch;
  state.batch = batch; state.groups = [];
  const linked = new Map();
  for (const bag of response.bags) {
    const key = bag.member_id ? `member:${bag.member_id}:${bag.public_choice}:${bag.hide_from_bulletin}:${bag.receipt_preference}` : `bag:${bag.id}`;
    let group = linked.get(key);
    if (!group) {
      group = newGroup(bag.anonymous); group.bags = []; group.memberId = bag.member_id;
      group.offeringCode = bag.offering_code || ''; group.name = bag.bag_name;
      group.phone = bag.bag_phone || ''; group.address = bag.bag_address || '';
      group.publicChoice = bag.public_choice; group.hideFromBulletin = bag.hide_from_bulletin;
      group.receiptPreference = bag.receipt_preference;
      linked.set(key, group); state.groups.push(group);
    }
    const amounts = {};
    for (const line of bag.lines) amounts[line.category] = (amounts[line.category] || 0) + Number(line.amount);
    group.bags.push({ declaredTotal: String(bag.declared_total), amounts,
      designation: bag.lines.find(line => line.category === '指定奉獻')?.designation || '' });
  }
  $('#offering-date').value = batch.offering_date;
  $('#counted-cash').value = batch.counted_cash;
  $('#counter-one').value = batch.counter_1; $('#counter-two').value = batch.counter_2;
  $('#editor-title').textContent = `${batch.offering_date} 主日現金`;
  $('#editor-state').textContent = `狀態：${statusLabel(batch.status)} · 版本 ${batch.version}`;
  drawGroups(); totals(); drawReview(response.events);
  const writable = state.roles.has('entry') && ['draft','returned'].includes(batch.status);
  $('#cash-form').querySelectorAll('input,select,button').forEach(control => { control.disabled = !writable; });
  $('#add-donor').disabled = !writable; $('#add-anonymous').disabled = !writable;
  tab('editor');
}

function statusLabel(value) { return ({ draft: '草稿', spouse_review: '待師母核對', pastor_review: '待牧師複審', booked: '已入帳', returned: '已退回修正' })[value] || value; }
function drawReview(events) {
  const panel = $('#review-panel'), actionBox = $('#review-actions');
  panel.hidden = false; actionBox.replaceChildren();
  const current = state.batch?.status;
  $('#review-message').textContent = `目前：${statusLabel(current)}。每次退回、修正及核准均保留版本。`;
  const actions = [];
  if (current === 'spouse_review' && state.roles.has('cash_verify')) actions.push(['verify_cash','現金核對正確，送牧師'],['return','退回同工修正']);
  if (current === 'pastor_review' && state.roles.has('approve')) actions.push(['approve','複審正確，正式入帳'],['return','退回同工修正']);
  for (const [step, label] of actions) {
    const button = textNode('button', label); button.type = 'button';
    if (step === 'return') button.className = 'secondary';
    button.addEventListener('click', () => void work(() => transition(step))); actionBox.append(button);
  }
  const history = $('#review-history'); history.replaceChildren();
  for (const event of events || []) history.append(textNode('li', `版本 ${event.version} · ${event.action}${event.reason ? ` · ${event.reason}` : ''}`));
  $('#submit-batch').hidden = !(state.roles.has('entry') && ['draft','returned'].includes(current));
}

async function workers() {
  const response = await api('workers'); state.workers = response.workers;
  for (const selector of ['#counter-one','#counter-two']) {
    const element = $(selector), previous = element.value;
    element.replaceChildren(new Option('請選擇點收同工',''),...state.workers.map(worker => new Option(worker.name, worker.userId)));
    element.value = previous;
  }
}

async function batches() {
  const response = await api('list'); const list = $('#batch-list'); list.replaceChildren();
  if (!response.batches.length) list.append(textNode('p','目前沒有主日現金批次。','finance-note'));
  for (const batch of response.batches) {
    const card = document.createElement('div'); card.className = 'finance-list-card finance-role-row';
    const detail = document.createElement('div');
    detail.append(textNode('strong',`${batch.offering_date}　${statusLabel(batch.status)}`),textNode('small',`逐袋 ${Number(batch.entered_total).toLocaleString('zh-TW')} 元 · 版本 ${batch.version}`));
    const open = textNode('button','查看批次'); open.type = 'button'; open.addEventListener('click', () => void work(() => openBatch(batch.id)));
    card.append(detail,open); list.append(card);
  }
}

async function roles() {
  const response = await api('accounts'); const list = $('#role-list'); list.replaceChildren();
  for (const account of response.accounts) {
    const card = document.createElement('div'); card.className = 'finance-list-card finance-role-row';
    const person = document.createElement('div'); person.append(textNode('strong',account.name),textNode('small',account.title));
    const choices = document.createElement('div'); choices.className = 'finance-role-checks';
    for (const [role,label] of Object.entries(labels)) {
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = account.roles.includes(role);
      input.addEventListener('change', () => void work(async () => {
        try { await api('assign_role',{ userId: account.userId, role, enabled: input.checked }); status('人員權限已更新。'); await roles(); await workers(); }
        catch (error) { input.checked = !input.checked; throw error; }
      }));
      const wrapper = document.createElement('label'); wrapper.append(input,textNode('span',label)); choices.append(wrapper);
    }
    card.append(person,choices); list.append(card);
  }
}

for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => void work(async () => {
  const name = button.dataset.tab; if (name === 'batches') await batches(); if (name === 'roles') await roles(); tab(name);
}));
$('#new-batch').addEventListener('click', clearEditor);
$('#back-to-list').addEventListener('click', () => void work(async () => { await batches(); tab('batches'); }));
$('#add-donor').addEventListener('click', () => { state.groups.push(newGroup()); drawGroups(); });
$('#add-anonymous').addEventListener('click', () => { if (!state.groups.some(group => group.anonymous)) state.groups.push(newGroup(true)); drawGroups(); });
$('#counted-cash').addEventListener('input', totals);
$('#cash-form').addEventListener('submit', event => { event.preventDefault(); void work(save); });
$('#submit-batch').addEventListener('click', () => void work(() => transition('submit')));

await work(async () => {
  const checked = await db.auth.getUser();
  if (checked.error || !checked.data?.user) throw new Error('請先登入教會 OS。');
  const profile = await api('profile'); state.roles = new Set(profile.roles); state.owner = profile.owner;
  if (!state.owner && !state.roles.size) throw new Error('此帳號尚未獲授權使用財務模組。');
  $('#finance-app').hidden = false; $('#roles-tab').hidden = !state.owner;
  $('#new-batch').hidden = !state.roles.has('entry');
  await workers(); await batches();
  status('已載入主日奉獻工作區。');
});
