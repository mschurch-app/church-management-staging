import * as XLSX from 'npm:xlsx@0.18.5';

export const EOFFERRING_HEADERS=[
  '訂單編號','*付款方式','捐款時間','結帳時間','*項目編號','項目語系','*金額','*數量','運費',
  '*是否需要收據','同意捐款紀錄上傳國稅局(公司行號等法人不適用)','收據抬頭',
  '收據(身分證字號/統一編號)','會員編號','芳名錄','捐款者留言','管理者備註','*姓名',
  '*E-mail','郵遞區號','地址','聯絡電話','*手機','指定奉獻','CRM聯絡人tag'
] as const;

export type EofferingPaidRegistration={
  merchantOrderNo:string;
  paymentMethod:'CREDIT'|'VACC';
  paidAt:Date;
  amount:number;
  receiptTitle:string;
  receiptId:string;
  taxUploadConsent:boolean;
  publicCredit:boolean;
  donorName:string;
  email:string;
  postalCode:string;
  address:string;
  mobile:string;
  playerName:string;
  registrationNo:string;
  tradeNo:string;
};

const widths=[18,12,20,20,12,10,12,10,10,16,25,18,24,12,12,28,34,18,30,12,38,16,18,16,24].map(w=>({wch:w}));

function formatTaipeiDate(value:Date):string{
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(value);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function eofferingPaymentCode(method:EofferingPaidRegistration['paymentMethod']):1|3{
  return method==='CREDIT'?1:3;
}

export function buildEofferingXls(records:EofferingPaidRegistration[]):Uint8Array{
  const rows=records.map(record=>[
    '',
    eofferingPaymentCode(record.paymentMethod),
    formatTaipeiDate(record.paidAt),
    formatTaipeiDate(record.paidAt),
    172,
    '',
    record.amount,
    1,
    '',
    2,
    record.taxUploadConsent?1:0,
    record.receiptTitle,
    record.receiptId,
    '',
    record.publicCredit?1:0,
    `2027熱火籃球營｜球員：${record.playerName}`,
    `報名編號：${record.registrationNo}｜藍新訂單：${record.merchantOrderNo}｜交易序號：${record.tradeNo}`,
    record.donorName,
    record.email,
    record.postalCode,
    record.address,
    '',
    record.mobile,
    '',
    '2027熱火籃球營'
  ]);
  const sheet=XLSX.utils.aoa_to_sheet([EOFFERRING_HEADERS, ...rows]);
  sheet['!cols']=widths;
  sheet['!rows']=Array.from({length:rows.length+1},()=>({hpt:18}));
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,sheet,'orders');
  return new Uint8Array(XLSX.write(workbook,{bookType:'xls',type:'array'}));
}
