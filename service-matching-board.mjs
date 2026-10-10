import {createAppIcon} from './app-icons.mjs?v=20261010-match-board1';

const node=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
const names=value=>String(value||'').split(/[、,，;；\n]+/u).map(name=>name.trim()).filter(Boolean);
const dateLabel=value=>new Intl.DateTimeFormat('zh-TW',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Taipei'}).format(new Date(`${value}T12:00:00+08:00`));
const shortDate=value=>`${Number(value.slice(5,7))}/${Number(value.slice(8,10))}`;
const personKey=person=>String(person.member_id||`name:${person.name.trim()}`);
const groupRole=role=>/^singer_[123]$/.test(role)?'singer':/^welcome_[12]$/.test(role)?'welcome':role;
const dayNumber=date=>Date.parse(`${date}T12:00:00+08:00`)/86400000;

// The draft only contains original registration IDs. Nothing is written while editing.
export function createMatchingDraft({slots,context,roleTargets,labels}){
  const scheduleByDate=new Map((context.schedules||[]).map(row=>[row.service_date,row.assignments||{}]));
  const blocked=new Set((context.blocked_registration_ids||[]).map(String));
  const selected=new Set(),members=new Map(),groups=new Map();
  const entries=slots.filter(slot=>roleTargets[slot.role_key]).map(slot=>{
    const role=groupRole(slot.role_key),target=roleTargets[slot.role_key];
    const entry={...slot,target,role,existing:names(scheduleByDate.get(slot.service_date)?.[target]),candidates:(slot.registrations||[]).filter(p=>['registered','confirmed'].includes(p.status))};
    for(const person of slot.registrations||[]){
      const key=personKey(person);
      if(!members.has(key))members.set(key,{key,name:person.name,member_id:person.member_id,registrations:[],formalDates:new Set()});
      members.get(key).registrations.push({person,entry});
    }
    const key=`${slot.service_date}:${slot.ministry_key}:${role}`;
    if(!groups.has(key))groups.set(key,{key,date:slot.service_date,ministry:slot.ministry_key,role,label:role==='singer'?'歌手':role==='welcome'?'接待':labels[role]||role,entries:[]});
    groups.get(key).entries.push(entry);return entry;
  });
  for(const member of members.values())for(const [date,assignments] of scheduleByDate){
    if(Object.values(assignments).some(value=>names(value).includes(member.name.trim())))member.formalDates.add(date);
  }
  const candidateById=new Map(entries.flatMap(entry=>entry.candidates.map(person=>[String(person.id),{person,entry}])));
  const chosen=entry=>entry.candidates.filter(person=>selected.has(String(person.id)));
  const memberDates=key=>new Set([...members.get(key).formalDates,...[...selected].filter(id=>personKey(candidateById.get(id).person)===key).map(id=>candidateById.get(id).entry.service_date)]);
  const workload=person=>memberDates(personKey(person)).size;
  const overlaps=(person,entry,exceptId=null)=>{
    if(blocked.has(String(person.id)))return true;
    return [...selected].some(id=>id!==exceptId&&candidateById.get(id).entry.service_date===entry.service_date&&personKey(candidateById.get(id).person)===personKey(person));
  };
  const restriction=(person,entry,exceptId=null)=>{
    if(entry.existing.length)return entry.existing.includes(person.name.trim())?'已在正式班表':'此名額已有正式安排';
    if(overlaps(person,entry,exceptId))return '同日已有其他服事，需先協調';
    if(chosen(entry).filter(p=>String(p.id)!==exceptId).length>=entry.capacity)return '此名額已安排人選';
    return '';
  };
  const rank=(a,b)=>workload(a)-workload(b)||(a.status==='confirmed'?0:1)-(b.status==='confirmed'?0:1)||String(a.created_at||'').localeCompare(String(b.created_at||''))||Number(a.id)-Number(b.id);
  // Fill the dates with fewer willing candidates first, then balance seasonal workload.
  for(const entry of [...entries].sort((a,b)=>a.candidates.length-b.candidates.length||a.service_date.localeCompare(b.service_date)||Number(a.id)-Number(b.id))){
    for(const person of [...entry.candidates].sort(rank))if(!restriction(person,entry))selected.add(String(person.id));
  }
  const stats=()=>{
    const capacity=entries.reduce((n,e)=>n+Number(e.capacity),0),formal=entries.reduce((n,e)=>n+Math.min(e.capacity,e.existing.length),0);
    return {capacity,formal,suggested:selected.size,gaps:Math.max(0,capacity-formal-selected.size)};
  };
  const groupStats=group=>{
    const capacity=group.entries.reduce((n,e)=>n+Number(e.capacity),0),filled=group.entries.reduce((n,e)=>n+Math.min(e.capacity,e.existing.length)+chosen(e).length,0);
    return{capacity,filled,gaps:Math.max(0,capacity-filled)};
  };
  const issues=()=>{
    const result=[];
    for(const group of groups.values()){
      const state=groupStats(group);
      if(state.gaps)result.push({group,kind:'gap',title:`${group.label}還缺 ${state.gaps} 位`,detail:group.entries.some(e=>e.candidates.some(p=>!selected.has(String(p.id))&&!restriction(p,e)))?'有可安排的意願，請挑選人選。':'目前沒有可直接代入的人選，可先保留缺額並聯絡同工。'});
      const conflicts=group.entries.flatMap(e=>e.candidates.filter(p=>!selected.has(String(p.id))&&!e.existing.includes(p.name.trim())&&(e.existing.length||overlaps(p,e))).map(p=>p.name));
      if(conflicts.length)result.push({group,kind:'conflict',title:`${[...new Set(conflicts)].join('、')}需要協調`,detail:'已有正式安排或同日其他服事；原安排已保留。'});
      if(group.entries.some(e=>e.existing.length>e.capacity))result.push({group,kind:'conflict',title:`${group.label}正式安排超過目前名額`,detail:'請到正式班表確認名額與人員；這裡會保留原安排。'});
    }return result;
  };
  return{entries,groups:[...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||['media','worship','welcome','children'].indexOf(a.ministry)-['media','worship','welcome','children'].indexOf(b.ministry)||Object.keys(roleTargets).indexOf(a.entries[0].role_key)-Object.keys(roleTargets).indexOf(b.entries[0].role_key)),members,selected,chosen,memberDates,workload,rank,restriction,stats,groupStats,issues,
    choose(person,entry,replacing=null){const reason=restriction(person,entry,replacing);if(reason)return reason;if(replacing)selected.delete(replacing);selected.add(String(person.id));return '';},
    remove(id){selected.delete(String(id));}
  };
}

export function mountMatchingBoard(root,{draft,seasonTitle,labels,onClose,onApply,onChange,isLocked=()=>false}){
  root.replaceChildren();root.classList.add('matching-board');
  let view='sundays',month='',ministry='',selectedDate='',attentionOnly=false,revision=0;
  const head=node('header','','match-head'),intro=node('div'),close=button('收起預排','secondary',()=>onClose());
  const kicker=node('p','服事安排工作台','match-kicker');intro.append(kicker,node('h2',seasonTitle),node('p','先看每週安排，再協調人選；確認後才會寫入正式班表。','match-muted'));head.append(intro,close);
  const summary=node('div','','match-summary');summary.setAttribute('aria-label','本季預排摘要');
  const nav=node('nav','','match-views');nav.setAttribute('aria-label','配對檢視方式');
  const views=[['sundays','calendar','按主日排班'],['people','people','同工服事量'],['issues','chat','待協調事項']];
  const viewButtons=new Map();for(const [key,icon,title] of views){const control=button(title,'secondary',()=>{view=key;render();});control.prepend(createAppIcon(icon,'match-icon'));viewButtons.set(key,control);nav.append(control);}
  const filters=node('div','','match-filters');
  const monthSelect=document.createElement('select'),ministrySelect=document.createElement('select'),attention=button('只看需要處理','secondary',()=>{attentionOnly=!attentionOnly;render();});
  monthSelect.append(new Option('全部月份',''));for(const value of [...new Set(draft.groups.map(g=>g.date.slice(0,7)))])monthSelect.append(new Option(`${value.slice(0,4)} 年 ${Number(value.slice(5))} 月`,value));
  ministrySelect.append(new Option('全部負責類別',''));for(const value of [...new Set(draft.groups.map(g=>g.ministry))])ministrySelect.append(new Option(labels[value]||value,value));
  monthSelect.onchange=()=>{month=monthSelect.value;render();};ministrySelect.onchange=()=>{ministry=ministrySelect.value;render();};
  filters.append(field('月份',monthSelect),field('服事類別',ministrySelect),attention);
  const content=node('div','','match-content'),live=node('p','','match-live');live.setAttribute('role','status');live.setAttribute('aria-live','polite');
  const footer=node('footer','','match-footer'),footerCopy=node('div'),apply=button('確認預排','primary',async()=>{
    if(isLocked()||!draft.selected.size)return;
    const current=revision,ids=[...draft.selected];await onApply(ids,()=>current===revision);
  });
  footerCopy.append(node('strong','','match-apply-count'),node('small','預排尚未儲存；已排定的人員會保留。'));footer.append(footerCopy,apply);
  root.append(head,summary,nav,filters,live,content,footer);
  function button(text,className,callback){const control=node('button',text,className);control.type='button';control.onclick=()=>{if(!isLocked())callback();};return control;}
  function field(text,control){const label=node('label',text);label.append(control);return label;}
  function badge(text,tone=''){const label=node('span',text,'match-badge');if(tone)label.dataset.tone=tone;return label;}
  function changed(text,focusId){revision++;onChange();render();live.textContent=text;if(focusId)root.querySelector(`[data-focus="${focusId}"]`)?.focus({preventScroll:true});}
  function visible(group){return(!month||group.date.startsWith(month))&&(!ministry||group.ministry===ministry);}
  function render(){
    summary.replaceChildren();const state=draft.stats(),issues=draft.issues();
    for(const [value,label,tone] of [[state.suggested,'建議代入',''],[state.formal,'正式安排',''],[state.gaps,'尚缺人員','warning'],[issues.filter(i=>i.kind==='conflict').length,'需要協調','warning']]){
      const item=node('div','','match-stat');item.dataset.tone=tone;item.append(node('strong',String(value)),node('span',label));summary.append(item);
    }
    for(const [key,control] of viewButtons){control.setAttribute('aria-pressed',String(key===view));control.classList.toggle('active',key===view);}
    attention.setAttribute('aria-pressed',String(attentionOnly));attention.hidden=view!=='sundays';monthSelect.disabled=view==='people';
    footerCopy.querySelector('strong').textContent=`${state.suggested} 筆建議待確認`;apply.textContent=`檢視並套用 ${state.suggested} 筆`;apply.disabled=!state.suggested||isLocked();
    content.replaceChildren();
    if(view==='people')renderPeople();else if(view==='issues')renderIssues(issues);else renderSundays(issues);
  }
  function renderSundays(issues){
    const groups=draft.groups.filter(g=>visible(g)&&(!attentionOnly||issues.some(i=>i.group===g)));
    const dates=[...new Set(groups.map(g=>g.date))];
    if(!dates.includes(selectedDate))selectedDate=dates[0]||'';
    if(dates.length){
      const weeks=node('nav','','match-week-nav');weeks.setAttribute('aria-label','選擇要安排的主日');
      for(const date of dates){
        const day=groups.filter(g=>g.date===date),gap=day.reduce((n,g)=>n+draft.groupStats(g).gaps,0);
        const control=button('','secondary',()=>{selectedDate=date;render();root.querySelector(`[data-week="${date}"]`)?.focus({preventScroll:true});});
        control.dataset.week=date;control.setAttribute('aria-pressed',String(date===selectedDate));control.setAttribute('aria-label',`${dateLabel(date)}，${gap?`缺 ${gap} 位`:'人員已齊'}`);
        control.append(node('strong',shortDate(date)),node('small',gap?`缺 ${gap} 位`:'人員已齊'));weeks.append(control);
      }content.append(weeks);
    }
    for(const date of dates.filter(date=>date===selectedDate)){
      const section=node('section','','match-sunday'),header=node('header','','match-sunday-head'),dayGroups=groups.filter(g=>g.date===date);
      const allDay=draft.groups.filter(g=>g.date===date&&(!ministry||g.ministry===ministry)),gap=allDay.reduce((n,g)=>n+draft.groupStats(g).gaps,0),capacity=allDay.reduce((n,g)=>n+draft.groupStats(g).capacity,0);
      const stamp=node('div','','match-date-stamp');stamp.append(node('small',`${Number(date.slice(5,7))} 月`),node('strong',String(Number(date.slice(8,10)))));
      const title=node('div');title.append(node('h3',dateLabel(date)),node('p',`${capacity-gap} / ${capacity} 位已安排${attentionOnly?' · 顯示需要處理的項目':''}`));header.append(stamp,title,badge(gap?`缺 ${gap} 位`:'人員已齊',gap?'warning':'success'));section.append(header);
      const grid=node('div','','match-role-grid');for(const group of dayGroups)grid.append(roleCard(group));section.append(grid);content.append(section);
    }
    if(!groups.length)content.append(node('p',attentionOnly?'此範圍沒有待處理事項。':'此範圍沒有服事名額，請調整篩選。','match-empty'));
  }
  function roleCard(group){
    const state=draft.groupStats(group),card=node('article','','match-role');card.dataset.focus=group.key;card.tabIndex=-1;
    const title=node('header','','match-role-head'),copy=node('div');copy.append(node('small',labels[group.ministry]||group.ministry),node('h4',group.label));title.append(copy,badge(`${state.filled} / ${state.capacity} 位`,state.gaps?'warning':'success'));card.append(title);
    for(const entry of group.entries){
      for(const name of entry.existing){const row=node('div','','match-person match-formal');row.append(node('strong',name),badge('正式安排'));card.append(row);}
      for(const person of draft.chosen(entry)){
        const row=node('div','','match-person'),copy=node('div'),change=button('換人','secondary',()=>showCandidates(group,String(person.id))),remove=button('暫留空缺','secondary',()=>{draft.remove(person.id);changed(`${group.label}已暫留空缺，尚未更動正式班表。`,group.key);});
        copy.append(node('strong',person.name),node('small',`建議 · 本季 ${draft.workload(person)} 個主日`));row.append(copy,change,remove);card.append(row);
      }
    }
    if(state.gaps){const empty=node('div',`還缺 ${state.gaps} 位`,'match-gap');empty.append(button('安排人選','secondary',()=>showCandidates(group)));card.append(empty);}
    const rationale=node('details','','match-rationale'),summary=node('summary','為什麼這樣安排？');rationale.append(summary,node('p','依本人登記的日期與項目代入，優先照顧可選人數較少的名額，再參考本季已排主日數。'));
    if(group.entries.some(e=>e.existing.length))rationale.append(node('p','正式班表已有安排，這裡保留人員；需更動時請到正式班表協調。'));
    const waiting=group.entries.reduce((n,e)=>n+e.registrations.filter(p=>['waitlisted','offered'].includes(p.status)).length,0);
    if(waiting)rationale.append(node('p',`${waiting} 位候補／待回覆：完成遞補確認後才可配對。`));
    for(const person of group.entries.flatMap(e=>draft.chosen(e))){
      const dates=[...draft.memberDates(personKey(person))].sort(),consecutive=dates.some(date=>date!==group.date&&Math.abs(dayNumber(date)-dayNumber(group.date))===7);
      rationale.append(node('p',`${person.name}：有登記本日${group.label}，本季安排 ${dates.length} 個主日${consecutive?'，含相鄰兩週，請留意服事量':''}。`));
    }
    card.append(rationale);return card;
  }
  function showCandidates(group,replacing=null){
    if(isLocked())return;
    // Native dialog provides keyboard focus trapping and Escape support in Safari.
    const dialog=node('dialog','','match-picker'),title=node('h2',`${group.label} · ${shortDate(group.date)}`);title.id='match-picker-title';dialog.setAttribute('aria-labelledby',title.id);
    const description=node('p',replacing?'選擇同一名額的其他已登記人選。':'選擇有登記本日服事的人選；顯示本季已排主日數。','match-muted'),list=node('div','','match-candidate-list');
    const replacementEntry=replacing?draft.entries.find(e=>draft.chosen(e).some(p=>String(p.id)===replacing)):null;
    const candidates=group.entries.flatMap(entry=>entry.registrations.filter(person=>['registered','confirmed','waitlisted','offered'].includes(person.status)).map(person=>({entry,person}))).sort((a,b)=>draft.rank(a.person,b.person));
    const focus=document.activeElement,previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const finish=()=>{dialog.close();dialog.remove();document.body.style.overflow=previousOverflow;if(focus?.isConnected)focus.focus({preventScroll:true});else root.querySelector(`[data-focus="${group.key}"]`)?.focus({preventScroll:true});};
    for(const {entry,person} of candidates){
      let reason=['waitlisted','offered'].includes(person.status)?'候補／待回覆，請先完成遞補':draft.restriction(person,entry,replacing);
      if(draft.selected.has(String(person.id)))reason='目前建議人選';
      if(replacementEntry&&entry!==replacementEntry)reason='不同登記名額：請先暫留空缺，再於本項安排人選';
      const control=button('', 'match-candidate secondary',()=>{const error=draft.choose(person,entry,replacing);if(error){description.textContent=error;return;}finish();changed(`已將${person.name}排入${shortDate(group.date)}${group.label}，尚未儲存。`,group.key);});
      control.disabled=!!reason;control.append(node('strong',person.name),node('small',reason||`本季 ${draft.workload(person)} 個主日 · 本人有登記此日期與項目`));list.append(control);
    }
    if(!candidates.length)list.append(node('p','尚未有人登記本日此項服事。可先保留缺額，再聯絡同工填寫意願。','match-empty'));
    const close=button('返回預排','secondary',finish);dialog.append(title,description,list,close);dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});document.body.append(dialog);dialog.showModal();close.focus({preventScroll:true});dialog.scrollTop=0;
  }
  function renderPeople(){
    const list=node('div','','match-people-grid');
    const members=[...draft.members.values()].filter(member=>!ministry||member.registrations.some(r=>r.entry.ministry_key===ministry)).sort((a,b)=>draft.memberDates(b.key).size-draft.memberDates(a.key).size||a.name.localeCompare(b.name,'zh-Hant'));
    for(const member of members){
      const dates=[...draft.memberDates(member.key)].sort(),consecutive=dates.some((date,index)=>index>0&&dayNumber(date)-dayNumber(dates[index-1])===7),card=node('article','','match-member');
      const header=node('header');header.append(node('h3',member.name),badge(`${dates.length} 個主日`,consecutive?'warning':''));card.append(header);
      card.append(node('p',consecutive?'有相鄰兩週的安排，可再協調服事量。':dates.length?'安排分布可於各主日查看。':'有填寫意願，目前尚未安排。','match-muted'));
      const chips=node('div','','match-date-chips');for(const date of dates)chips.append(badge(shortDate(date)));if(!dates.length)chips.append(badge('尚未排入','warning'));card.append(chips);
      const details=node('details','','match-rationale');details.append(node('summary','查看意願與安排'));
      for(const {person,entry} of member.registrations){const group=draft.groups.find(g=>g.entries.includes(entry)),assigned=draft.selected.has(String(person.id))||entry.existing.includes(person.name.trim());details.append(node('p',`${shortDate(entry.service_date)} · ${group.label} · ${assigned?'已安排':['waitlisted','offered'].includes(person.status)?'候補／待回覆':'有登記意願'}`));}card.append(details);list.append(card);
    }
    content.append(list);if(!members.length)content.append(node('p','目前沒有符合的登記同工。','match-empty'));
    content.prepend(node('p','服事量以可查看的正式安排與本次預排計算，同一天計為一個主日。','match-muted'));
  }
  function renderIssues(issues){
    const filtered=issues.filter(issue=>visible(issue.group));
    for(const issue of filtered){const card=node('article','','match-issue'),copy=node('div');copy.append(node('small',`${dateLabel(issue.group.date)} · ${labels[issue.group.ministry]}`),node('h3',issue.title),node('p',issue.detail));
      const action=button(issue.kind==='gap'?'挑選人選':'查看本日安排','secondary',()=>{if(issue.kind==='gap')showCandidates(issue.group);else{view='sundays';selectedDate=issue.group.date;month=issue.group.date.slice(0,7);monthSelect.value=month;attentionOnly=false;render();root.querySelector(`[data-focus="${issue.group.key}"]`)?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}});
      card.append(copy,action);content.append(card);
    }if(!filtered.length)content.append(node('p','這個範圍沒有缺額或衝突。','match-empty'));
  }
  render();return{get revision(){return revision;},render};
}
