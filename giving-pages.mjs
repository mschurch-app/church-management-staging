// Preview only: deliberately contains no payment endpoint, storage or submission API.
import {createAppIcon} from './app-icons.mjs?v=20261116-memberline1';
import {setStatus} from './app-ui.mjs?v=20261116-admin1';
const $=selector=>document.querySelector(selector);
const form=$('#giving-form');
const association=document.body.dataset.organization==='association';
const org=association?'社團法人台灣基督教社會關懷協會':'M+ 大雅教會';
const noun=association?'捐款':'奉獻';
// Generated public subset of finance/giving-catalog.json.
const purposeCatalog=[{"project":"Ｍ＋大雅教會","name":"十一奉獻","externalItemNo":38,"publicGroup":"church","publicEnabled":true,"alias":null,"frequency":"once","minimum":1,"externalProject":"為M+大雅教會奉獻"},{"project":"Ｍ＋大雅教會","name":"青年教會","externalItemNo":150,"publicGroup":"church","publicEnabled":true,"alias":"青少年事工奉獻","frequency":"once","minimum":1,"externalProject":"為M+大雅教會奉獻"},{"project":"Ｍ＋大雅教會","name":"一般奉獻","externalItemNo":7,"publicGroup":"church","publicEnabled":true,"alias":null,"frequency":"once","minimum":1,"externalProject":"為M+大雅教會奉獻"},{"project":"Ｍ＋大雅教會","name":"感恩奉獻","externalItemNo":9,"publicGroup":"church","publicEnabled":true,"alias":null,"frequency":"once","minimum":1,"externalProject":"為M+大雅教會奉獻"},{"project":"Ｍ＋大雅教會","name":"宣教奉獻","externalItemNo":8,"publicGroup":"church","publicEnabled":true,"alias":null,"frequency":"once","minimum":1,"externalProject":"為M+大雅教會奉獻"},{"project":"Ｍ＋大雅教會","name":"指定奉獻","externalItemNo":6,"publicGroup":"church","publicEnabled":true,"alias":null,"frequency":"once","minimum":1,"externalProject":"為M+大雅教會奉獻"},{"project":"夢想加油站課輔班","name":"2026弱勢兒少公益課輔班-夢想加油站","externalItemNo":166,"publicGroup":"association","publicEnabled":true,"alias":null,"frequency":"once","minimum":100,"externalProject":"弱勢兒少夢想加油站募款"},{"project":"夢想加油站課輔班","name":"2026弱勢兒少公益課輔班-夢想加油站（定期定額）","externalItemNo":167,"publicGroup":"association","publicEnabled":true,"alias":null,"frequency":"monthly","minimum":100,"externalProject":"弱勢兒少夢想加油站募款"},{"project":"夢想加油站課輔班","name":"2027弱勢兒少公益課輔班-夢想加油站","externalItemNo":185,"publicGroup":"association","publicEnabled":true,"alias":"2027弱勢兒少課後輔導班","frequency":"once","minimum":100,"externalProject":"弱勢兒少夢想加油站募款"},{"project":"夢想加油站課輔班","name":"2027弱勢兒少公益課輔班-夢想加油站（定期定額）","externalItemNo":186,"publicGroup":"association","publicEnabled":true,"alias":null,"frequency":"monthly","minimum":100,"externalProject":"弱勢兒少夢想加油站募款"}];
const purposes=purposeCatalog.filter(x=>x.publicGroup===(association?'association':'church'));
const payments={credit:'信用卡',linepay:'LINE Pay',atm:'ATM 虛擬帳號',barcode:'超商條碼'};
const receipts={single:'單筆電子收據',annual:'年度彙整收據',none:'不索取收據'};
const money=value=>'NT$ '+Number(value||0).toLocaleString('zh-TW');
const monthly=()=>form.elements.frequency.value==='monthly';
let currentStep=0,previousPayment='credit',previousReceipt='single',lastFrequency='once',priorFocus=null;
for(const node of document.querySelectorAll('[data-icon]'))node.append(createAppIcon(node.dataset.icon,'giving-shared-icon'));
function updatePurposes(){
 const previous=form.elements.purpose.selectedOptions[0]?.dataset.baseName;
 const choices=purposes.filter(x=>!association||x.frequency===(monthly()?'monthly':'once'));
 form.elements.purpose.replaceChildren();
 for(const item of choices){const option=document.createElement('option');option.value=item.name;option.textContent=item.name;option.dataset.itemNo=String(item.externalItemNo);option.dataset.minimum=String(item.minimum);option.dataset.baseName=item.name.replace('（定期定額）','');form.elements.purpose.append(option);}
 const keep=[...form.elements.purpose.options].find(o=>o.dataset.baseName===previous);if(keep)form.elements.purpose.value=keep.value;
 form.elements.amount.min=association?'100':'1';
}
updatePurposes();
const presetAmounts=association?[300,500,1000,2000]:[500,1000,2000,5000];
for(const value of presetAmounts){const button=document.createElement('button');button.type='button';button.textContent=money(value);button.dataset.amount=String(value);button.setAttribute('aria-pressed',String(value===1000));button.addEventListener('click',()=>{form.elements.amount.value=String(value);updateSummary();});$('#amount-options').append(button);}
function updateSummary(){
 const m=monthly(),amount=form.elements.amount.value;
 for(const button of document.querySelectorAll('[data-amount]'))button.setAttribute('aria-pressed',String(Number(button.dataset.amount)===Number(amount)));
 $('#summary-amount').textContent=money(amount);
 $('#summary-frequency').textContent=m?'每月定期定額':'單次'+noun;
 $('#summary-purpose').textContent=form.elements.purpose.value;
 $('#summary-payment').textContent=payments[form.elements.payment.value];
 $('#summary-recurring').hidden=!m;
 $('#summary-recurring').textContent=`預覽設定：每月 ${form.elements.charge_day.value} 日，共 ${form.elements.periods.value} 期。`;
}
function updateOptions(){
 const m=monthly();
 if(form.elements.frequency.value!==lastFrequency){
  if(m){previousPayment=form.elements.payment.value;previousReceipt=form.elements.receipt.value;form.elements.payment.value='credit';form.elements.receipt.value='annual';}
  else{form.elements.payment.value=previousPayment;form.elements.receipt.value=previousReceipt;}
  lastFrequency=form.elements.frequency.value;
  updatePurposes();
 }
 $('#recurring-settings').hidden=!m;
 for(const radio of form.querySelectorAll('input[name="payment"]'))radio.disabled=m&&radio.value!=='credit';
 $('#amount-legend').textContent=m?'每月支持金額':'選擇金額';
 $('#linepay-note').textContent=m?'定期扣款待專用授權核准':'使用 LINE Pay 付款';
 $('#payment-note').textContent=m?'定期自動扣款預覽採信用卡。LINE Pay 須另申請預先授權；ATM／超商條碼需要自行繳款。':'這裡可以預覽付款選擇，目前不會導向付款或建立繳款帳號。';
 $('#receipt-fields').hidden=form.elements.receipt.value==='none';
 form.elements.receipt_title.disabled=form.elements.receipt.value==='none';
 form.elements.email.required=form.elements.receipt.value!=='none';
 $('#email-required').textContent=form.elements.email.required?'必填':'選填';
 updateSummary();
}
function fail(message,input){setStatus($('#form-status'),message,{tone:'error'});input.focus();return false;}
function validAmount(){const field=form.elements.amount,value=Number(field.value);if(!field.value||!Number.isSafeInteger(value)||value<Number(field.min)||value>9999999)return fail(`請輸入 ${field.min} 至 9,999,999 元之間的整數金額。`,field);return true;}
function validReceipt(){
 const name=form.elements.donor_name,email=form.elements.email;
 if(!name.value.trim())return fail('請填寫姓名，方便核對支持與收據資料。',name);
 if(!email.checkValidity())return fail(email.validity.valueMissing?'請填寫 Email，以便寄送電子收據。':'請確認 Email 格式是否正確。',email);
 return true;
}
function showStep(index){
 setStatus($('#form-status'),'');
 currentStep=index;
 document.querySelectorAll('[data-step]').forEach(node=>node.hidden=Number(node.dataset.step)!==index);
 document.querySelectorAll('.steps li').forEach((node,i)=>{if(i===index)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
 if(index===2)renderReview();
 const heading=form.querySelector(`[data-step="${index}"] h3`);heading.focus({preventScroll:true});form.scrollIntoView({block:'start',behavior:'instant'});priorFocus=heading;
}
function renderReview(){
 const data=[['支持單位',org],['支持用途',form.elements.purpose.value],['既有捐款項目編號',form.elements.purpose.selectedOptions[0].dataset.itemNo],['支持方式',monthly()?'每月定期定額':'單次'+noun],['每'+(monthly()?'月':'筆')+'金額',money(form.elements.amount.value)],['付款方式',payments[form.elements.payment.value]]];
 if(monthly())data.push(['預計扣款日',`每月 ${form.elements.charge_day.value} 日（待正式授權確認）`],['支持期數',form.elements.periods.value+' 期']);
 data.push(['姓名',form.elements.donor_name.value.trim()],['Email',form.elements.email.value.trim()||'未填寫'],['收據方式',receipts[form.elements.receipt.value]]);
 if(form.elements.receipt.value!=='none')data.push(['收據抬頭',form.elements.receipt_title.value.trim()||form.elements.donor_name.value.trim()]);
 data.push(['公開姓名',form.elements.anonymous.checked?'不公開':'依正式徵信告知與同意辦理']);
 const dl=$('#review-details');dl.replaceChildren();
 for(const [label,value] of data){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.append(row);}
}
form.addEventListener('submit',event=>event.preventDefault());
form.addEventListener('change',updateOptions);
form.elements.amount.addEventListener('input',updateSummary);
$('#to-receipt').addEventListener('click',()=>{if(validAmount())showStep(1);});
$('#to-review').addEventListener('click',()=>{if(validAmount()&&validReceipt())showStep(2);});
for(const button of form.querySelectorAll('[data-back]'))button.addEventListener('click',()=>showStep(Number(button.dataset.back)));
// Privacy: no local/session storage, cookies, analytics or backend calls on this page.
window.addEventListener('pageshow',event=>{if(event.persisted&&priorFocus&&currentStep===2)renderReview();});
updateOptions();
