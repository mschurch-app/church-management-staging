import {tasksOn,taipeiDate,timeOrder} from './mplus-week-model.mjs?v=20261021-work-timeline1';
export function focusBuckets(rows,today){
 const open=rows.filter(t=>!['completed','cancelled','draft'].includes(t.status)&&t.workOutcome!=='completed');
 const mine=open.filter(t=>t.source!=='calendar'&&(t.assignedToMe===true||t.sharedWithMe===true));
 return [
  {key:'pending',title:'待我確認',items:mine.filter(t=>t.status==='pending').sort(timeOrder)},
  {key:'today',title:'今日安排',items:tasksOn(open,today)},
  {key:'overdue',title:'我的逾期工作',items:mine.filter(t=>t.dueAt&&taipeiDate(t.dueAt)<today).sort(timeOrder)},
  {key:'undated',title:'我的未排期工作',items:mine.filter(t=>!t.dueAt).sort(timeOrder)}
 ];
}
export function renderWorkFocus(rows,today,{selected,onSelect,openTask}={}){
 const buckets=focusBuckets(rows,today),current=buckets.find(b=>b.key===selected)||buckets.find(b=>b.items.length)||buckets[1];
 const make=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text||'',className:cls||''});
 const section=make('section','','mplus-work-focus');section.setAttribute('aria-label','先處理這些');section.append(make('h3','先處理這些'));
 const tabs=make('div','','work-focus-filters');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','工作篩選');
 for(const bucket of buckets){const button=make('button',bucket.title+' '+bucket.items.length);button.type='button';button.setAttribute('aria-pressed',String(bucket.key===current.key));button.onclick=()=>onSelect(bucket.key);tabs.append(button);}
 section.append(tabs);
 if(!current.items.length)section.append(make('p','目前沒有'+current.title+'。','work-focus-empty'));
 for(const task of current.items.slice(0,4)){const button=make('button','','work-focus-item');button.type='button';button.append(make('strong',task.title),make('small',task.source==='calendar'?'共用行程 · 查看安排':task.sharedWithMe?'協作工作 · 查看進度':'我的工作 · 繼續處理'));button.onclick=()=>openTask(task);section.append(button);}
 if(current.items.length>4)section.append(make('p','另有 '+(current.items.length-4)+' 項，可在下方行事曆查看。','work-focus-empty'));
 section.append(make('p','「今日安排」包含共用行程；其餘只列明確指派給你或與你協作的工作。','work-focus-note'));
 return section;
}
