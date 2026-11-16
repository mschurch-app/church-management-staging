// Queue projections contain no private leave reasons, contact data or bank details.
export const lanes={mine:'待我處理',submitted:'我送出的',completion:'已核准待完成',attention:'異常與逾期'};
const day=86400000;
export function taipeiDate(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function waitingSince(value,now=Date.now()){const n=Date.parse(value);if(!Number.isFinite(n))return '等待時間未提供';const hours=Math.max(0,Math.floor((now-n)/3600000));return hours<24?`已等待 ${hours} 小時`:`已等待 ${Math.floor(hours/24)} 天`;}
export function projectQueue(source,rows,context={},now=Date.now()){
 const result=[],today=taipeiDate(now),add=(r,title,stage,responsible,href,options={})=>result.push({id:source+':'+r.id,source,title,stage,responsible,href,updated:r.updated_at||r.created_at||null,lanes:[],...options});
 if(source==='leave')for(const r of rows){
  const own=!!context.staffId&&r.staff_id===context.staffId,deputy=!!context.staffId&&r.deputy_staff_id===context.staffId;
  if(!['pending_substitute','pending','approved','substitute_declined'].includes(r.status))continue;
  if(r.status==='approved'&&r.calendar_sync_status==='synced')continue;
  if(r.status==='approved'&&r.calendar_sync_status==='not_applicable')continue;
  const stage=r.status==='pending_substitute'?'等候代理人確認':r.status==='pending'?'等候主管核准':r.status==='substitute_declined'?'代理人無法代理':'行事曆尚未同步';
  const attention=r.status==='substitute_declined'||r.status==='approved'||r.end_date<today||Date.parse(r.created_at)<now-3*day;
  add(r,`${r.staff_name||'同工'} · ${r.start_date} 至 ${r.end_date}`,stage,r.status==='pending_substitute'?(r.deputy_name||'職務代理人'):r.status==='substitute_declined'?'申請人':r.status==='approved'?'行政主管':'主管',`pastoral/mplus-coworker-tools.html?church=M%2B&tab=attendance&record=${r.id}#leave-${r.id}`,{lanes:[...(own?['submitted']:[]),...((deputy&&r.status==='pending_substitute')||(context.manage&&['pending','approved'].includes(r.status))||(own&&r.status==='substitute_declined')?['mine']:[]),...(r.status==='approved'?['completion']:[]),...(attention?['attention']:[])]});
 }
 if(source==='expense')for(const r of rows){
  if(['paid','voided'].includes(r.status))continue;
  const owner=!!context.actor&&r.created_by===context.actor,role={accounting_review:'accounting',spouse_review:'spouse',pastor_review:'approve',approved:'payment'}[r.status];
  const stage={draft:'草稿待送出',returned:'退回待修正',accounting_review:'會計核對',spouse_review:'師母審閱',pastor_review:'牧師核准',approved:'核准後待實際付款'}[r.status]||r.status;
  const assigned={accounting_review:'會計同工',spouse_review:'師母',pastor_review:'牧師',approved:'付款同工'}[r.status]||'提報同工';
  add(r,`支出 · ${r.expense_date} · ${r.category}`,stage,assigned,`finance-expenses.html?church=M%2B&record=${r.id}`,{lanes:[...(owner?['submitted']:[]),...((owner&&['draft','returned'].includes(r.status))||(role&&context.roles?.includes(role))?['mine']:[]),...(r.status==='approved'?['completion']:[]),...(r.status==='returned'||(r.status!=='draft'&&Date.parse(r.updated_at||r.created_at)<now-7*day)?['attention']:[])]});
 }
 if(source==='receipt')for(const r of rows)if(r.state==='draft')add(r,`收據草稿 · ${r.recipient_name||'尚未填抬頭'}`, '核對後正式開立','收據同工',`finance-receipts.html?church=M%2B&kind=${r.kind||context.kind||'money'}&record=${r.id}`,{lanes:[...(context.canEdit||context.canIssue?['mine']:[]),...(context.actor&&r.created_by===context.actor?['submitted']:[])]});
 if(source==='booking')for(const r of rows)if(r.status==='待審核')add(r,`場地預約 · ${r.booking_date} ${r.start_time?.slice(0,5)||''}`,r.status,'場地管理同工',`spaces.html?church=M%2B&record=${r.id}#booking-${r.id}`,{lanes:['mine',...(r.booking_date<today?['attention']:[])]});
 if(source==='loan')for(const r of rows)if(['borrowed','partial','overdue'].includes(r.status))add(r,`物品借還 · ${r.item_name||'查看原清冊'}`,'尚未全部歸還','物品管理同工',`inventory.html?church=M%2B&inventory_scope=${encodeURIComponent(r.scope||'M+')}&item=${r.item_id}`,{lanes:['mine',...(r.due_on&&r.due_on<today?['attention']:[])],updated:r.loaned_on||null});
 return result;
}
