const DAY_MS=86400000;
export const leaveCalendarId='mbot@tcsc.org.tw';
export function leaveEventId(id){
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw Error('invalid_leave_id');
  return 'l'+id.replaceAll('-','').toLowerCase();
}
function nextDay(date){return new Date(Date.parse(date+'T00:00:00Z')+DAY_MS).toISOString().slice(0,10);}
export function leaveCalendarEvent(leave,name,deputyName){
  const id=leaveEventId(leave.id),period=leave.period==='morning'?'上午':leave.period==='afternoon'?'下午':'全天';
  const summary=`${String(name||'同工').slice(0,80)}請假（${period}）`;
  const description=`已核准請假${deputyName?'\n職務代理人：'+String(deputyName).slice(0,80):''}\n請假審核請至教會 OS。`;
  const common={id,summary,description,transparency:'transparent',reminders:{useDefault:false},extendedProperties:{private:{mplusLeaveId:leave.id}}};
  if(leave.period==='full_day')return {...common,start:{date:leave.start_date},end:{date:nextDay(leave.end_date)}};
  const startHour=leave.period==='morning'?'09:00:00':'13:00:00',endHour=leave.period==='morning'?'12:00:00':'17:00:00';
  const days=Math.round((Date.parse(leave.end_date+'T00:00:00Z')-Date.parse(leave.start_date+'T00:00:00Z'))/DAY_MS)+1;
  return {...common,start:{dateTime:`${leave.start_date}T${startHour}+08:00`,timeZone:'Asia/Taipei'},end:{dateTime:`${leave.start_date}T${endHour}+08:00`,timeZone:'Asia/Taipei'},...(days>1?{recurrence:[`RRULE:FREQ=DAILY;COUNT=${days}`]}:{})};
}
