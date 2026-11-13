import {validateResponse} from './supabase/functions/thanksgiving-offering-response/validation.mjs';
const $=id=>document.getElementById(id),form=$('responseForm'),status=$('formStatus'),button=$('sendBtn');
const endpoint=(window.MPLUS_OFFERING_RESPONSE_ENDPOINT||'').trim();
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let pending=null,busy=false;
form.dataset.actionFeedback='off';
const say=(message,tone)=>{status.className='status show '+tone;status.textContent=message;};
const lock=value=>{for(const n of form.querySelectorAll('input,select,textarea'))n.disabled=value;};
function method(){const bank=$('method').value==='bank_transfer';$('lastFive').required=bank;$('lastFiveRequired').hidden=!bank;$('lastFiveHint').textContent=bank?'請填寫您「自己的匯款帳戶」末五碼，方便核對入帳。':'線上奉獻可留空；如有匯款紀錄也可提供末五碼。';}
$('transferDate').value=today();$('transferDate').max=today();$('transferDate').min='2026-01-01';$('method').addEventListener('change',method);method();
$('copyBank').onclick=async()=>{try{await navigator.clipboard.writeText('0358940009109');$('copyBank').textContent='已複製';}catch{say('請手動複製帳號：0358940009109','warn');}};
const messages={invalid_input:'請確認姓名、同意事項與欄位內容。',invalid_date:'請填寫有效的奉獻日期，不可晚於今天。',invalid_amount:'金額請填寫 1 至 100000000 的整數。',invalid_last5:'請填寫您自己匯款帳號的末五碼，恰好 5 位數字。',contact_required:'請至少留下 Email 或電話。',invalid_email:'請確認 Email 格式。',invalid_phone:'請確認聯絡電話。',try_later:'目前回報較多，請稍後重試同一筆。',unavailable:'奉獻回應暫未開放，請稍後再試。'};
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 if(!pending){try{const payload=validateResponse({donor_name:$('donorName').value,method:$('method').value,donation_date:$('transferDate').value,amount_ntd:Number($('amount').value),remitter_account_last5:$('lastFive').value,contact_email:$('contactEmail').value,contact_phone:$('contactPhone').value,note:$('note').value,consent:$('consent').checked,source:'thanksgiving_2026',website:$('offeringWebsite').value});pending={key:crypto.randomUUID(),payload};}catch(error){say(messages[error.message]||'請確認表單資料。','warn');return;}}
 if(!endpoint){pending=null;say('這是設計預覽，資料沒有儲存或寄送。正式驗收完成後才會開放收件。','warn');return;}
 busy=true;lock(true);button.disabled=true;button.textContent='正在安全送出…';say('正在確認回報是否已安全接收，請稍候。','warn');
 try{
  const response=await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',headers:{'content-type':'application/json','X-Idempotency-Key':pending.key},body:JSON.stringify(pending.payload),signal:AbortSignal.timeout(25000)});
  const result=await response.json().catch(()=>({}));
  if([400,403,415].includes(response.status)){pending=null;lock(false);throw Error(messages[result.error]||'資料未被接收，請檢查欄位後再送出。');}
  if(response.status===409){throw Error('同一筆回報內容不一致，請聯絡教會核對，勿重複建立。');}
  if(!response.ok||result.status!=='accepted'||result.notifications_queued!==true||!/^TG26-[A-F0-9]{16}$/.test(result.reference_no||''))throw Error('尚未確認送出結果。請按「重試同一筆回報」，不會重複建立。');
  say('已收到奉獻回報，參考編號：'+result.reference_no+'。目前待財務核對，尚未確認實收；私人 LINE 與 Email 通知已排隊，投遞狀態由後台追蹤。','ok');pending=null;form.reset();$('transferDate').value=today();lock(false);method();
 }catch(error){say(error.name==='TimeoutError'?'連線逾時，請重試同一筆回報；已填資料仍保留。':error.message||'連線異常，請重試同一筆回報。','error');}
 finally{busy=false;button.disabled=false;button.textContent=pending?'重試同一筆回報':'送出奉獻回應 →';}
});
window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
if(endpoint)$('demoNotice').hidden=true;
