import {campReceiptLayout} from './heat-camp-receipt-layout.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const methods={CREDIT:'信用卡',VACC:'ATM 虛擬帳號',BARCODE:'超商條碼',LINE_PAY:'LINE Pay',line_pay:'LINE Pay'};
export const receiptOrganization={name:'社團法人台灣基督教社會關懷協會',taxId:'26887974',chairperson:'王乃純',accountant:'謝碧鳳',handler:'曾恩茹'};
// Formatting only. The database must allocate the daily serial transactionally.
export function formatCampReceiptNumber({campYear=2027,paidAt,serial}){
  if(!Number.isInteger(campYear)||campYear<1912||campYear>2910)throw new Error('invalid_camp_year');
  if(!Number.isInteger(serial)||serial<1||serial>9999)throw new Error('invalid_serial');
  const paid=new Date(paidAt);
  if(!Number.isFinite(paid.getTime()))throw new Error('invalid_paid_at');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(paid);
  const value=type=>parts.find(p=>p.type===type).value;
  const rocYear=Number(value('year'))-1911;
  if(rocYear<1||rocYear>999)throw new Error('invalid_payment_year');
  return `B${String(campYear-1911).padStart(3,'0')}${String(rocYear).padStart(3,'0')}${value('month')}${value('day')}${String(serial).padStart(4,'0')}`;
}
export function receiptHtml(receipt,{seals={},draft=false}={}){
  if(!draft&&(!receipt.receipt_no||receipt.status!=='issued'||receipt.payment_status!=='paid'||receipt.payment_environment!=='production'))throw new Error('receipt_not_issued');
  const amount=Number(receipt.amount);
  if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('invalid_amount');
  const seal=key=>/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(seals[key]||'')?`<img alt="${escape(key==='organization'?'協會章':receiptOrganization[key])}" src="${seals[key]}">`:'<span class="missing">印章待確認</span>';
  const day=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('invalid_date');return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
  return campReceiptLayout(receipt,{escape,day,seal,draft,amount,method:methods[receipt.payment_method]||receipt.payment_method,organization:receiptOrganization});
}
