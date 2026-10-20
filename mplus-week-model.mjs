export function taipeiDate(value=new Date()){const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function addDay(date,count){return new Date(Date.parse(date+'T12:00:00+08:00')+count*86400000).toISOString().slice(0,10);}
export function weekStart(date){const d=new Date(date+'T12:00:00+08:00');return addDay(date,-((d.getUTCDay()+6)%7));}
export function calendarTasks(tasks){return tasks.filter(t=>(t.assignedToMe||t.sharedWithMe)&&!['draft','cancelled'].includes(t.status));}
export function tasksOn(tasks,date){return tasks.filter(t=>t.dueAt&&taipeiDate(t.dueAt)===date);}
