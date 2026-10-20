// Deterministic interactive operations; no cron, agent or model calls.
export const CAMPAIGN='mplus-routines-20261022', ONBOARD_FROM='2026-10-22';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DAY=['SU','MO','TU','WE','TH','FR','SA'];
const manager=s=>['pastor','admin'].includes(s.role);
const iso=x=>new Date(x).toISOString();
export function localDate(x=Date.now()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));}
export function routineDefinition(b,now=Date.now()){
 if(typeof b.summary!=='string'||!b.summary.trim()||b.summary.trim().length>200||typeof b.start!=='string'||typeof b.end!=='string'||!UUID.test(b.requestId||''))return null;
 const start=Date.parse(b.start),end=Date.parse(b.end),minutes=(end-start)/60000;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(b.start)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(b.end)||!Number.isFinite(start)||!Number.isFinite(end)||start<=now||![30,60,90,120].includes(minutes)||localDate(start)!==localDate(end))return null;
 if(b.location!==undefined&&(typeof b.location!=='string'||b.location.length>500))return null;
 if(!['daily','weekly','monthly'].includes(b.frequency))return null;
 let rule='RRULE:FREQ='+b.frequency.toUpperCase();const weekday=new Date(localDate(start)+'T12:00:00Z').getUTCDay();
 if(b.frequency==='weekly'){
  if(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.length>7||b.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||!b.weekdays.includes(weekday))return null;
  rule+=';BYDAY='+[...new Set(b.weekdays)].sort().map(d=>DAY[d]).join(',');
 }
 if(b.frequency==='monthly')rule+=';BYMONTHDAY='+Number(localDate(start).slice(-2));
 if(b.until){if(typeof b.until!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.until)||!Number.isFinite(Date.parse(b.until+'T12:00:00+08:00'))||localDate(Date.parse(b.until+'T12:00:00+08:00'))!==b.until||b.until<localDate(start))return null;rule+=';UNTIL='+iso(Date.parse(b.until+'T23:59:59+08:00')).replace(/[-:]/g,'').replace('.000','');}
 return {summary:b.summary.trim(),location:(b.location||'').trim(),start:iso(start),end:iso(end),rule,frequency:b.frequency,weekdays:b.frequency==='weekly'?[...new Set(b.weekdays)].sort():[],until:b.until||null};
}
export function eventPermissions(staff,item){
 const p=item.extendedProperties?.private||{},participants=String(p.pastoralParticipantIds||'').split(',');
 const privateEvent=['private','confidential'].includes(item.visibility);
 return {canReport:!privateEvent&&(manager(staff)||p.mplusCreator===staff.id||participants.includes(staff.id)),canCancel:!privateEvent&&(manager(staff)||p.mplusCreator===staff.id||p.mplusPrimary===staff.id)};
}
export function stoppedRecurrence(event,now=Date.now()){
 if(Date.parse(event.start?.dateTime||event.start?.date)>=now)return {status:'cancelled'};
 const until=iso(now-1000).replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 return {recurrence:(event.recurrence||[]).filter(r=>!r.startsWith('RRULE:')).concat((event.recurrence||[]).filter(r=>r.startsWith('RRULE:')).map(r=>r.replace(/;(?:COUNT|UNTIL)=[^;]+/g,'')+';UNTIL='+until))};
}
function fail(error,status=400){return {status,data:{ok:false,error}};}
const ok=data=>({status:200,data:{ok:true,...data}});
const checked=async query=>{const r=await query;if(r.error)throw Error('db');return r.data;};
async function handle(c){
 const {body:b,staff:s,db}=c;const action=b.action;
 if(!['routine-status','save-routine','finish-routine-setup','stop-routine','report-event','assign-work','report-work'].includes(action))return null;
 const now=c.now?.()??Date.now(),google=async(id,method='GET',data,etag)=>{
  const token=await c.accessToken(db);if(!token)throw Error('calendar_not_connected');
  const r=await (c.fetch||fetch)('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(c.calendarId)+'/events'+(id?'/'+encodeURIComponent(id):'')+'?sendUpdates=none',{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...(etag?{'if-match':etag}:{})},...(data?{body:JSON.stringify(data)}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
  if(r.status===409&&method==='POST')return await google(data.id);
  if(!r.ok)throw Error(r.status===412?'event_changed':'calendar_unavailable');return await r.json();
 };
 const notify=async(ids,key,title,message)=>{const raw=b.requestId||b.eventId||b.routineId||b.taskId;const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key+':'+raw)))).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);const related=digest.slice(0,8)+'-'+digest.slice(8,12)+'-'+digest.slice(12,16)+'-'+digest.slice(16,20)+'-'+digest.slice(20);const results=await Promise.all([...new Set(ids)].map(async id=>{try{return c.deliver?await sendWorkNotification({db,deliver:c.deliver,staffId:id,key,related,title,message}):await c.notify(db,{id,display_name:'',line_subject:null},key,related,message);}catch{return 'failed';}}));return {sent:results.filter(x=>x==='sent').length,total:results.length,queued:results.filter(x=>x==='queued').length,status:results.every(x=>x==='sent')?'sent':'partial'};};
 if(action==='routine-status'){
  const all=await checked(db.from('mplus_work_routines').select('id,created_by,primary_staff_id,participant_ids,title,definition,status').order('created_at'));
  const routines=(all||[]).filter(r=>manager(s)||r.created_by===s.id||r.participant_ids.includes(s.id)||r.primary_staff_id===s.id).map(r=>({...r,canStop:manager(s)||r.created_by===s.id||r.primary_staff_id===s.id}));
  const row=await checked(db.from('mplus_work_onboarding').select('finished_at,no_routines').eq('staff_id',s.id).eq('campaign',CAMPAIGN).maybeSingle());
  return ok({routines,canAssign:manager(s),setupRequired:localDate(now)>=ONBOARD_FROM&&!row,setupDone:!!row,selfId:s.id});
 }
 if(action==='finish-routine-setup'){
  const routines=await checked(db.from('mplus_work_routines').select('id').eq('created_by',s.id).eq('status','active').limit(1));
  if(!routines?.length&&b.noRoutines!==true)return fail('routine_setup_required');
  await checked(db.from('mplus_work_onboarding').upsert({staff_id:s.id,campaign:CAMPAIGN,no_routines:!routines?.length,finished_at:iso(now)},{onConflict:'staff_id,campaign'}));return ok({finished:true});
 }
 if(action==='save-routine'){
  const d=routineDefinition(b,-Infinity);if(!d)return fail('invalid_routine');
  const primary=await c.scheduleTarget(db,s,b.staffId);if(!primary||(!manager(s)&&primary!==s.id))return fail('staff_forbidden',403);
  const people=await c.resolveParticipants(db,primary,b.participantIds);if(!people)return fail('invalid_staff');
  const definition={...d,primary,participants:people.map(p=>p.id).sort()};
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(definition))))).map(x=>x.toString(16).padStart(2,'0')).join('');
  let row=await checked(db.from('mplus_work_routines').select('*').eq('id',b.requestId).maybeSingle());
  if(row&&(row.created_by!==s.id||row.fingerprint!==fingerprint))return fail('idempotency_conflict',409);
  if(row?.status==='stopped')return fail('routine_stopped',409);
  // Reuse the existing scheduling rules; check the first occurrence before creation.
  if(!row)for(const p of people){const error=c.scheduleError(Date.parse(d.start),Date.parse(d.end),b.emergency===true,await c.preferences(db,p.id),now);if(error)return fail(error,409);}
  const id=b.requestId.replaceAll('-','').toLowerCase();
  if(!row){const inserted=await db.from('mplus_work_routines').insert({id:b.requestId,created_by:s.id,primary_staff_id:primary,participant_ids:people.map(p=>p.id),title:d.summary,definition,fingerprint,google_event_id:id,status:'pending'});
   if(inserted.error){row=await checked(db.from('mplus_work_routines').select('*').eq('id',b.requestId).maybeSingle());if(!row||row.created_by!==s.id||row.fingerprint!==fingerprint)return fail('idempotency_conflict',409);}}
  const event={id,summary:d.summary,location:d.location,start:{dateTime:d.start,timeZone:'Asia/Taipei'},end:{dateTime:d.end,timeZone:'Asia/Taipei'},recurrence:[d.rule],description:'共同參與同工：'+people.map(p=>p.display_name).join('、'),extendedProperties:{private:{pastoralParticipantIds:people.map(p=>p.id).sort().join(','),mplusRoutine:b.requestId,mplusCreator:s.id,mplusPrimary:primary,mplusFingerprint:fingerprint}}};
  const saved=await google('', 'POST',event);
  if(saved.extendedProperties?.private?.mplusFingerprint!==fingerprint||saved.status==='cancelled')return fail('idempotency_conflict',409);
  await checked(db.from('mplus_work_routines').update({status:'active',updated_at:iso(now)}).eq('id',b.requestId).eq('created_by',s.id).eq('status','pending'));
  const notifications=await notify(people.filter(p=>p.id!==s.id).map(p=>p.id),'routine_created','例行行程已安排',`例行行程：${d.summary}\n首次：${d.start}\n已寫入共用行事曆。`);
  return ok({id:b.requestId,eventId:id,notifications});
 }
 if(action==='stop-routine'){
  if(!UUID.test(b.routineId||'')||typeof b.note!=='string'||!b.note.trim()||b.note.length>3000)return fail('invalid_report');
  const row=await checked(db.from('mplus_work_routines').select('*').eq('id',b.routineId).maybeSingle());
  if(!row||(!manager(s)&&![row.created_by,row.primary_staff_id].includes(s.id)))return fail('report_forbidden',403);
  if(row.status==='stopped'){if(row.definition.stop_note!==b.note.trim())return fail('event_already_reported',409);return ok({stopped:true,notifications:await notify(row.participant_ids.filter(id=>id!==s.id),'routine_stopped','例行已停止',`例行行程「${row.title}」已停止後續安排。\n原因：${b.note.trim()}`)});}
  const event=await google(row.google_event_id);
  if(event.extendedProperties?.private?.mplusRoutine!==row.id)return fail('event_forbidden',403);
  if(event.status!=='cancelled')await google(row.google_event_id,'PATCH',stoppedRecurrence(event,now),event.etag);
  await checked(db.from('mplus_work_routines').update({status:'stopped',definition:{...row.definition,stop_note:b.note.trim(),stopped_by:s.id,stopped_at:iso(now)},updated_at:iso(now)}).eq('id',row.id));
  return ok({stopped:true,notifications:await notify(row.participant_ids.filter(id=>id!==s.id),'routine_stopped','例行已停止',`例行行程「${row.title}」已停止後續安排。\n原因：${b.note.trim()}`)});
 }
 if(action==='report-event'){
  if(typeof b.eventId!=='string'||!/^[a-zA-Z0-9_-]{5,256}$/.test(b.eventId)||!['completed','cancelled'].includes(b.outcome)||typeof b.note!=='string'||!b.note.trim()||b.note.length>3000)return fail('invalid_report');
  const previous=await checked(db.from('mplus_event_reports').select('outcome,note,reported_by,sync_status,context').eq('event_id',b.eventId).maybeSingle());
  if(previous&&(previous.outcome!==b.outcome||previous.note!==b.note.trim()))return fail('event_already_reported',409);
  const event=await google(b.eventId),permissions=eventPermissions(s,event);
  if(event.recurrence?.length)return fail('select_occurrence',400);
  const resuming=previous?.reported_by===s.id;
  if(!(b.outcome==='completed'?permissions.canReport:permissions.canCancel)&&!resuming)return fail('report_forbidden',403);
  const props=event.extendedProperties?.private||{};
  if(!previous){
   if(event.status==='cancelled'||props.mplusOutcome&&props.mplusOutcome!==b.outcome)return fail('event_already_reported',409);
   const intent=await db.from('mplus_event_reports').insert({event_id:b.eventId,reported_by:s.id,outcome:b.outcome,note:b.note.trim(),context:{summary:event.summary,recipients:[...String(props.pastoralParticipantIds||'').split(','),props.mplusCreator].filter(id=>UUID.test(id||''))},sync_status:'pending',reported_at:iso(now)});
   if(intent.error)return fail('event_changed',409);
  }
  if(previous?.sync_status!=='synced'){
   const patch=b.outcome==='cancelled'?{status:'cancelled'}:{summary:event.summary?.startsWith('✓ ')?event.summary:'✓ '+event.summary,extendedProperties:{private:{...props,mplusOutcome:'completed',mplusReportedBy:s.id,mplusReportedAt:iso(now)}}};
   if(event.status!=='cancelled'&&props.mplusOutcome!=='completed')await google(b.eventId,'PATCH',patch,event.etag);
   await checked(db.from('mplus_event_reports').update({sync_status:'synced'}).eq('event_id',b.eventId).eq('outcome',b.outcome));
  }
  return ok({outcome:b.outcome,notifications:await notify((previous?.context?.recipients||[...String(props.pastoralParticipantIds||'').split(','),props.mplusCreator]).filter(id=>UUID.test(id||'')&&id!==s.id),'event_'+b.outcome,'行程回報',`「${previous?.context?.summary||event.summary}」${b.outcome==='completed'?'已完成':'已取消這一次'}。\n回報：${b.note.trim()}`)});
 }
 if(action==='assign-work'){
  if(!manager(s))return fail('pastor_required',403);
  if(!UUID.test(b.requestId||'')||typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>200||typeof b.description!=='string'||!b.description.trim()||b.description.length>5000||typeof b.dueAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(b.dueAt)||!Number.isFinite(Date.parse(b.dueAt))||Date.parse(b.dueAt)<=now)return fail('invalid_task');
  const primary=await c.scheduleTarget(db,s,b.staffId);const people=primary?await c.resolveParticipants(db,primary,b.participantIds):null;if(!people)return fail('invalid_staff');
  const key='mplus-assignment:'+b.requestId;
  const values={entity_key:'mplus',title:b.title.trim(),description:b.description.trim(),task_type:'general',status:'pending',assigned_to:primary,created_by:s.id,idempotency_key:key,due_at:iso(b.dueAt),payload:{workflow:'mplus_assignment',shared_assignee_ids:people.map(p=>p.id).filter(id=>id!==primary)}};
  let row=await checked(db.from('pastoral_tasks').select('id,created_by,title,description,assigned_to,due_at,payload').eq('idempotency_key',key).maybeSingle());
  if(!row){const inserted=await db.from('pastoral_tasks').insert(values).select('id,created_by,title,description,assigned_to,due_at,payload').single();if(inserted.error){row=await checked(db.from('pastoral_tasks').select('id,created_by,title,description,assigned_to,due_at,payload').eq('idempotency_key',key).maybeSingle());if(!row)throw Error('db');}else row=inserted.data;}
  if(row.created_by!==s.id||row.title!==values.title||row.description!==values.description||row.assigned_to!==primary||Date.parse(row.due_at)!==Date.parse(values.due_at)||JSON.stringify(row.payload?.shared_assignee_ids||[])!==JSON.stringify(values.payload.shared_assignee_ids))return fail('idempotency_conflict',409);
  const notifications=await notify(people.filter(p=>p.id!==s.id).map(p=>p.id),'work_assigned','工作安排',`工作安排：${values.title}\n負責：${people[0].display_name}\n完成期限：${new Date(values.due_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}\n請在 M＋首頁行事曆確認並回報。`);
  return ok({taskId:row.id,notifications});
 }
 if(action==='report-work'){
  if(!UUID.test(b.taskId||'')||!['accepted','completed','cancelled','progress'].includes(b.outcome)||typeof b.note!=='string'||!b.note.trim()||b.note.length>3000)return fail('invalid_report');
  const row=await checked(db.from('pastoral_tasks').select('*').eq('id',b.taskId).eq('entity_key','mplus').maybeSingle());
  if(!row||row.payload?.workflow!=='mplus_assignment')return fail('task_not_found',404);
  const assigned=row.assigned_to===s.id,shared=(row.payload?.shared_assignee_ids||[]).includes(s.id),manage=manager(s)||row.created_by===s.id;
  if(b.outcome==='cancelled'?!manage:b.outcome==='accepted'?(!assigned&&!manager(s)):(!assigned&&!shared&&!manager(s)))return fail('report_forbidden',403);
  const expected=b.outcome==='accepted'?'pending':'approved',next={accepted:'approved',completed:'completed',cancelled:'cancelled',progress:row.status}[b.outcome];
  if(row.status===next&&['completed','cancelled','accepted'].includes(b.outcome)){if(b.outcome==='completed'&&row.payload?.completion_report!==b.note.trim()||b.outcome==='cancelled'&&row.payload?.cancel_report!==b.note.trim())return fail('event_already_reported',409);return ok({status:row.status,notifications:await notify([row.created_by,row.assigned_to,...(row.payload?.shared_assignee_ids||[])].filter(id=>id&&id!==s.id),'work_'+b.outcome,'工作進度',`工作「${row.title}」${{accepted:'已接受',completed:'已完成',cancelled:'已取消'}[b.outcome]}。\n回報：${b.note.trim()}`)});}
  if(b.outcome!=='cancelled'&&row.status!==expected||b.outcome==='cancelled'&&!['pending','approved'].includes(row.status))return fail('invalid_transition',409);
  if(b.outcome==='progress'){if(!UUID.test(b.requestId||''))return fail('invalid_report');const saved=await db.from('pastoral_task_reports').insert({id:b.requestId,task_id:row.id,entity_key:'mplus',created_by:s.id,report_text:b.note.trim()});if(saved.error){const existing=await checked(db.from('pastoral_task_reports').select('task_id,created_by,report_text').eq('id',b.requestId).maybeSingle());if(!existing||existing.task_id!==row.id||existing.created_by!==s.id||existing.report_text!==b.note.trim())return fail('idempotency_conflict',409);}return ok({status:row.status});}
  const payload={...row.payload,...(b.outcome==='completed'?{completion_report:b.note.trim(),completed_by_staff_id:s.id}:{}),...(b.outcome==='cancelled'?{cancel_report:b.note.trim(),cancelled_by_staff_id:s.id,cancelled_at:iso(now)}:{})};
  const changed=await checked(db.from('pastoral_tasks').update({status:next,payload,updated_at:iso(now),...(b.outcome==='accepted'?{approved_by:s.id}:{}),...(b.outcome==='completed'?{completed_at:iso(now)}:{})}).eq('id',row.id).eq('status',row.status).select('id').maybeSingle());if(!changed)return fail('invalid_transition',409);
  return ok({status:next,notifications:await notify([row.created_by,row.assigned_to,...(row.payload?.shared_assignee_ids||[])].filter(id=>id&&id!==s.id),'work_'+b.outcome,'工作進度',`工作「${row.title}」${{accepted:'已接受',completed:'已完成',cancelled:'已取消'}[b.outcome]}。\n回報：${b.note.trim()}`)});
 }
}

export async function handleWorkPlanner(c){try{return await handle(c);}catch(e){return fail(['calendar_not_connected','calendar_unavailable','event_changed'].includes(e.message)?e.message:'work_unavailable',503);}}

export async function sendWorkNotification({db,deliver,staffId,key,related,title,message}){
 const idempotencyKey=key+':'+related+':'+staffId;
 // Reuse the verified channel/quiet-hour logic, with receipts isolated from older workflows.
 const receiptDb={from:table=>db.from(table==='pastoral_notification_deliveries'?'mplus_work_notifications':table),rpc:(...args)=>db.rpc(...args)};
 const result=await deliver({db:receiptDb,staffId,churchId:'M+',eventKey:key,sourceKey:idempotencyKey,title,body:message,url:'/mplus-dashboard.html?church=M%2B',lineMessage:message+'\n開啟 M＋工作台：https://mscos.mchurch.online/mplus-dashboard.html?church=M%2B',idempotencyKey});
 const saved=await db.from('mplus_work_notifications').upsert({idempotency_key:idempotencyKey,recipient_staff_id:staffId,event_key:key,related_id:related,app_status:result.appStatus,line_status:result.lineStatus,status:result.status,updated_at:new Date().toISOString()},{onConflict:'idempotency_key'});
 if(saved.error)throw Error('notification_receipt_failed');return result.status;
}
