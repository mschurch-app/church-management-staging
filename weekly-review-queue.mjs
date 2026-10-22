const labels={pending_initial:'待初審 等待鈺庭初審',pending_review:'待審 等待牧師師母審核',changes_requested:'已退回',approved:'預告已核准',published:'週報已發布'};
const pending=row=>['pending_initial','pending_review'].includes(row.status);
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('zh-TW').trim().replace(/\s+/g,' ');
export function reviewQueue(items,{query='',status='',track=''}={}){
 const terms=normalize(query).split(' ').filter(Boolean);
 const ordered=[...items].sort((a,b)=>Number(pending(b))-Number(pending(a))||(pending(a)?String(a.service_date).localeCompare(String(b.service_date)):String(b.service_date).localeCompare(String(a.service_date)))||String(a.track).localeCompare(String(b.track))||String(a.id).localeCompare(String(b.id)));
 const visible=ordered.filter(row=>{
  if(status&&row.status!==status||track&&row.track!==track)return false;
  const text=normalize([row.service_date,row.title,row.sermon_topic,row.sermon_scripture,row.sermon_speaker,row.track==='promo'?'主日社群預告':'主日週報上稿',labels[row.status]||row.status].join(' '));
  return terms.every(term=>text.includes(term));
 });
 return{ordered,visible,loaded:items.length,pending:items.filter(pending).length};
}
