// Taiwan e-invoice QR header; structural reading does not authenticate an invoice.
export function parseInvoiceQr(codes){
 const headers=codes.filter(x=>/^[A-Z]{2}\d{15}[\d ]{4}[\da-fA-F]{16}\d{16}[A-Za-z\d+/=]{24}:/.test(x));
 const distinct=[...new Set(headers.map(x=>x.slice(0,10)))];
 if(distinct.length!==1)return null;
 const raw=headers[0],parts=raw.slice(78).split(':'),encoding=parts[3];
 const total=parseInt(raw.slice(29,37),16);
 const result={source:'qr',invoiceNumber:raw.slice(0,10),amountTwd:encoding==='3'?null:total>0?total:null,items:[],warnings:['QR Code 資料仍請與原始憑證核對。'],needsReview:true,itemsComplete:false};
 const count=Number(parts[2]);
 if(encoding==='1'&&Number.isInteger(count)&&count>0&&count<=40){
  const values=parts.slice(4);for(let i=0;i+2<values.length;i+=3){if(!values[i]||!/^\d+(\.\d+)?$/.test(values[i+1])||!/^\d+(\.\d+)?$/.test(values[i+2]))break;result.items.push({name:values[i].slice(0,100),quantity:values[i+1].slice(0,20)});}
  result.itemsComplete=result.items.length===count;
 }
 if(encoding==='3')result.warnings.push('境外發票金額請人工確認幣別。');
 return result;
}
export function mergeInvoiceRecognition(qr,ai){
 if(!qr)return ai;
 if((ai.warnings||[]).some(x=>x.includes('多張'))||(ai.invoiceNumber&&ai.invoiceNumber!==qr.invoiceNumber))return {...qr,warnings:[...qr.warnings,'影像辨識與 QR Code 號碼不同，請人工核對品項。']};
 return {...ai,...qr,items:qr.itemsComplete?qr.items:(ai.items?.length?ai.items:qr.items),warnings:[...qr.warnings,...(ai.warnings||[])]};
}
export async function scanInvoiceQr(file){
 if(!file||typeof Worker==='undefined')return null;
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  const codes=await new Promise(resolve=>{const worker=new Worker(new URL('./receipt-qr-worker.js',import.meta.url));const finish=value=>{clearTimeout(timer);worker.terminate();resolve(value);};const timer=setTimeout(()=>finish([]),4000);worker.onmessage=e=>finish(e.data);worker.onerror=()=>finish([]);worker.postMessage({pixels:pixels.data.buffer,width:canvas.width,height:canvas.height},[pixels.data.buffer]);});return parseInvoiceQr(codes);
 }catch{return null;}finally{bitmap?.close();}
}
