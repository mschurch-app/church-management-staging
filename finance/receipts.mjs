export const INCOME_METHODS=Object.freeze({cash:'現金',bank_transfer:'轉帳',newebpay_credit:'信用卡（藍新）',newebpay_barcode:'超商條碼（藍新）',newebpay_vacc:'虛擬ＡＴＭ（藍新）',line_pay:'ＬＩＮＥ ＰＡＹ（ＬＩＮＥ）'});
export const incomeMethodLabel=code=>INCOME_METHODS[code]||'未登錄';
export function receiptCsv(rows){
 const safe=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const header=['收據編號','類別','日期','專案／事工','捐贈人／付款人','收據抬頭','原收據金額','狀態','有效金額','原始紀錄','物品明細','專案名稱','事工項目','收入科目','科目代碼','既有捐款項目編號','收入方式'];
 const records=rows.filter(r=>r.amount!==null&&r.amount!==undefined).map(r=>[r.receipt_number,r.category,r.record_date,r.project,r.payer,r.title,r.amount,r.status==='issued'?'已開立':'已作廢',r.status==='issued'?r.amount:0,r.source_ref,(r.items||[]).map(i=>`${i.name} ${i.quantity}${i.unit}`).join('；'),r.project_name||r.project||'',r.ministry_name||'',r.income_account||'',r.income_code||'',r.online_item_no||'',r.category==='物品'?'不適用':incomeMethodLabel(r.income_method)]);
 return '\ufeff'+[header,...records].map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
}
export async function receiptPayload(response){
 if(response.data)return response.data;
 try{return await response.error?.context?.json()||null;}catch{return null;}
}
