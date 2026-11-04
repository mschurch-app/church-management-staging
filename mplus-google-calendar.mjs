import {staffLineIdToken} from './pastoral/auth.mjs?v=20261102-bibletree-admin1';
import {PASTORAL_CALENDAR_ENDPOINT} from './pastoral/config.mjs?v=20260924-4';
import {addDay} from './mplus-week-model.mjs?v=20261021-work-timeline1';
export async function calendarApi(action,payload={}){const token=await staffLineIdToken();const r=await fetch(PASTORAL_CALENDAR_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({action,...payload})});const data=await r.json();if(!r.ok||data.ok===false){const error=Error(({select_occurrence:'請從行事曆選擇單次行程；停止整個系列請使用例行工作管理。',invalid_routine:'請確認名稱、首次日期、重複星期與時段。',routine_setup_required:'請先新增一項例行工作，或確認目前沒有例行工作。',work_unavailable:'目前無法完成，請保留內容後重試。',event_changed:'行程已被其他人更動，請重新讀取。',event_already_reported:'這筆已回報，請重新讀取確認。',report_forbidden:'目前沒有這項回報權限。',staff_forbidden:'只能安排自己的例行工作。',pastor_required:'目前沒有主管指派權限。',invalid_task:'請確認工作內容、負責人與未來的完成期限。',idempotency_conflict:'這項儲存編號已有不同內容，請先重新讀取確認。',meeting_in_past:'開始時間必須在未來。',outside_schedule:'時段不在設定的工作時間內，請確認日期與時段。',calendar_not_connected:'共用行事曆尚未連接，請由管理者確認 Google 授權。',calendar_conflict:'行事曆已有衝突，請調整時段。',rest_day:'這個時段是參與同工的休息日。',outside_work_hours:'此時段超出同工設定的工作時間。',invalid_staff:'請確認主要負責人及協作同工。',login_required:'登入已到期，請重新登入。'}[data.error])||'行事曆操作未完成，請調整內容或稍後重試。');error.code=data.error;error.conflicts=Array.isArray(data.conflicts)?data.conflicts:[];error.bufferMinutes=data.bufferMinutes;error.canOverride=data.canOverride===true;throw error;}return data;}
export async function readCalendar(start){const result=await calendarApi('list-events',{start:start+'T00:00:00+08:00',end:addDay(start,7)+'T00:00:00+08:00'});if(!Array.isArray(result.events))throw Error('共用行事曆回傳不完整。');return result.events.map(e=>({...e,source:'calendar',title:e.summary,dueAt:e.start,status:'calendar'}));}
const node=(tag,label)=>{const n=document.createElement(tag);n.textContent=label;return n;};
function dialogHeader(dialog,title){const header=node('div','');header.className='mplus-dialog-header';header.append(node('h2',title));const close=node('button','✕');close.type='button';close.className='mplus-dialog-close';close.setAttribute('aria-label','關閉視窗');const dismiss=()=>{dialog.close();dialog.remove();};close.onclick=dismiss;header.append(close);dialog.append(header);dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();});dialog.addEventListener('close',()=>dialog.remove(),{once:true});return dismiss;}
export async function showCalendarEvent(item,onSaved=async()=>{}){const dialog=document.createElement('dialog');dialog.className='mplus-event-dialog';dialogHeader(dialog,item.title);dialog.append(node('p',item.allDay?'全天行程':new Date(item.start).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+' — '+new Date(item.end).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'})),node('p',item.location||''),node('p',item.coworkerNames?'參與同工：'+item.coworkerNames:''));
 for(const [label,outcome,permitted]of [['完成並回報','completed',item.canReport],['取消這一次','cancelled',item.canCancel]])if(permitted&&!item.workOutcome){const b=node('button',label);b.type='button';b.onclick=async()=>{const {openReport}=await import('./mplus-work-planner.mjs?v=20261102-bibletree-admin1');dialog.close();openReport(label,'只影響這一次；例行系列會繼續。',note=>calendarApi('report-event',{eventId:item.id,outcome,note}),onSaved);};dialog.append(b);}
 if(item.routineId&&item.canCancel){const b=node('button','管理例行工作');b.type='button';b.onclick=async()=>{dialog.close();const {openRoutineCenter}=await import('./mplus-work-planner.mjs?v=20261102-bibletree-admin1');void openRoutineCenter(onSaved);};dialog.append(b);}
 const close=node('button','關閉');close.className='secondary';close.onclick=()=>dialog.close();dialog.append(close);document.body.append(dialog);dialog.showModal();}
export async function openCalendarEditor(date,onSaved=async()=>{},{api=calendarApi}={}){
 const dialog=document.createElement('dialog');dialog.className='mplus-event-dialog';
 const dismiss=dialogHeader(dialog,'新增工作');
 const form=document.createElement('form'),status=node('p','正在讀取可選同工…'),details=node('section','');
 status.setAttribute('role','status');status.tabIndex=-1;details.hidden=true;details.setAttribute('aria-label','時段核對');
 dialog.append(node('p','儲存後寫入共用行事曆，並標註參與同工姓名。'),form,status,details);
 const close=node('button','取消');close.type='button';close.className='secondary';dialog.append(close);
 let saving=false,confirmedWrite=null,pending=null,requestId=crypto.randomUUID();
 const headerClose=dialog.querySelector('.mplus-dialog-close');
 close.onclick=()=>{if(!saving)dismiss();};headerClose.onclick=close.onclick;
 dialog.addEventListener('cancel',event=>{if(saving){event.preventDefault();event.stopImmediatePropagation();}},true);
 const report=(text,tone='neutral')=>{status.dataset.tone=tone;status.textContent=text;};
 document.body.append(dialog);dialog.showModal();
 let people;try{people=(await api('list-schedule-staff')).staff||[];}catch(e){report(e.message,'error');return;}
 if(!dialog.isConnected)return;
 const self=people.find(p=>p.isSelf);if(!self){report('尚未確認你的同工身分，請重新登入。','error');return;}
 const manage=['pastor','admin'].includes(self.role);
 function field(label,input){const l=node('label',label);l.append(input);form.append(l);return input;}
 const summary=field('行程名稱',document.createElement('input'));summary.required=true;summary.maxLength=200;
 const day=field('日期',document.createElement('input'));day.type='date';day.value=date;day.required=true;
 const time=field('開始時間',document.createElement('input'));time.type='time';time.value='09:00';time.required=true;
 const duration=field('時長',document.createElement('select'));
 for(const minutes of [30,60,90,120]){const o=node('option',minutes+' 分鐘');o.value=minutes;duration.append(o);}duration.value='60';
 const allDay=field('全天',document.createElement('input'));allDay.type='checkbox';allDay.parentElement.prepend(allDay);
 allDay.onchange=()=>{for(const i of [time,duration]){i.disabled=allDay.checked;i.parentElement.hidden=allDay.checked;}time.required=!allDay.checked;};
 const location=field('地點（選填）',document.createElement('input'));location.maxLength=500;
 const primary=field('主要負責人',document.createElement('select'));
 for(const p of people.filter(p=>manage||p.isSelf)){const o=node('option',p.name);o.value=p.id;primary.append(o);}primary.value=self.id;
 const collaborators=document.createElement('fieldset');collaborators.append(node('legend','協作同工（可複選）'));form.append(collaborators);
 function options(){collaborators.querySelectorAll('label').forEach(n=>n.remove());for(const p of people.filter(p=>p.id!==primary.value)){const l=node('label',p.name),input=document.createElement('input');input.type='checkbox';input.value=p.id;input.name='coworker';l.prepend(input);collaborators.append(l);}}
 primary.onchange=options;options();
 const submit=node('button','儲存至共用行事曆');submit.type='submit';submit.className='primary';form.append(submit);
 const frozen=new Map();
 function freeze(){for(const control of form.querySelectorAll('input,select,button'))if(!frozen.has(control)){frozen.set(control,control.disabled);control.disabled=true;}}
 function thaw(){for(const [control,disabled]of frozen)control.disabled=disabled;frozen.clear();}
 function stopActivity(){submit.classList.remove('os-action-busy');submit.removeAttribute('aria-busy');form.setAttribute('aria-busy','false');close.disabled=false;headerClose.disabled=false;}
 form.addEventListener('input',()=>{if(!saving&&!pending&&!confirmedWrite){requestId=crypto.randomUUID();details.hidden=true;details.replaceChildren();}});
 report('');
 const timeLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value+'（全天）':new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
 function conflictDetails(payload,error){
  const popup=document.createElement('dialog');popup.className='mplus-event-dialog mplus-conflict-dialog';popup.setAttribute('aria-label','行程衝突提醒');
  popup.style.maxWidth='560px';popup.style.width='calc(100% - 28px)';popup.style.maxHeight='85dvh';popup.style.overflow='auto';
  const dismissPopup=dialogHeader(popup,'行程時間有衝突');
  popup.append(node('p','這筆工作尚未新增。你要修改時間，還是保留現有行程並繼續安排？'));
  popup.append(node('strong','你要新增：'+payload.summary),node('p',timeLabel(payload.start)+' — '+timeLabel(payload.end)));
  const buffer=Number.isFinite(error.bufferMinutes)?error.bufferMinutes:30;
  popup.append(node('p','系統包含前後各 '+buffer+' 分鐘的緩衝時間。'));
  const list=node('section','');list.setAttribute('aria-label','衝突工作與時間');popup.append(list);
  const rows=Array.isArray(error.conflicts)?error.conflicts:[];
  for(const event of rows){const row=node('article','');row.style.padding='12px 0';row.style.borderTop='1px solid var(--app-border,#dfd5cd)';row.append(node('strong',event.summary||'未命名行程'),node('p',timeLabel(event.start)+' — '+timeLabel(event.end)));list.append(row);}
  if(!rows.length)list.append(node('p','目前無法取得衝突工作的名稱與時間，請先返回行事曆核對。'));
  const actions=node('div','');actions.style.display='flex';actions.style.flexWrap='wrap';actions.style.gap='12px';
  const adjust=node('button','修改時間');adjust.type='button';adjust.className='secondary';
  const proceed=node('button','仍要安排');proceed.type='button';proceed.className='primary';proceed.disabled=error.canOverride!==true;
  adjust.onclick=()=>{dismissPopup();(allDay.checked?day:time).focus();};
  proceed.onclick=()=>{proceed.disabled=true;dismissPopup();void save({...payload,allowConflict:true,conflictConfirmed:true});};
  actions.append(adjust,proceed);popup.append(actions);document.body.append(popup);popup.showModal();adjust.focus();
 }
 async function reloadSaved(){
  if(saving||!confirmedWrite)return;saving=true;close.disabled=headerClose.disabled=true;
  report('行程已寫入，正在重新讀取共用行事曆…','busy');
  try{await onSaved(confirmedWrite.eventId,confirmedWrite.date);report(confirmedWrite.conflictOverride?'已依你的確認保留重疊安排，並寫入共用行事曆。':'已寫入共用行事曆；共用行事曆已重新讀取。','success');submit.remove();details.hidden=true;close.textContent='完成';}
  catch{report('行程已寫入，但重新讀取未完成。請重新讀取核對，不要重複新增。','error');details.replaceChildren();details.hidden=false;const retry=node('button','重新讀取行事曆');retry.type='button';retry.className='secondary';retry.onclick=reloadSaved;details.append(retry);}
  finally{saving=false;stopActivity();}
 }
 async function save(payload){
  if(saving||confirmedWrite)return;saving=true;freeze();form.setAttribute('aria-busy','true');close.disabled=headerClose.disabled=true;close.textContent='關閉';details.hidden=true;
  report('正在確認時段並寫入共用行事曆…','busy');
  try{const result=await api('create-event',payload);if(!result.eventId)throw Error('尚無法確認是否寫入，請重試這次儲存以核對同一筆行程。');
   pending=null;confirmedWrite={eventId:result.eventId,date:payload.allDay?payload.start:payload.start.slice(0,10),conflictOverride:result.conflictOverride===true};
   // Payload dates are UTC for timed events; the selected Taipei date is retained explicitly.
   confirmedWrite.date=day.value;saving=false;await reloadSaved();
  }catch(error){
   report(error.code==='calendar_conflict'?'尚未新增：這個時段（含前後各 30 分鐘）與共用行事曆衝突，請調整日期或時間。':error.message,'error');
   if(error.code==='calendar_conflict'){pending=null;thaw();conflictDetails(payload,error);}
   else if(!error.code||error.code==='calendar_unavailable'||error.code==='unavailable'){
    report('尚無法確認這次儲存結果。已保留內容，請按「重試這次儲存」核對。','error');
    pending=payload;details.replaceChildren(node('p','已保留原填寫內容，這次結果尚未確認。重試會使用同一筆儲存編號，避免重複新增。'));details.hidden=false;
    const retry=node('button','重試這次儲存');retry.type='button';retry.className='secondary';retry.onclick=()=>save(payload);details.append(retry);
   }else{pending=null;thaw();}
  }finally{saving=false;stopActivity();}
 }
 form.onsubmit=event=>{event.preventDefault();if(saving||pending||confirmedWrite||!form.reportValidity())return;
  const start=new Date(day.value+'T'+time.value+':00+08:00');
  void save({staffId:primary.value,participantIds:[...collaborators.querySelectorAll('input:checked')].map(n=>n.value),summary:summary.value.trim(),location:location.value.trim(),allDay:allDay.checked,start:allDay.checked?day.value:start.toISOString(),end:allDay.checked?addDay(day.value,1):new Date(start.getTime()+Number(duration.value)*60000).toISOString(),requestId,confirmed:true,notifyParticipants:false});
 };
}
