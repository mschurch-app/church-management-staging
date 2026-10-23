import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInvoiceQr,mergeInvoiceRecognition} from '../finance/receipt-qr.mjs';
const head='AB112233441020523999900000144000001540000000001234567ydXZt4LAN1UHN/j1juVcRA==';
test('official invoice header reads total, not sales or tax ID',()=>{const r=parseInvoiceQr([head+':**********:1:1:1:乾電池:1:340']);assert.equal(r.invoiceNumber,'AB11223344');assert.equal(r.amountTwd,340);assert.equal(r.itemsComplete,true);assert.equal(r.items[0].name,'乾電池');});
test('partial and unsupported item encodings defer to image recognition',()=>{for(const encoding of ['0','1','2'])assert.equal(parseInvoiceQr([head+':**********:1:3:'+encoding+':乾電池:1:340']).itemsComplete,false);});
test('multiple invoices never combine; malformed QR is ignored',()=>{assert.equal(parseInvoiceQr(['https://example.com']),null);assert.equal(parseInvoiceQr([head+':',head.replace('AB11223344','CD11223344')+':']),null);});
test('QR amount is preserved and different invoice items are rejected',()=>{const qr=parseInvoiceQr([head+':**********:0:3:1:']);const r=mergeInvoiceRecognition(qr,{invoiceNumber:qr.invoiceNumber,amountTwd:999,items:[{name:'紙'}]});assert.equal(r.amountTwd,340);assert.equal(r.items[0].name,'紙');assert.equal(mergeInvoiceRecognition(qr,{invoiceNumber:'CD12345678',items:[{name:'錯誤'}]}).items.length,0);});
test('foreign currency totals are not entered as TWD',()=>assert.equal(parseInvoiceQr([head+':**********:0:0:3:']).amountTwd,null));
