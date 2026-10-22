import {tasksOn,taipeiDate,timeOrder,addDay} from './mplus-week-model.mjs?v=20261021-work-timeline1';
const reviewWorkflows=new Set(['weekly_promo_review','weekly_bulletin_review','sermon_youtube_caption_review','sermon_social_initial_review','sermon_social_final_review']);
// A source-content date is not a deadline. Use it only to separate older reviews.
export function sourceReviewDate(task){
 if(!reviewWorkflows.has(task.workflow))return '';
 const value=String(task.title||'').match(/(?:^|\s)(20\d{2}-\d{2}-\d{2})(?=\s|$)/)?.[1]||'';
 return value&&taipeiDate(value+'T12:00:00+08:00')===value?value:'';
}
export function focusGroups(rows,today){
 const open=rows.filter(t=>!['completed','cancelled','draft'].includes(t.status)&&t.workOutcome!=='completed');
 const mine=open.filter(t=>t.source!=='calendar'&&(t.assignedToMe===true||t.sharedWithMe===true));
 const older=mine.filter(t=>!t.dueAt&&(sourceReviewDate(t)?sourceReviewDate(t)<today:t.createdAt&&taipeiDate(t.createdAt)&&taipeiDate(t.createdAt)<addDay(today,-14)));
 const olderSet=new Set(older),active=mine.filter(t=>!olderSet.has(t));
 return {older,buckets:[
  {key:'pending',title:'待我確認',items:active.filter(t=>t.status==='pending').sort(timeOrder)},
  {key:'today',title:'今日安排',items:tasksOn(open,today)},
  {key:'overdue',title:'我的逾期工作',items:active.filter(t=>t.dueAt&&taipeiDate(t.dueAt)<today).sort(timeOrder)},
  {key:'undated',title:'我的未排期工作',items:active.filter(t=>!t.dueAt).sort(timeOrder)}
 ]};
}
export const focusBuckets=(rows,today)=>focusGroups(rows,today).buckets;
export function renderWorkFocus(rows,today,{selected,onSelect,openTask}={}){
 const {buckets,older}=focusGroups(rows,today),current=buckets.find(b=>b.key===selected)||buckets.find(b=>b.items.length)||buckets[1];
 const make=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text||'',className:cls||''});
 const item=task=>{const button=make('button','','work-focus-item');button.type='button';button.append(make('strong',task.title),make('small',task.source==='calendar'?'共用行程 · 查看安排':task.sharedWithMe?'協作工作 · 查看進度':'我的工作 · 繼續處理'));button.onclick=()=>openTask(task);return button;};
 const section=make('section','','mplus-work-focus');section.setAttribute('aria-label','先處理這些');section.append(make('h3','先處理這些'));
 const tabs=make('div','','work-focus-filters');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','工作篩選');
 for(const bucket of buckets){const button=make('button',bucket.title+' '+bucket.items.length);button.type='button';button.setAttribute('aria-pressed',String(bucket.key===current.key));button.onclick=()=>onSelect(bucket.key);tabs.append(button);}
 section.append(tabs);
 if(!current.items.length)section.append(make('p','目前沒有'+current.title+'。','work-focus-empty'));
 for(const task of current.items.slice(0,4))section.append(item(task));
 if(current.items.length>4){const more=document.createElement('details');more.className='work-focus-older';more.append(make('summary','其餘 '+(current.items.length-4)+' 項'));for(const task of current.items.slice(4))more.append(item(task));section.append(more);}
 if(older.length){const history=document.createElement('details');history.className='work-focus-older';history.append(make('summary','較早工作 · '+older.length+' 項'),make('p','較早日期的審核，以及建立超過 14 天仍未排期的工作，收在這裡；原紀錄與未結案狀態保留。','work-focus-note'));for(const task of older)history.append(item(task));section.append(history);}
 section.append(make('p','「今日安排」包含共用行程；其餘只列明確指派給你或與你協作的工作。','work-focus-note'));
 return section;
}
