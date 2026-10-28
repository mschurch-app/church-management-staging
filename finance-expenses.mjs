import {scanInvoiceQr,mergeInvoiceRecognition} from './finance/receipt-qr.mjs?v=20261023-qr1';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {element as node} from './app-ui.mjs?v=20261019-workflow1';
import {mountMplusFunctionNavigation} from './mplus-function-nav.mjs?v=20261028-receipts1';
import {expenseCategories,expenseRoles,expenseStatuses,validateExpense,expenseActions,expenseTotals} from './finance/expenses.mjs?v=20261023-expenses1';
import {receiptOcrSuggestions} from './finance/receipt-ocr.mjs?v=20261023-ocr1';
const $=s=>document.querySelector(s),form=$('#expense-form');
const state={roles:[],owner:false,actor:null,row:null,rows:[],busy:false,dirty:false,pending:null,action:null,photos:[],draftId:null};
const errors={ocr_not_configured:'辨識服務尚未就緒，照片已保留，可先手動填寫。',ocr_rate_limited:'已達辨識次數上限，請手動填寫或稍後再試。',ocr_timeout:'辨識逾時，照片已保留。可讀取結果或重試。',ocr_provider_failed:'辨識服務暫時無法使用，照片已保留，可重試。',ocr_invalid_result:'照片辨識不完整，請核對原圖並手動填寫。',ocr_incomplete:'照片辨識不完整，請核對原圖並手動填寫。',forbidden:'沒有這項支出操作權限。',login_required:'登入已過期，請重新登入。',version_conflict:'紀錄已更新，請重新讀取後核對；已填內容目前保留。',expense_locked:'已送審，不能直接修改明細。',invalid_transition:'狀態已改變，請重新讀取紀錄。',expense_not_found:'找不到這筆支出或沒有閱覽權限。',reason_required:'請填寫原因或修正說明。',payment_details_required:'請填寫付款日期與付款憑據。',invalid_receipt:'憑證照片尚未完成，請重新讀取後確認。',invalid_expense:'支出欄位不完整或金額不正確。',request_failed:'欄位未通過檢查，請確認日期、金額與憑證。'};
const money=v=>BigInt(v).toLocaleString('zh-TW')+' 元';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function status(message,tone=''){const n=$('#expense-status');n.textContent=message;n.dataset.tone=tone;}
async function api(action,values={}){
 let timer;let response;try{response=await Promise.race([db.functions.invoke('finance-expenses',{body:{action,...values}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('連線逾時，結果尚待確認。'),{uncertain:true})),20000);})]);}finally{clearTimeout(timer);}
 if(response.error){let code;try{code=(await response.error.context?.json())?.code;}catch{}const error=Object.assign(Error(errors[code]||'連線未完成，請重試或重新讀取紀錄。'),{code,uncertain:!code});throw error;}
 if(!response.data?.ok)throw Object.assign(Error(errors[response.data?.code]||'操作未完成，請稍後再試。'),{code:response.data?.code});
 return response.data;
}
async function work(task){if(state.busy)return;state.busy=true;$('#expense-app').inert=true;$('#retry-mutation').disabled=true;$('#recover-expense').disabled=true;status('正在處理，請稍候…','busy');try{await task();}catch(error){status(error.message,'error');}finally{state.busy=false;$('#expense-app').inert=!!state.pending;$('#retry-mutation').disabled=false;$('#recover-expense').disabled=false;if($('#expense-status').dataset.tone==='busy')status('已載入支出工作區。');}}
function canLeave(){return !state.dirty||confirm('還有尚未儲存的支出明細。要放棄修改並離開嗎？');}
function panel(name){if(name!=='editor')for(const photo of state.photos)clearTimeout(photo.ocrPoll);for(const key of ['list','editor','roles'])$(`#${key}-panel`).hidden=key!==name;for(const b of document.querySelectorAll('[data-panel]'))b.setAttribute('aria-current',b.dataset.panel===name?'page':'false');$('#action-form').hidden=true;}
function showRetry(){ $('#retry-mutation').hidden=!state.pending;$('#recover-expense').hidden=!state.pending; }
function markDirty(){state.dirty=true;form.dataset.unsavedChanges='true';$('#expense-actions').replaceChildren(node('p','儲存明細後才能送審。','finance-note'));}
function clean(){state.dirty=false;form.dataset.unsavedChanges='false';}
function render(row,events=[],photos=[]){
 for(const photo of state.photos){clearTimeout(photo.ocrPoll);if(photo.localUrl)URL.revokeObjectURL(photo.localUrl);}
 $('#receipt-feedback').textContent='';$('#receipt-ocr-result').replaceChildren();$('#receipt-ocr-result').hidden=true;state.photos=photos.map(p=>({...p,ready:true,persisted:true}));state.draftId=row?.id||crypto.randomUUID();
 state.row=row;clean();panel('editor');$('#expense-title').textContent=row?'支出明細':'新增支出';$('#expense-stage').textContent=row?`${expenseStatuses[row.status]} · 版本 ${row.version}`:'先儲存草稿，再送會計核對。';
 const values=row?{expenseDate:row.expense_date,category:row.category,project:row.project,payee:row.payee,amount:row.amount,kind:row.kind,paymentSource:row.payment_source,purpose:row.purpose,voucherRef:row.voucher_ref,noVoucherReason:row.no_voucher_reason}:{expenseDate:today(),project:'M+',kind:'reimbursement',paymentSource:'petty_cash'};
 form.reset();for(const key of Object.keys(values))form.elements.namedItem(key).value=values[key]??'';
 const editable=state.roles.includes('entry')&&(!row||row.created_by===state.actor&&['draft','returned'].includes(row.status));
 for(const c of form.elements)c.disabled=!editable;$('#receipt-upload-controls').hidden=!editable;drawPhotos();$('#save-expense').hidden=!editable;$('#correction-field').hidden=row?.status!=='returned';$('#correction-reason').value='';
 const actions=$('#expense-actions');actions.replaceChildren();
 $('#expense-next').textContent=!row?'草稿儲存後可送會計核對。':({draft:'由提報人送出，依序經會計核對、師母審閱、牧師核准。',returned:'請提報人修正、填寫修正說明，儲存後重新送審。',accounting_review:'會計核對憑證與費用明細。',spouse_review:'等待師母審閱。',pastor_review:'等待牧師核准。',approved:'支出已核准，完成實際付款後再登錄付款憑據。',paid:'已完成付款登錄，金額與憑據鎖定，保留完整歷程。',voided:'此核准紀錄已沖銷，原始紀錄與原因保留。'}[row.status]||'');
 for(const [step,label]of row?expenseActions(row,state.roles,state.actor):[]){const button=node('button',label);button.type='button';button.dataset.step=step;if(['return','void'].includes(step))button.className='secondary';button.onclick=()=>{if(['return','void','pay'].includes(step)){state.action=step;$('#action-title').textContent=label;$('#action-reason-label').hidden=step==='pay';$('#payment-fields').hidden=step!=='pay';$('#payment-note').hidden=step!=='pay';$('#action-reason').value='';$('#payment-ref').value='';$('#paid-date').value=today();$('#action-form').hidden=false;$(step==='pay'?'#paid-date':'#action-reason').focus();}else void work(()=>mutate(step));};actions.append(button);}
 $('#payment-detail').textContent=row?.paid_date?`付款日期 ${row.paid_date} · ${row.payment_source==='bank'?'協會銀行':'零用金'} · 憑據 ${row.payment_ref}`:'';
 const history=$('#expense-history');history.replaceChildren();for(const event of events){const label={save:'儲存明細',submit:'送會計核對',verify:'會計核對通過',review:'師母審閱通過',approve:'牧師核准',pay:'登錄付款',return:'退回修正',void:'沖銷紀錄'}[event.action]||event.action;const li=node('li',`版本 ${event.version} · ${label} · ${new Date(event.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}${event.reason?' · '+event.reason:''}`);const details=node('details'),summary=node('summary','查看此版本明細');details.append(summary,node('p',`${event.snapshot.expense_date} · ${event.snapshot.category} · ${event.snapshot.payee} · ${money(event.snapshot.amount)} · ${event.snapshot.purpose}`));for(const [index,receiptId]of (event.snapshot.receipt_ids||[]).entries()){const button=node('button',`查看此版本憑證 ${index+1}`);button.type='button';button.className='secondary';button.onclick=()=>void work(async()=>{const result=await api('receipt_view',{id:row.id,receiptId});fullPhoto.src=result.url;viewer.showModal();});details.append(button);}li.append(details);history.append(li);}
}
async function open(id){const data=await api('get',{id});render(data.expense,data.events,data.receipts||[]);status('已讀取支出明細。');}
async function load(){const from=$('#from-date').value,to=$('#to-date').value;if(!from||!to||from>to)throw Error('請確認起迄日期。');const data=await api('list',{from,to});state.rows=data.expenses;drawList();}
function drawList(){const filter=$('#status-filter').value,rows=state.rows.filter(r=>!filter||r.status===filter),totals=expenseTotals(rows);$('#paid-total').textContent=money(totals.paid);$('#pending-total').textContent=money(totals.pending);$('#expense-count').textContent=`${rows.length} 筆${state.rows.length>=500?'（查詢上限 500 筆，請縮小日期範圍）':''}；依目前支出狀態加總，不代表零用金或銀行餘額。`;const list=$('#expense-list');list.replaceChildren();if(!rows.length)list.append(node('p','這段期間沒有符合條件的支出。','finance-note'));for(const row of rows){const card=node('article','','finance-list-card expense-row'),detail=node('div');detail.append(node('strong',`${row.expense_date} · ${row.category} · ${money(row.amount)}`),node('small',`${row.payee}｜${row.purpose}`),node('small',`${expenseStatuses[row.status]} · ${row.project} · ${row.payment_source==='bank'?'協會銀行':'零用金'}`));const button=node('button','查看明細');button.type='button';button.onclick=()=>void work(()=>open(row.id));card.append(detail,button);list.append(card);}}
async function mutate(action,extras={}){
 if(!state.pending){state.pending={action,values:{id:state.row?.id||state.draftId||crypto.randomUUID(),version:state.row?.version??null,requestId:crypto.randomUUID(),...extras}};}
 const pending=state.pending;
 try{const result=await api(pending.action,pending.values);state.pending=null;showRetry();clean();render(result.expense);try{await open(result.expense.id);}catch{status('操作已儲存，但最新歷程讀取失敗。請重新開啟明細。','error');}if($('#expense-status').dataset.tone!=='error')status('支出紀錄已儲存。');}
 catch(error){if(error.uncertain){showRetry();throw Error('尚無法確認是否儲存。已保留剛才的操作，可安全重試；或重新讀取確認。');}state.pending=null;showRetry();throw error;}
}
async function roles(){const response=await api('accounts'),list=$('#expense-role-list');list.replaceChildren();for(const account of response.accounts){const card=node('article','','finance-list-card'),name=node('strong',account.name),choices=node('div','','expense-role-checks'),feedback=node('p','','finance-note');feedback.setAttribute('role','status');card.append(name,node('p',account.title),choices,feedback);for(const [role,label]of Object.entries(expenseRoles)){const input=document.createElement('input');input.type='checkbox';input.checked=account.roles.includes(role);input.dataset.user=account.userId;input.dataset.role=role;const wrapper=node('label');wrapper.append(input,node('span',label));input.onchange=()=>void work(async()=>{const enabled=input.checked;try{await api('assign_role',{userId:account.userId,role,enabled});const profile=await api('profile');state.roles=profile.roles;$('#new-expense').hidden=!state.roles.includes('entry');await roles();status('支出權限已儲存。');}catch(error){input.checked=!enabled;feedback.textContent='權限結果尚待確認，請重新讀取權限。';throw error;}});choices.append(wrapper);}list.append(card);}}

const viewer=document.createElement('dialog');viewer.id='receipt-viewer';const closePhoto=node('button','關閉照片');closePhoto.type='button';const fullPhoto=document.createElement('img');fullPhoto.alt='支出憑證';viewer.append(closePhoto,fullPhoto);document.body.append(viewer);closePhoto.onclick=()=>viewer.close();viewer.addEventListener('close',()=>{fullPhoto.removeAttribute('src');});
function drawPhotos(){const area=$('#receipt-photos');area.replaceChildren();for(const photo of state.photos){const card=node('article','','receipt-photo');if(photo.localUrl){const image=document.createElement('img');image.src=photo.localUrl;image.alt=photo.name;card.append(image);}card.append(node('p',photo.name),node('small',photo.ready?(photo.persisted?'憑證已隨支出保存':'已上傳；請儲存草稿'):'尚未上傳成功'));
 if(photo.ready){const scan=node('button',photo.ocr?'查看辨識結果':'辨識發票');scan.type='button';scan.dataset.receiptOcr=photo.id;scan.className='secondary';scan.onclick=()=>void work(()=>recognizePhoto(photo,false));if(state.roles.includes('entry')&&(!state.row||state.row.created_by===state.actor&&['draft','returned'].includes(state.row.status)))card.append(scan);if(photo.ocrMessage)card.append(node('p',photo.ocrMessage,'finance-note'));
 const view=node('button','查看照片');view.type='button';view.dataset.viewReceipt='true';view.className='secondary';view.onclick=()=>{if(photo.localUrl){fullPhoto.src=photo.localUrl;viewer.showModal();}else void work(async()=>{const result=await api('receipt_view',{id:state.row?.id||state.draftId,receiptId:photo.id});fullPhoto.src=result.url;viewer.showModal();});};card.append(view);}else{const retry=node('button','重試上傳');retry.type='button';retry.onclick=()=>void work(()=>uploadPhoto(photo));card.append(retry);}
 if(state.roles.includes('entry')&&(!state.row||state.row.created_by===state.actor&&['draft','returned'].includes(state.row.status))){const remove=node('button','從本筆移除');remove.type='button';remove.className='secondary';remove.onclick=()=>{clearTimeout(photo.ocrPoll);if($('#receipt-ocr-result').dataset.receiptId===photo.id){$('#receipt-ocr-result').replaceChildren();$('#receipt-ocr-result').hidden=true;}if(photo.localUrl)URL.revokeObjectURL(photo.localUrl);state.photos=state.photos.filter(p=>p!==photo);drawPhotos();markDirty();};card.append(remove);}area.append(card);}}
async function uploadPhoto(photo){
 const body=new FormData();body.append('id',state.row?.id||state.draftId);body.append('receiptId',photo.id);body.append('file',photo.file);
 $('#receipt-feedback').textContent='正在上傳憑證照片，請稍候…';
 try{const response=await db.functions.invoke('finance-expenses',{body});if(response.error||!response.data?.ok)throw Error('照片上傳未完成，請按重試；已填明細保留。');photo.ready=true;photo.name=response.data.receipt.name;$('#receipt-feedback').textContent='照片已上傳，請儲存草稿以附在本筆支出。';markDirty();drawPhotos();status('憑證照片已上傳，請儲存草稿。');if($('#auto-receipt-ocr').checked)await recognizePhoto(photo,true);}
 catch(error){$('#receipt-feedback').textContent=error.message;drawPhotos();throw error;}
}

function applyOcrValue(key,value,overwrite=false){const control=form.elements.namedItem(key);if(!value||!control||control.disabled)return false;if(!overwrite&&control.value.trim())return false;control.value=value;markDirty();return true;}
function showOcr(photo,automatic=false){
 const result=photo.ocr,suggestions=receiptOcrSuggestions(result),area=$('#receipt-ocr-result');area.replaceChildren();area.hidden=false;area.dataset.receiptId=photo.id;
 area.append(node('h4','發票辨識結果 · '+photo.name),node('p',(result.source==='qr'?'已讀取電子發票 QR Code。':'')+'請核對原始照片；辨識不會自動儲存或送審。','finance-note'));
 const fields=[['voucherRef','發票號碼',suggestions.voucherRef],['amount','支出總金額（元）',suggestions.amount],['purpose','品項／用途摘要',suggestions.purpose]];
 const filled=[];for(const [key,label,value]of fields){const line=node('div','','receipt-ocr-field');line.append(node('strong',label),node('p',value||'未能確定，請手動填寫。'));if(value){if(automatic&&state.photos[0]===photo&&applyOcrValue(key,value))filled.push(label);const button=node('button',form.elements.namedItem(key).value.trim()?'採用此辨識值':'帶入欄位');button.type='button';button.className='secondary';button.dataset.ocrApply=key;button.onclick=()=>{applyOcrValue(key,value,true);status(label+'已帶入，請核對後儲存。');};line.append(button);}area.append(line);}
 if(result.items?.length){const details=node('details'),summary=node('summary','完整辨識品項');details.append(summary);const list=node('ul');for(const item of result.items)list.append(node('li',item.name+(item.quantity?' × '+item.quantity:'')));details.append(list);area.append(details);}
 if(suggestions.purpose.endsWith('…'))area.append(node('p','品項較多，帶入用途摘要時已縮短，請核對。','finance-note'));
 for(const warning of result.warnings||[])area.append(node('p',warning,'finance-note'));
 if(automatic)photo.ocrMessage=filled.length?'已帶入空白欄位：'+filled.join('、')+'。請核對後儲存。':'已辨識；現有欄位內容保留，可選擇採用辨識值。';
}
function handleOcrResult(photo,response,automatic){
 if(response.ocr.status==='ready'&&response.ocr.result){photo.cloudReady=true;photo.ocr=mergeInvoiceRecognition(photo.qr,response.ocr.result);const fill=automatic&&$('#auto-receipt-ocr').checked;showOcr(photo,fill);if(!fill)photo.ocrMessage='辨識完成，請核對後選擇帶入欄位。';$('#receipt-feedback').textContent=photo.ocrMessage;status(photo.ocrMessage);drawPhotos();return true;}
 if(response.ocr.status==='failed'){const message=errors[response.ocr.error]||'辨識未完成，照片已保留；可重試或手動填寫。';photo.ocrMessage=message;$('#receipt-feedback').textContent=message;drawPhotos();return true;}
 return false;
}
function pollOcr(photo,automatic,started=Date.now()){
 clearTimeout(photo.ocrPoll);photo.ocrPoll=setTimeout(async()=>{
  if(!state.photos.includes(photo)||$('#editor-panel').hidden)return;
  if(Date.now()-started>65000){photo.ocrMessage='辨識結果尚未完成，可繼續手動填寫，或稍後再次讀取。';drawPhotos();return;}
  if(state.busy||state.pending){pollOcr(photo,automatic,started);return;}
  try{const response=await api('receipt_ocr_result',{id:state.row?.id||state.draftId,receiptId:photo.id});if(!state.photos.includes(photo)||$('#editor-panel').hidden)return;if(state.busy||state.pending){pollOcr(photo,automatic,started);return;}if(handleOcrResult(photo,response,automatic))return;}
  catch{if(!state.photos.includes(photo)||$('#editor-panel').hidden)return;}
  pollOcr(photo,automatic,started);
 },2000);
}
async function recognizePhoto(photo,automatic){
 clearTimeout(photo.ocrPoll);$('#receipt-feedback').textContent='正在啟動發票辨識…';
 try{if(!photo.qrChecked){photo.qrChecked=true;photo.qr=await scanInvoiceQr(photo.file);if(!state.photos.includes(photo)||$('#editor-panel').hidden)return;if(photo.qr){photo.ocr=photo.qr;showOcr(photo,automatic&&$('#auto-receipt-ocr').checked);}}if(photo.qr?.itemsComplete){showOcr(photo,automatic&&$('#auto-receipt-ocr').checked);drawPhotos();return;}const response=await api(photo.cloudReady?'receipt_ocr_result':'recognize_receipt',{id:state.row?.id||state.draftId,receiptId:photo.id});
 if(!handleOcrResult(photo,response,automatic)){photo.ocrMessage='正在背景辨識，可繼續填寫其他欄位，請核對辨識結果後再儲存。';$('#receipt-feedback').textContent=photo.ocrMessage;status(photo.ocrMessage);pollOcr(photo,automatic);}
 }catch(error){photo.ocrMessage=error.message;$('#receipt-feedback').textContent=error.message;status('照片已上傳；'+error.message,'error');}
 drawPhotos();
}

for(const id of ['receipt-camera','receipt-album'])$('#'+id).onchange=event=>{const files=[...event.target.files];event.target.value='';void work(async()=>{for(const file of files){if(state.photos.length>=10)throw Error('每筆最多 10 張照片。');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8388608)throw Error('請選擇 8 MB 以下的 JPEG、PNG 或 WebP 照片。');const photo={id:crypto.randomUUID(),name:file.name,file,localUrl:URL.createObjectURL(file),ready:false};state.photos.push(photo);drawPhotos();markDirty();await uploadPhoto(photo);}});};

for(const category of expenseCategories)form.elements.category.add(new Option(category,category));for(const [value,label]of Object.entries(expenseStatuses))$('#status-filter').add(new Option(label,value));
$('#from-date').value=today().slice(0,8)+'01';$('#to-date').value=today();
$('#filter-form').onsubmit=e=>{e.preventDefault();void work(load);};$('#status-filter').onchange=drawList;
$('#new-expense').onclick=()=>{if(canLeave())render(null);};$('#expense-back').onclick=()=>{if(canLeave())void work(async()=>{await load();clean();panel('list');});};
for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{if(canLeave())void work(async()=>{clean();if(button.dataset.panel==='roles')await roles();else await load();panel(button.dataset.panel);});};
form.oninput=markDirty;form.onchange=markDirty;form.onsubmit=e=>{e.preventDefault();void work(async()=>{if(state.photos.some(p=>!p.ready))throw Error('請先完成憑證照片上傳或移除未完成的照片。');const data=validateExpense({...Object.fromEntries(new FormData(form)),receiptIds:state.photos.filter(p=>p.ready).map(p=>p.id)});const reason=$('#correction-reason').value.trim();if(state.row?.status==='returned'&&!reason)throw Error('請填寫退回後修正說明。');await mutate('save',{data,reason});});};
$('#action-form').onsubmit=e=>{e.preventDefault();void work(async()=>{const extras=state.action==='pay'?{paidDate:$('#paid-date').value,paymentRef:$('#payment-ref').value.trim()}:{reason:$('#action-reason').value.trim()};if(state.action==='pay'&&(!extras.paidDate||!extras.paymentRef))throw Error(errors.payment_details_required);if(state.action!=='pay'&&!extras.reason)throw Error(errors.reason_required);await mutate(state.action,extras);});};$('#cancel-action').onclick=()=>{$('#action-form').hidden=true;};
$('#retry-mutation').onclick=()=>void work(()=>mutate(state.pending?.action));$('#recover-expense').onclick=()=>void work(async()=>{if(!state.pending)return;const id=state.pending.values.id;const result=await api('get',{id});state.pending=null;showRetry();render(result.expense,result.events,result.receipts||[]);status('已重新讀取紀錄，請核對儲存結果。');});$('#reload-expense-roles').onclick=()=>void work(roles);
window.addEventListener('beforeunload',e=>{if(state.dirty||state.pending){e.preventDefault();e.returnValue='';}});
mountMplusFunctionNavigation({church:'M+',center:'admin'});
await work(async()=>{const checked=await db.auth.getUser();if(checked.error||!checked.data?.user){$('#expense-login').href='admin-login.html?church=M%2B&next='+encodeURIComponent(location.pathname+location.search);$('#expense-login').hidden=false;throw Error('請先登入教會 OS。');}const profile=await api('profile');state.roles=profile.roles;state.owner=profile.owner;state.actor=profile.actorUserId;if(!state.owner&&!state.roles.length)throw Error('此帳號尚未獲授權支出記帳。請由系統負責人設定支出人員權限。');$('#expense-app').hidden=false;$('#expense-roles').hidden=!state.owner;$('#new-expense').hidden=!state.roles.includes('entry');await load();status(state.roles.length?'已載入支出記帳。':'可在支出人員權限指定提報、核對與審核同工。');});
