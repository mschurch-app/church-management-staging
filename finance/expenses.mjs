export const expenseCategories=['人事','租金','行政','雜支','油資','電信','修繕','膳食','其他'];
export const expenseRoles={entry:'支出提報',accounting:'會計核對',spouse:'師母審閱',approve:'牧師核准',payment:'付款登錄'};
export const expenseStatuses={draft:'草稿',returned:'退回修正',accounting_review:'待會計核對',spouse_review:'待師母審閱',pastor_review:'待牧師核准',approved:'核准待付款',paid:'已付款',voided:'已沖銷'};
export function validateExpense(data){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(data.expenseDate||''))throw Error('請填寫支出日期。');
 if(!expenseCategories.includes(data.category))throw Error('請選擇費用分類。');
 for(const [key,label,max]of [['project','專案／事工',120],['payee','受款人／廠商',120],['purpose','用途摘要',500]])if(!data[key]?.trim()||data[key].trim().length>max)throw Error(`請填寫${label}，最多 ${max} 字。`);
 if(!/^[1-9]\d*$/.test(String(data.amount))||!Number.isSafeInteger(Number(data.amount)))throw Error('金額須為正整數新台幣。');
 if(!['advance','reimbursement'].includes(data.kind)||!['petty_cash','bank'].includes(data.paymentSource))throw Error('請選擇支出性質與付款帳戶。');
 if(!data.voucherRef?.trim()&&!data.noVoucherReason?.trim()&&!data.receiptIds?.length)throw Error('請填寫憑證編號／紙本參照，或無憑證原因。');
 return {...data,amount:Number(data.amount)};
}
export function expenseActions(row,roles,actor){
 const has=r=>roles.includes(r),own=row.created_by===actor;
 if(['draft','returned'].includes(row.status))return has('entry')&&own?[['submit','送會計核對']]:[];
 const stage={accounting_review:['accounting','verify','憑證核對通過'],spouse_review:['spouse','review','審閱通過，送牧師'],pastor_review:['approve','approve','核准支出']}[row.status];
 if(stage&&has(stage[0]))return [[stage[1],stage[2]],['return','退回修正']];
 if(row.status==='approved')return [...(has('payment')?[['pay','登錄已付款']]:[]),...(has('approve')?[['void','沖銷核准紀錄']]:[])];
 return [];
}
export function expenseTotals(rows){return rows.reduce((sum,row)=>{if(row.status==='paid')sum.paid+=BigInt(row.amount);if(row.status==='approved')sum.pending+=BigInt(row.amount);return sum;},{paid:0n,pending:0n});}
