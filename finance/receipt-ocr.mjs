export function receiptOcrSuggestions(result){
 const invoiceNumber=typeof result?.invoiceNumber==='string'&&/^[A-Z]{2}\d{8}$/.test(result.invoiceNumber)?result.invoiceNumber:'';
 const amount=typeof result?.amountTwd==='number'&&Number.isSafeInteger(result.amountTwd)&&result.amountTwd>0?String(result.amountTwd):'';
 const all=(Array.isArray(result?.items)?result.items:[]).map(i=>[String(i?.name||'').trim(),String(i?.quantity||'').trim()].filter(Boolean).join(' × ')).filter(Boolean).join('、');
 return {voucherRef:invoiceNumber,amount,purpose:all.length>500?all.slice(0,499)+'…':all};
}
