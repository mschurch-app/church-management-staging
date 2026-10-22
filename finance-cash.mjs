import {createFieldGuidance,FieldValidationError} from './form-guidance.mjs?v=20261022-experience8';
import { db } from './admin-db.mjs?v=20261012-readable2';
import { normalizeOfferingCode } from './finance/bulletin.mjs';

const $ = selector => document.querySelector(selector);
const categories = ['十一奉獻','感恩奉獻','宣教奉獻','建堂奉獻','慈惠奉獻','指定奉獻'];
const labels = { entry: '同工登錄', cash_verify: '師母對現金', approve: '牧師複審' };
const errors = {
  bag_confirmations_required: '請先由一位同工核對並確認每筆奉獻，再儲存。', invalid_bag_confirmation: '逐筆確認資料已變更，請重新讀取。',
  counter_confirmations_required: '兩位點收同工都須親自確認後，才能送複審。', counter_confirmation_forbidden: '只能由指定的點收同工本人確認。', invalid_confirmation: '確認狀態不正確。',
  forbidden: '沒有此操作權限。', login_required: '登入已過期，請重新登入。',
  version_conflict: '資料已由其他人修改，請重新載入。', batch_locked: '當週奉獻紀錄已送審，不能直接修改。',
  invalid_counters: '請選兩位不同且有登錄權限的點收同工。', member_code_mismatch: '會友與奉獻編號不一致。',
  unlinked_offering_code: '奉獻編號尚未連結會友，請先查證。', bag_total_mismatch: '本筆奉獻總額與分類加總不符。',
  cash_total_mismatch: '現金實點與奉獻登錄合計不符。', verified_cash_mismatch: '師母實點金額與同工點收不符。',
  invalid_transition: '目前狀態不能執行此步驟。', reason_required: '退回時請填寫原因。',
  target_not_mplus_admin: '該帳號沒有 M+ 管理權限。', service_unavailable: '服務暫時無法使用，請稍後再試。'
};
const state = { roles: new Set(), owner: false, workers: [], batch: null, groups: [], busy: false, dirty: true, userId: null, pendingCounterUserId: null, needsRefresh: false };
let nextGroupId = 1;
const fieldGuidance=createFieldGuidance($('#cash-form'));$('#cash-form').noValidate=true;
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

function status(message, tone = '', announce = true) {
  const element = $('#finance-status'); element.setAttribute('aria-live',announce ? 'polite' : 'off'); element.textContent = message; element.dataset.tone = tone;const footer=$('#finance-save-feedback');if(footer){footer.textContent=message;footer.dataset.tone=tone;}
}

async function work(task, pending = '正在讀取工作資料…') {
  if (state.busy) return;
  status(pending,'busy');state.busy = true; $('#finance-status').setAttribute('aria-busy','true');$('#cash-form').inert=true; $('#cash-form').setAttribute('aria-busy','true'); drawConfirmations();
  let focusFields=false;
  try { await task(); } catch (error) { focusFields=error instanceof FieldValidationError;status(error.message || '操作未完成。', 'error'); }
  finally { if($('#finance-status').textContent===pending)status('');$('#finance-status').removeAttribute('aria-busy');state.busy = false; $('#cash-form').inert=state.needsRefresh; $('#cash-form').removeAttribute('aria-busy'); drawConfirmations();if(focusFields&&!state.needsRefresh)fieldGuidance.focusFirst(); }
}

function tab(name) {
  if(name==='editor'&&!state.roles.has('entry')&&!state.batch)name='batches';
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

function canLeaveEditor(){
  return $('#cash-form').dataset.unsavedChanges!=='true'||confirm('還有尚未儲存的奉獻資料。要放棄修改並離開嗎？');
}
function clearEditor() {
  if(!canLeaveEditor())return;fieldGuidance.clear();
  state.needsRefresh=false;$('#recover-finance').hidden=true;$('#cash-form').dataset.unsavedChanges='false';
  if(!state.roles.has('entry')){status('此帳號沒有「同工登錄」權限，請由系統負責人於財務人員權限設定。','error');return;}
  state.batch = null; state.dirty = true; state.pendingCounterUserId=null; state.groups = [newGroup()];
  $('#offering-date').value = mostRecentSunday();
  $('#counted-cash').value = '';
  $('#editor-title').textContent = '新增當週奉獻紀錄';
  $('#editor-state').textContent = '儲存後，由兩位點收同工各自確認，再送師母複審。';
  $('#review-panel').hidden = true;
  $('#cash-form').querySelectorAll('input,select,button').forEach(control => { control.disabled = false; });
  $('#add-donor').disabled = false; $('#add-anonymous').disabled = false;
  $('#submit-batch').hidden = false;
  drawGroups(); totals(); drawConfirmations(); tab('editor');
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

const memberLookups=new WeakMap();
async function searchMember(group,results){
 if(!state.roles.has('entry')){results.replaceChildren(textNode('p','此帳號沒有「同工登錄」權限；請由系統負責人於財務人員權限設定。','finance-note finance-member-error'));return;}
 const term=group.name.trim()||group.offeringCode.trim(),request={};memberLookups.set(group,request);
 if(!term){results.replaceChildren();return;}if(state.busy)return;
 const fresh=()=>memberLookups.get(group)===request&&results.isConnected&&state.groups.includes(group)&&group.name.trim()===term;
 results.replaceChildren(textNode('p','正在查找會友，請稍候…','finance-note'));
 try{
  const response=await api('members',{search:term});if(!fresh())return;
  results.replaceChildren();
  if(!response.members.length){results.append(textNode('p','沒有找到相符會友。請確認姓名；尚未建檔者可先保留姓名暫存。','finance-note'));return;}
  results.append(textNode('p','請點選正確會友以連結資料；同名者請核對電話或奉獻編號。','finance-note'));
  for(const member of response.members){
   const button=textNode('button',`${member.name}　${member.offeringCode?'奉獻編號 '+member.offeringCode:'奉獻編號待補'}${member.phone?'　'+member.phone:''}`);button.type='button';button.className='secondary';
   button.addEventListener('click',()=>{
    if(!fresh()||state.busy)return;
    memberLookups.set(group,{});group.memberId=member.id;group.offeringCode=member.offeringCode||'';group.name=member.name;group.phone=member.phone||'';
    invalidateGroup(group);markDirty();drawGroups();status(`已連結會友 ${member.name}。${group.offeringCode?'奉獻編號與會友資料已帶入。':'會友已連結；奉獻編號尚未設定，請在下方補編號。'}`);
   });results.append(button);
  }
 }catch(error){if(fresh())results.replaceChildren(textNode('p',error.message===errors.forbidden?'目前沒有「同工登錄」權限，請由系統負責人於財務人員權限設定；已填內容保留。':(error.message||'查找失敗')+' 請按「搜尋會友」重試，已填內容會保留。','finance-note finance-member-error'));}
}

function bagTotal(group,bag){return (group.anonymous?['一般／不具名奉獻']:categories).reduce((sum,category)=>sum+(number(bag.amounts[category])||0),0);}
function clearBagConfirmation(bag){bag.confirmed=false;bag.confirmedBy=null;bag.confirmedAt=null;}
function invalidateGroup(group){group.bags.forEach(clearBagConfirmation);}
function drawBag(group, bag, index) {
  const details=document.createElement('details');details.className='finance-bag';details.dataset.bagIndex=index;details.open=true;
  const summary=document.createElement('summary');details.append(summary);
  const grid=document.createElement('div');grid.className='finance-category-grid';
  const totalInput=field('number',0,()=>{});totalInput.readOnly=true;totalInput.className='finance-bag-total';
  const confirm=document.createElement('input');confirm.type='checkbox';confirm.className='finance-bag-confirm';
  const confirmText=textNode('span','');const checkLabel=document.createElement('label');checkLabel.className='finance-check finance-bag-check';checkLabel.append(confirm,confirmText);
  function refresh(){
    bag.declaredTotal=bagTotal(group,bag);totalInput.value=bag.declaredTotal;summary.textContent=`第 ${index+1} 筆 · ${bag.declaredTotal.toLocaleString('zh-TW')} 元`;
    confirm.checked=bag.confirmed===true;confirm.disabled=bag.declaredTotal<=0;
    const who=state.workers.find(worker=>worker.userId===bag.confirmedBy)?.name||'同工';
    confirmText.textContent=bag.confirmedAt?`${who}已確認 · ${new Date(bag.confirmedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`:'我已核對本筆分類與自動加總金額（一位同工勾選即可）';
  }
  for(const category of group.anonymous?['一般／不具名奉獻']:categories){
    const input=field('number',bag.amounts[category]??'',value=>{bag.amounts[category]=value;clearBagConfirmation(bag);refresh();totals();},{min:'0'});input.dataset.offeringCategory=category;grid.append(labelFor(category,input));
  }
  details.append(grid);
  if(!group.anonymous){const purpose=field('text',bag.designation,value=>{bag.designation=value;clearBagConfirmation(bag);refresh();},{maxLength:120});purpose.dataset.offeringPurpose='true';details.append(labelFor('指定奉獻用途',purpose));}
  const footer=document.createElement('div');footer.className='finance-bag-footer';footer.append(labelFor('本筆奉獻總額（自動加總）',totalInput));
  const remove=textNode('button','移除這筆');remove.type='button';remove.className='secondary';remove.addEventListener('click',()=>{group.bags.splice(index,1);markDirty();drawGroups();totals();});footer.append(remove);
  confirm.addEventListener('change',()=>{bag.confirmed=confirm.checked;bag.confirmedBy=null;bag.confirmedAt=null;refresh();});
  details.append(footer,textNode('strong','本筆確認（1 位同工即可）','finance-bag-confirm-title'),checkLabel,textNode('small','每筆由一位有登錄權限的同工確認；儲存時記錄確認人與時間。','finance-note'));refresh();return details;
}

function drawGroup(group, index) {
  const card = document.createElement('section'); card.className = 'finance-group'; card.dataset.groupKey=group.key;
  const head = document.createElement('div'); head.className = 'finance-group-head';
  head.append(textNode('h4', group.anonymous ? '匿名現金' : `奉獻者 ${index + 1}`));
  const remove = textNode('button', '移除奉獻者'); remove.type = 'button'; remove.className = 'secondary';
  remove.addEventListener('click', () => { state.groups.splice(index, 1); markDirty(); drawGroups(); totals(); });
  head.append(remove); card.append(head);
  const fields = document.createElement('div'); fields.className = 'finance-group-fields';
  if (!group.anonymous) {
    let timer=null,composing=false,phoneInput;
    const name = field('text', group.name, value => {
      memberLookups.set(group,{});clearTimeout(timer);results.replaceChildren();
      if(value!==group.name){
        if(group.memberId!=null){group.memberId=null;group.offeringCode='';group.phone='';if(phoneInput)phoneInput.value='';codeNote.querySelector('.finance-code-assignment')?.remove();}
        invalidateGroup(group);
      }
      group.name=value;codeStatus.textContent='尚未連結會友；請選擇下方搜尋結果。';
      if(!composing&&value.trim())timer=setTimeout(()=>void searchMember(group,results),350);
    }, { maxLength: 80 });
    name.className='finance-member-query';name.placeholder='輸入姓名或奉獻編號，自動查找';name.setAttribute('aria-label','奉獻者姓名或奉獻編號');name.autocomplete='off';
    name.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);memberLookups.set(group,{});results.replaceChildren();});
    name.addEventListener('compositionend',()=>{composing=false;clearTimeout(timer);if(group.name.trim())timer=setTimeout(()=>void searchMember(group,results),350);});
    name.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&!composing){event.preventDefault();clearTimeout(timer);void searchMember(group,results);}});
    const nameWrap = document.createElement('div'); nameWrap.className = 'finance-inline'; nameWrap.append(name);
    const search = textNode('button', '搜尋會友'); search.type = 'button'; search.className = 'secondary';
    const results = document.createElement('div'); results.className = 'finance-search-results';results.setAttribute('role','status');results.setAttribute('aria-live','polite');
    search.addEventListener('click',()=>{clearTimeout(timer);void searchMember(group,results);});
    nameWrap.append(search); const nameBlock = document.createElement('div');
    nameBlock.append(textNode('strong','奉獻者姓名或奉獻編號'),nameWrap,textNode('small','輸入後自動查找，再點選正確會友；只有姓名文字尚未連結會友。','finance-note'),results); fields.append(nameBlock);
    const codeNote = document.createElement('div');
    const codeStatus=textNode('strong',group.memberId?`已連結會友：${group.name} · 奉獻編號：${group.offeringCode||'待補（尚未設定）'}`:'尚未連結會友；輸入姓名後請點選搜尋結果。','finance-member-state');codeNote.append(codeStatus);
    if (group.memberId && !group.offeringCode) {
      const input = field('text', '', () => {}, { maxLength: 4 }); input.placeholder = '四位數';input.setAttribute('aria-label','四位奉獻編號');
      const assign = textNode('button', '設定編號'); assign.type = 'button';
      assign.addEventListener('click', () => void work(async () => {
        const offeringCode = normalizeOfferingCode(input.value);
        await api('assign_code', { memberId: group.memberId, offeringCode });
        group.offeringCode = offeringCode; invalidateGroup(group); markDirty(); drawGroups(); status('奉獻編號已設定。');
      }));
      const row = document.createElement('div'); row.className = 'finance-inline finance-code-assignment'; row.append(input, assign); codeNote.append(row);
    }
    fields.append(codeNote);
    phoneInput=field('tel',group.phone,value=>{group.phone=value;},{maxLength:60});const contact=document.createElement('details');contact.className='finance-contact-options';contact.append(textNode('summary','聯絡資料（選填）'),labelFor('電話（選填）',phoneInput),labelFor('地址（選填）',field('text',group.address,value=>{group.address=value;},{maxLength:300})));fields.append(contact);
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
    const add = textNode('button', '＋ 同一人再加一筆'); add.type = 'button'; add.className = 'secondary';
    add.addEventListener('click', () => { group.bags.push({ declaredTotal: '', amounts: {}, designation: '' }); markDirty(); drawGroups(); totals(); });
    card.append(add);
  }
  return card;
}

function drawGroups() { fieldGuidance.clear();$('#donor-groups').replaceChildren(...state.groups.map(drawGroup)); }
function totals() {
  const entered = state.groups.reduce((sum,group)=>sum+group.bags.reduce((n,bag)=>n+bagTotal(group,bag),0),0);
  $('#counted-cash').value = entered;
  $('#entered-total').textContent = entered.toLocaleString('zh-TW');

}

function validateEditor(){
 const issues=[],add=(control,message,anchor)=>issues.push({control,message,anchor});
 const date=$('#offering-date'),one=$('#counter-one'),two=$('#counter-two');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date.value)||!date.validity.valid)add(date,'奉獻日期：請選擇正確日期。');
 if(!one.value)add(one,'點收同工 1：請選擇一位點收同工。');
 if(!two.value)add(two,'點收同工 2：請選擇另一位點收同工。');else if(one.value===two.value)add(two,'點收同工 2：須與第一位不同。');
 if(!state.groups.length)add($('#add-donor'),'請先新增一位奉獻者或一筆匿名現金。',$('#donor-groups'));
 for(const [groupIndex,group]of state.groups.entries()){
  const card=[...$('#donor-groups').children].find(node=>node.dataset.groupKey===String(group.key)),who=group.anonymous?'匿名現金 '+(groupIndex+1):'奉獻者 '+(groupIndex+1);
  if(!group.name.trim())add(card.querySelector('.finance-member-query'),who+'：請填寫姓名。');
  if(!group.bags.length)add(card.querySelector(':scope > button')||card.querySelector('.finance-group-head button'),who+'：請新增一筆明細，或移除空白資料。',card.querySelector('.finance-bags'));
  if(group.memberId&&!group.offeringCode)add(card.querySelector('.finance-code-assignment input'),who+'：請先補上四位奉獻編號。');
  for(const [bagIndex,bag]of group.bags.entries()){
   const details=card.querySelectorAll('.finance-bag')[bagIndex],amounts=[...details.querySelectorAll('[data-offering-category]')],where=who+' · 第 '+(bagIndex+1)+' 筆',before=issues.length;
   for(const input of amounts)if(input.validity.badInput||input.value!==''&&(!input.validity.valid||!Number.isSafeInteger(Number(input.value))||Number(input.value)<0))add(input,where+'：'+input.dataset.offeringCategory+'金額請填 0 或正整數。');
   if(!amounts.some(input=>Number(input.value)>0))add(amounts[0],where+'：請至少填一項大於 0 的奉獻金額。');
   const purpose=details.querySelector('[data-offering-purpose]');if(Number(bag.amounts['指定奉獻'])>0&&!bag.designation.trim())add(purpose,where+'：指定奉獻須填用途。');
   if(!Number.isSafeInteger(bagTotal(group,bag)))add(amounts[0],where+'：合計超出可計算範圍，請檢查金額。');
   if(issues.length===before&&bagTotal(group,bag)>0&&bag.confirmed!==true)add(details.querySelector('.finance-bag-confirm'),where+'：請核對本筆明細後勾選確認。');
  }
 }
 if(fieldGuidance.report(issues))throw new FieldValidationError();
}

function makePayload() {
  if (!state.groups.length) throw new Error('請至少登錄一位奉獻者或一筆匿名現金。');
  const counters = [$('#counter-one').value, $('#counter-two').value];
  if (!counters[0] || !counters[1] || counters[0] === counters[1]) throw new Error(errors.invalid_counters);
  const bags = state.groups.flatMap(group => group.bags.map(bag => {
    const lines = (group.anonymous ? ['一般／不具名奉獻'] : categories).filter(category => number(bag.amounts[category]) > 0).map(category => ({
      category, amount: number(bag.amounts[category]), ...(category === '指定奉獻' ? { designation: bag.designation.trim() } : {})
    }));
    if (!group.name.trim()) throw new Error('每位奉獻者須填姓名。');
    if (group.memberId && !group.offeringCode) throw new Error('已選會友仍缺奉獻編號，請先補編號。');
    if (!lines.length) throw new Error('每筆至少填一項奉獻分類。');
    if (lines.some(line => line.category === '指定奉獻' && !line.designation)) throw new Error('指定奉獻須填用途。');
    const declaredTotal = bagTotal(group,bag);
    if (declaredTotal !== lines.reduce((sum, line) => sum + line.amount, 0)) throw new Error(errors.bag_total_mismatch);
    return { id:bag.id||null,confirmed:bag.confirmed===true,bagName: group.name.trim(), bagPhone: group.phone.trim(), bagAddress: group.address.trim(), memberId: group.memberId, offeringCode: group.offeringCode || null,
      anonymous: group.anonymous, publicChoice: group.publicChoice, hideFromBulletin: group.hideFromBulletin,
      receiptPreference: group.receiptPreference, declaredTotal, lines };
  }));
  const countedCash = number($('#counted-cash').value);
  if (!Number.isSafeInteger(countedCash) || countedCash <= 0) throw new Error('請先填寫每筆奉獻金額。');
  return { offeringDate: $('#offering-date').value, counterUserIds: counters, countedCash, counterConfirmed:state.pendingCounterUserId===state.userId, bags };
}

function markDirty(){state.dirty=true;$('#cash-form').dataset.unsavedChanges='true';state.pendingCounterUserId=null;drawConfirmations();}
function bothConfirmed(){
  const b=state.batch;
  return !!b&&!!b.counter_1_confirmed_at&&!!b.counter_2_confirmed_at&&b.counter_1_confirmed_by===b.counter_1&&b.counter_2_confirmed_by===b.counter_2;
}
function drawConfirmations(){
  const b=state.batch,clean=!!b&&!state.dirty,editable=!state.needsRefresh&&state.roles.has('entry')&&(!b||['draft','returned'].includes(b.status)),bagsConfirmed=state.groups.length>0&&state.groups.every(group=>group.bags.length>0&&group.bags.every(bag=>bag.confirmed===true));
  for(const [n,key] of [[1,'one'],[2,'two']]){
    const input=$('#confirm-counter-'+key);if(!input)return;
    const userId=$('#counter-'+key).value,confirmed=clean&&!!b?.['counter_'+n+'_confirmed_at'],pending=state.pendingCounterUserId===userId;
    const worker=state.workers.find(worker=>worker.userId===userId);
    input.checked=confirmed||pending;
    input.disabled=!editable||state.busy||userId!==state.userId||!bagsConfirmed;
    const time=confirmed?new Date(b['counter_'+n+'_confirmed_at']).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'';
    $('#confirm-counter-'+key+'-label').textContent='點收同工 '+n+'：'+(worker?.name||'尚未選擇')+(confirmed?' · 已確認 '+time:pending?' · 已勾選，請儲存草稿':' · 我已核對整批明細與總額（本人勾選）');
  }
  $('#save-draft').disabled=state.busy||!editable;
  $('#submit-batch').disabled=!clean||!editable||state.busy||!bagsConfirmed||!bothConfirmed();
  $('#reload-confirmations').disabled=!clean||state.busy;
  $('#counter-confirm-note').textContent=!bagsConfirmed?'請先完成各筆奉獻的單人確認。':!clean?'第一位同工可勾選本人確認後儲存；第二位以自己的帳號核對、勾選後送審。修改明細後需重新確認。':bothConfirmed()?'兩位點收同工已確認，可送師母複審。':'請由兩位點收同工各自登入核對並勾選，不能代勾。另一位完成後，按「重新讀取確認」。';
}
async function confirmCounter(confirmed){
  if(!state.batch||state.dirty){state.pendingCounterUserId=confirmed?state.userId:null;status(confirmed?'已勾選本人確認，請儲存草稿。':'已取消本次本人確認勾選。');return;}
  status('正在儲存本人點收確認…');
  const result=await api('confirm_counter',{batchId:state.batch.id,version:state.batch.version,confirmed});
  await readAfterWrite(result.batch,confirmed?'本人點收確認已儲存。':'已取消本人點收確認。');
}

async function readAfterWrite(batch, message){
  state.batch=batch;state.dirty=false;$('#cash-form').dataset.unsavedChanges='false';
  try{await openBatch(batch.id);status(message,'success');}
  catch{state.needsRefresh=true;$('#recover-finance').hidden=false;status('資料已儲存，但最新紀錄暫時無法讀回。請按「重新讀取已儲存紀錄」，勿再次送出。','warning');}
}
async function save() {
  if(state.needsRefresh)throw new Error('請先重新讀取已儲存紀錄，避免重複送出。');
  validateEditor();
  const data = makePayload();
  const result = await api('save', { batchId: state.batch?.id || null, version: state.batch?.version || null, data });
  await readAfterWrite(result.batch,'草稿已儲存。');
}

async function transition(step) {
  if (!state.batch) throw new Error('請先儲存草稿。');
  if (step === 'submit' && (state.dirty || !bothConfirmed())) throw new Error(errors.counter_confirmations_required);
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
  await readAfterWrite(result.batch,'狀態已更新。');
}

async function openBatch(id) {
  if(state.batch?.id!==id&&!canLeaveEditor())return;
  const response = await api('get', { batchId: id }); const batch = response.batch;
  state.needsRefresh=false;$('#recover-finance').hidden=true;fieldGuidance.clear();
  state.batch = batch; state.dirty = false; state.pendingCounterUserId=null; $('#cash-form').dataset.unsavedChanges='false'; state.groups = [];
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
    group.bags.push({ id:bag.id,confirmed:!!bag.confirmed_by&&!!bag.confirmed_at,confirmedBy:bag.confirmed_by,confirmedAt:bag.confirmed_at,declaredTotal: String(bag.declared_total), amounts,
      designation: bag.lines.find(line => line.category === '指定奉獻')?.designation || '' });
  }
  $('#offering-date').value = batch.offering_date;
  $('#counted-cash').value = batch.counted_cash;
  $('#counter-one').value = batch.counter_1; $('#counter-two').value = batch.counter_2;
  $('#editor-title').textContent = `${batch.offering_date} 主日現金`;
  $('#editor-state').textContent = `狀態：${statusLabel(batch.status)} · 版本 ${batch.version}${state.roles.has('entry')?'':' · 您可查看並依權限複審，不能修改奉獻明細。'}`;
  drawGroups(); totals(); drawReview(response.events);
  const writable = state.roles.has('entry') && ['draft','returned'].includes(batch.status);
  $('#cash-form').querySelectorAll('input,select,button').forEach(control => { control.disabled = !writable; });
  $('#add-donor').disabled = !writable; $('#add-anonymous').disabled = !writable;
  drawConfirmations(); tab('editor');
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
  if (!response.batches.length) list.append(textNode('p','目前沒有當週奉獻紀錄。','finance-note'));
  for (const batch of response.batches) {
    const card = document.createElement('div'); card.className = 'finance-list-card finance-role-row';
    const detail = document.createElement('div');
    detail.append(textNode('strong',`${batch.offering_date}　${statusLabel(batch.status)}`),textNode('small',`登錄合計 ${Number(batch.entered_total).toLocaleString('zh-TW')} 元 · 版本 ${batch.version}`));
    const open = textNode('button','查看當週紀錄'); open.type = 'button'; open.addEventListener('click', () => void work(() => openBatch(batch.id)));
    card.append(detail,open); list.append(card);
  }
}

function syncRoleChecks(accounts) {
  const byUser = new Map(accounts.map(account => [account.userId,new Set(account.roles)]));
  for (const input of $('#role-list').querySelectorAll('input[data-role-key]')) {
    const assigned = byUser.get(input.dataset.userId);
    if (assigned) input.checked = assigned.has(input.dataset.roleKey);
    const account=accounts.find(a=>a.userId===input.dataset.userId);input.dataset.inherited=String((account?.inheritedRoles||[]).includes(input.dataset.roleKey));
  }
}

function roleFeedback(note, message, tone = '') {
  note.setAttribute('aria-live',tone === 'error' ? 'assertive' : 'polite');
  note.textContent = message; note.dataset.tone = tone;
}

async function roles() {
  const response = await api('accounts'); const list = $('#role-list'); list.replaceChildren();
  for (const account of response.accounts) {
    const card = document.createElement('div'); card.className = 'finance-list-card finance-role-row';
    const person = document.createElement('div'); person.append(textNode('strong',account.name),textNode('small',account.title));
    const choices = document.createElement('div'); choices.className = 'finance-role-checks';
    const note = textNode('p','','finance-role-status'); note.setAttribute('role','status'); note.setAttribute('aria-live','polite'); person.append(note);
    if((account.inheritedRoles||[]).includes('entry'))person.append(textNode('p','同工登錄：由「教會 → 財務會計」主責／共同參與繼承，請至同工帳號的事工分工調整。'+(account.legacyEntry?' 此人另有舊制個別登錄授權；移除分工後，該個別授權仍保留。':''),'finance-note'));
    for (const [role,label] of Object.entries(labels)) {
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = account.roles.includes(role);
      input.dataset.userId = account.userId; input.dataset.roleKey = role;
      input.dataset.inherited=String((account.inheritedRoles||[]).includes(role));input.disabled=input.dataset.inherited==='true';
      input.addEventListener('change', () => {
        const enabled = input.checked;
        if (state.busy) { input.checked = !enabled; return; }
        void work(async () => {
          const controls = [...list.querySelectorAll('input[type="checkbox"]')], reload = $('#reload-roles');
          controls.forEach(control => { control.disabled = true; });
          reload.disabled = true;
          roleFeedback(note,'正在儲存…');
          let freeze = false, snapshot = null, warning = '';
          try {
            try {
              await api('assign_role',{ userId: account.userId, role, enabled });
            } catch (writeError) {
              try {
                snapshot = await api('accounts'); syncRoleChecks(snapshot.accounts);
                const current = snapshot.accounts.find(item => item.userId === account.userId);
                if (!current) throw new Error('account_missing');
                if (current.roles.includes(role) !== enabled) {
                  roleFeedback(note,'未儲存，請再試一次。','error');
                  status(writeError.message || '權限未儲存。','error',false);
                  return;
                }
              } catch {
                freeze = true;
                roleFeedback(note,'無法確認是否儲存，請按「重新讀取權限」。','error');
                status('無法確認權限是否儲存，請重新讀取權限。','error',false);
                return;
              }
            }
            if (!snapshot) {
              try { snapshot = await api('accounts'); syncRoleChecks(snapshot.accounts); }
              catch { warning = '已儲存，但最新權限清單暫時無法讀取。'; }
            }
            if (snapshot) {
              const current = snapshot.accounts.find(item => item.userId === account.userId);
              if (!current) { freeze = true; warning = '此同工已不在最新清單，請按「重新讀取權限」。'; }
              else if (current.roles.includes(role) !== enabled) warning = '權限已被其他人更新，請確認目前勾選狀態。';
            }
            if (!freeze && role === 'entry') {
              try { await workers(); }
              catch { warning = '權限已儲存，但點收同工清單暫時無法更新。'; }
            }
            roleFeedback(note,warning || '已儲存。',warning ? 'warning' : 'success');
            status(warning || `${account.name}的${label}權限已儲存。`,warning ? 'error' : '',false);
          } finally {
            if (!freeze) controls.forEach(control => { control.disabled = control.dataset.inherited==='true'; });
            reload.disabled = false;
          }
        });
      });
      const wrapper = document.createElement('label'); wrapper.append(input,textNode('span',label)); choices.append(wrapper);
    }
    card.append(person,choices); list.append(card);
  }
}

for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => void work(async () => {
  const name = button.dataset.tab; if (name === 'batches') await batches(); if (name === 'roles') await roles(); tab(name);
}));
$('#review-only-roles').addEventListener('click',()=>void work(async()=>{await roles();tab('roles');}));
$('#reload-roles').addEventListener('click', () => void work(async () => { await roles(); await workers(); status('已重新讀取人員權限。'); }));
$('#new-batch').addEventListener('click', clearEditor);
$('#back-to-list').addEventListener('click', () => void work(async () => { await batches(); tab('batches'); }));
$('#add-donor').addEventListener('click', () => { state.groups.push(newGroup()); markDirty(); drawGroups(); totals(); });
$('#add-anonymous').addEventListener('click', () => { if (!state.groups.some(group => group.anonymous)) state.groups.push(newGroup(true)); markDirty(); drawGroups(); totals(); });
function editorChanged(event){
  if(event.target.id.startsWith('confirm-counter-'))return;
  if(event.target.id==='offering-date'){state.groups.forEach(invalidateGroup);$('#donor-groups').querySelectorAll('.finance-bag-confirm').forEach(input=>{input.checked=false;});$('#donor-groups').querySelectorAll('.finance-bag-check span').forEach(span=>{span.textContent='奉獻日期已修改，請重新核對本筆並勾選。';});}
  const card=event.target.closest('.finance-group'),bagNode=event.target.closest('.finance-bag');
  if(card&&!bagNode){const group=state.groups.find(group=>String(group.key)===card.dataset.groupKey);if(group){invalidateGroup(group);card.querySelectorAll('.finance-bag-confirm').forEach(input=>{input.checked=false;});card.querySelectorAll('.finance-bag-check span').forEach(span=>{span.textContent='本筆資料已修改，請重新核對並勾選。';});}}
  markDirty();
}
$('#cash-form').addEventListener('input',editorChanged);
$('#cash-form').addEventListener('change',editorChanged);
for(const key of ['one','two'])$('#confirm-counter-'+key).addEventListener('change',event=>{
  const confirmed=event.target.checked;
  if(state.busy){drawConfirmations();return;}
  void work(()=>confirmCounter(confirmed));
});
$('#reload-confirmations').addEventListener('click',()=>void work(async()=>{if(state.dirty||!state.batch)throw new Error('請先儲存草稿。');await openBatch(state.batch.id);status('已重新讀取點收確認。');}));
$('#cash-form').addEventListener('submit', event => { event.preventDefault(); void work(save,'正在儲存奉獻草稿，請稍候…'); });
$('#submit-batch').addEventListener('click', () => void work(() => transition('submit'),'正在送師母複審，請勿重複送出…'));

await work(async () => {
  const checked = await db.auth.getUser();
  if (checked.error || !checked.data?.user) throw new Error('請先登入教會 OS。');
  const profile = await api('profile'); state.roles = new Set(profile.roles); state.owner = profile.owner; state.userId = profile.actorUserId || checked.data.user.id;
  if (!state.owner && !state.roles.size) throw new Error('此帳號尚未獲授權使用財務模組。');
  $('#finance-app').hidden = false; $('#roles-tab').hidden = !state.owner;
  const canEnter=state.roles.has('entry');
  $('#new-batch').hidden = !canEnter;
  $('[data-tab="editor"]').hidden = !canEnter;
  $('#review-only-notice').hidden = canEnter;
  $('#review-only-roles').hidden = !state.owner || canEnter;
  if(!canEnter){
    $('#review-only-title').textContent=state.roles.has('approve')?'您的工作是牧師複審':'您的工作是核對奉獻紀錄';
    $('#review-only-message').textContent=state.roles.has('approve')?'同工建立紀錄、師母核對現金後，狀態為「待牧師複審」時，請點下方的「查看當週紀錄」完成審核。您目前沒有新增奉獻的權限。':'同工建立紀錄後，請點下方的「查看當週紀錄」，依您的權限核對。您目前沒有新增奉獻的權限。';
  }
  await workers(); await batches();
  status(state.roles.has('entry')?'已載入主日奉獻工作區。':'已載入主日奉獻工作區。此帳號未授權「同工登錄」，可依現有權限查看或複審。');
});

$('#recover-finance').addEventListener('click',()=>void work(async()=>{if(!state.batch)return;await openBatch(state.batch.id);status('已重新讀取已儲存紀錄。','success');}));
window.addEventListener('beforeunload',event=>{if($('#cash-form').dataset.unsavedChanges==='true'){event.preventDefault();event.returnValue='';}});
