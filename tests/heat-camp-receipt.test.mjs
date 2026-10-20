import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptHtml,formatCampReceiptNumber} from '../heat-camp-receipt.mjs';
const paid={receipt_no:'HC2027-000001',status:'issued',payment_status:'paid',payment_environment:'production',amount:7000,issued_at:'2026-10-20T02:00:00Z',paid_at:'2026-10-19T12:00:00Z',receipt_title:'測試家長',payer_name:'測試家長',registration_no:'SAMPLE',trade_no:'TEST',payment_method:'LINE_PAY'};
test('unpaid, sandbox and unissued records cannot render official receipts',()=>{
 for(const patch of [{payment_status:'unpaid'},{payment_environment:'test'},{status:'voided'},{receipt_no:''}])assert.throws(()=>receiptHtml({...paid,...patch}),/receipt_not_issued/);
});
test('actual payment and receipt title are rendered safely',()=>{
 const html=receiptHtml({...paid,receipt_title:'<script>alert(1)</script>'});
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert'));
 assert.ok(html.includes('LINE Pay'));assert.ok(html.includes('7,000'));
 assert.ok(html.includes('26887974'));assert.ok(html.includes('付款人'));
});
test('seal URLs only accept authenticated inline PNG data',()=>{
 const html=receiptHtml(paid,{seals:{chairperson:'https://example.com/seal.png'}});
 assert.ok(!html.includes('example.com'));
});
test('drafts are prominently labeled and never receive an official number',()=>{
 const html=receiptHtml({...paid,receipt_no:''},{draft:true});assert.ok(html.includes('非正式收據'));assert.ok(html.includes('不配發正式編號'));
});
test('invalid amounts are rejected',()=>{for(const amount of [0,-1,NaN,1.5])assert.throws(()=>receiptHtml({...paid,amount}),/invalid_amount/);});
test('receipt format uses camp ROC year plus payment ROC date and four-digit daily serial',()=>{
 assert.equal(formatCampReceiptNumber({paidAt:'2026-10-20T00:00:00+08:00',serial:1}),'B11611510200001');
 assert.equal(formatCampReceiptNumber({paidAt:'2026-10-19T16:00:00Z',serial:12}),'B11611510200012');
 assert.equal(formatCampReceiptNumber({paidAt:'2026-10-19T15:59:59Z',serial:9999}),'B11611510199999');
 assert.equal(formatCampReceiptNumber({paidAt:'2027-01-01T00:00:00+08:00',serial:1}),'B11611601010001');
});
test('serial range cannot silently truncate or overflow',()=>{for(const serial of [0,-1,1.5,10000])assert.throws(()=>formatCampReceiptNumber({paidAt:paid.paid_at,serial}),/invalid_serial/);});
