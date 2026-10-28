export function receiptCsv(rows){
 const safe=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const header=['收據編號','類別','日期','專案／事工','捐贈人／付款人','收據抬頭','原收據金額','狀態','有效金額','原始紀錄','物品明細'];
 const records=rows.filter(r=>r.amount!==null&&r.amount!==undefined).map(r=>[r.receipt_number,r.category,r.record_date,r.project,r.payer,r.title,r.amount,r.status==='issued'?'已開立':'已作廢',r.status==='issued'?r.amount:0,r.source_ref,(r.items||[]).map(i=>`${i.name} ${i.quantity}${i.unit}`).join('；')]);
 return '\ufeff'+[header,...records].map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
}
