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
const money=n=>'NT$'+Number(n).toLocaleString('zh-TW');
export function accountingItems(preview){
 if(preview?.status!=='ready')return [];
 const items=[{label:'奉獻日期',body:preview.offeringDate},{label:'上週主日奉獻合計',body:money(preview.grandTotal)},{label:'各類奉獻合計',body:Object.entries(preview.categoryTotals).filter(([,n])=>n>0).map(([k,n])=>k+'：'+money(n)).join('\n')}];
 let chunk=[];
 for(const row of preview.rows){
  const line=row.label+'｜'+Object.entries(row.categoryAmounts).map(([k,n])=>k+' '+money(n)).join('、')+(row.designated?.length?'（'+row.designated.map(x=>x.purpose+' '+money(x.amount)).join('、')+'）':'')+'｜合計 '+money(row.total);
  if(line.length>9000)throw Error('offering_too_large');
  if([...chunk,line].join('\n').length>9000){items.push({label:'奉獻明細',body:chunk.join('\n')});chunk=[];}chunk.push(line);
 }
 if(chunk.length)items.push({label:'奉獻明細',body:chunk.join('\n')});
 if(items.length>28)throw Error('offering_too_large');return items;
}
export function accountingSnapshotMatches(section,preview){return preview?.status==='ready'&&section?.source_date===preview.offeringDate&&section.source_status==='ready'&&JSON.stringify(section.items)===JSON.stringify(accountingItems(preview));}
