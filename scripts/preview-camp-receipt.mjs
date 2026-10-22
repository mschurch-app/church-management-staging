import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {receiptHtml} from '../heat-camp-receipt.mjs';
const seals={};
for(const role of ['chairperson','accountant','handler','organization']){
 const bytes=await readFile(new URL(`../private-receipt-assets/web/${role}.png`,import.meta.url));
 seals[role]=`data:image/png;base64,${bytes.toString('base64')}`;
}
const draft={receipt_no:'B11611510200001（示意）',amount:7000,issued_at:'2026-10-20T02:00:00Z',paid_at:'2026-10-20T01:00:00Z',receipt_title:'測試家長（版面示意）',payer_name:'測試家長',registration_no:'SAMPLE-2027-0001',trade_no:'SAMPLE-NOT-A-TRANSACTION',payment_method:'LINE_PAY'};
const output=new URL('../output/receipts/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(new URL('receipt-sample.html',output),receiptHtml(draft,{seals,draft:true}));
console.log('Created local receipt sample (no official receipt issued).');
