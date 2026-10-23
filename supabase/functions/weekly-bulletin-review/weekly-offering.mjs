export const ACCOUNTING_SECTION_KEY='offering_accounting';
export function previousSunday(serviceDate){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate||''))throw Error('invalid_service_date');
 const date=new Date(serviceDate+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==serviceDate)throw Error('invalid_service_date');
 date.setUTCDate(date.getUTCDate()-(date.getUTCDay()||7));return date.toISOString().slice(0,10);
}
export function ensureAccountingSection(sections,church='M+'){
 if(church!=='M+')return sections;
 const existing=sections.find(s=>s.key===ACCOUNTING_SECTION_KEY),list=sections.filter(s=>s.key!==ACCOUNTING_SECTION_KEY);
 const manual=list.findIndex(s=>s.key==='offering');
 list.splice(manual<0?Math.min(5,list.length):manual+1,0,existing||{key:ACCOUNTING_SECTION_KEY,title:'上週主日奉獻（會計系統）',description:'依已核准入帳的上週主日奉獻資料彙整。',enabled:false,items:[],source_status:'idle',source_date:''});
 return list;
}
const money=n=>Number(n).toLocaleString('zh-TW');
const shortNames={'十一奉獻':'十一','感恩奉獻':'感恩','兒童主日學奉獻':'兒主','一般／不具名奉獻':'不具名'};
export function accountingItems(preview){
 if(preview?.status!=='ready')return [];
 const totals=preview.categoryTotals,core=['十一奉獻','感恩奉獻','兒童主日學奉獻'];
 const categories=[...core,...Object.keys(totals).filter(k=>!core.includes(k)&&totals[k]>0)];
 const items=[{label:'本期徵信日期',body:preview.offeringDate},{label:'本週奉獻統計',body:categories.map(k=>(shortNames[k]||k)+'：'+money(totals[k]||0)).join('｜')},{label:'本週奉獻合計',body:money(preview.grandTotal)},{label:'本月累計',body:preview.monthTotal==null?'待會計確認':money(preview.monthTotal)}];
 if(preview.paymentTotals)items.push({label:'收款方式',body:'現金：'+money(preview.paymentTotals.cash)+'｜轉帳：'+money(preview.paymentTotals.transfer)+'｜線上：'+money(preview.paymentTotals.online)});
 let chunk=[];const append=line=>{if(line.length>9000)throw Error('offering_too_large');if([...chunk,line].join('\n').length>9000){items.push({label:'奉獻明細',body:chunk.join('\n')});chunk=[];}chunk.push(line);};
 for(const category of categories){
  if(category==='兒童主日學奉獻'){append('兒主：'+money(totals[category]||0));continue;}
  const details=preview.rows.filter(r=>r.categoryAmounts[category]>0).map(row=>{const label=/^\d{4}$/.test(row.label)?String(Number(row.label)):row.label==='匿名'?'主知名':row.label;const purpose=category==='指定奉獻'&&row.designated?.length?'・'+row.designated.map(x=>x.purpose).join('、'):'';return label+'（'+money(row.categoryAmounts[category])+purpose+'）';});
  append((shortNames[category]||category)+'：'+(details.join('，')||(totals[category]>0?'不公開個別明細':'0')));
 }
 if(chunk.length)items.push({label:'奉獻明細',body:chunk.join('\n')});
 if(items.length>28)throw Error('offering_too_large');return items;
}
export function accountingSnapshotMatches(section,preview){return preview?.status==='ready'&&section?.source_date===preview.offeringDate&&section.source_status==='ready'&&JSON.stringify(section.items)===JSON.stringify(accountingItems(preview));}
