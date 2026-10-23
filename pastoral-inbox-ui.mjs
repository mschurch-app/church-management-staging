import {db} from './admin-db.mjs?v=20261012-readable2';import {listPastoralMessages,savePastoralFollowup} from './pastoral-inbox-management.mjs';
import {operationsWorkflow} from './operations-workflow.mjs?v=20261023-operations1';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null,$=s=>document.querySelector(s);let rows=[];const states=['待回覆','處理中','已完成'];const el=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=value;n.className=cls;return n;};
const date=value=>value?new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'未記錄';
const flow=operationsWorkflow({db,editor:$('#editor'),status:$('#status'),read:()=>listPastoralMessages(db,church),apply:data=>{rows=data;render();},clear:()=>{rows=[];$('#items').replaceChildren();$('#summary').replaceChildren();$('#count').textContent='';},close:()=>{$('#editor').hidden=true;$('#editor').replaceChildren();}});
function edit(row){
 if(!flow.ready||!flow.canLeave())return;
 const area=$('#editor'),form=document.createElement('form'),state=document.createElement('select'),notes=document.createElement('textarea');area.replaceChildren();area.hidden=false;
 state.name='status';notes.name='internal_notes';for(const value of states)state.append(new Option(value,value));state.value=row.status||'待回覆';notes.value=row.internal_notes||'';notes.maxLength=10000;notes.placeholder='電話關懷、約談安排、後續追蹤等內部紀錄。';
 const original=el('div','','prayer-original');original.append(el('strong',row.member_name||'未提供姓名'),el('p',row.message));
 const sw=el('label','處理狀態'),nw=el('label','內部跟進備註（選填）');sw.append(state);nw.append(notes);
 const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','儲存跟進紀錄');cancel.type='button';cancel.onclick=()=>flow.close();actions.append(cancel,save);
 form.append(el('h2','更新關懷訊息'),el('p','只儲存內部處理狀態與備註，不會發送 LINE。','muted'),original,sw,nw,actions);
 form.onsubmit=event=>{event.preventDefault();flow.write(()=>savePastoralFollowup(db,church,row,{status:state.value,internal_notes:notes.value}),'跟進紀錄已儲存。');};
 area.append(form);flow.open(form);area.scrollIntoView({behavior:'smooth',block:'start'});state.focus();
}
function filtered(){const term=$('#search').value.trim().toLocaleLowerCase('zh-TW'),state=$('#state').value;return rows.filter(r=>(state==='all'||(r.status||'待回覆')===state)&&(!term||[r.member_name,r.message,r.internal_notes].some(v=>String(v||'').toLocaleLowerCase('zh-TW').includes(term))));}
function render(){const area=$('#items'),visible=filtered(),summary=$('#summary');area.replaceChildren();summary.replaceChildren();for(const key of ['全部',...states]){const count=key==='全部'?rows.length:rows.filter(r=>(r.status||'待回覆')===key).length,card=el('article','','summary-card');card.append(el('strong',String(count)),el('span',key));summary.append(card);}for(const row of visible){const card=el('article','','audit-card prayer-card'),head=el('div','','audit-head');head.append(el('strong',row.member_name||'未提供姓名'),el('time',date(row.created_at)));card.append(head,el('span',row.status||'待回覆','status-badge'),el('p',row.message,'prayer-content'));if(row.internal_notes){const note=el('div','','pastoral-note');note.append(el('strong','內部跟進備註'),el('p',row.internal_notes));card.append(note);}const button=el('button',row.internal_notes?'更新跟進紀錄':'開始跟進','secondary');button.onclick=()=>edit(row);card.append(button);area.append(card);}if(!visible.length)area.append(el('p','目前沒有符合條件的牧養訊息。','muted'));$('#count').textContent='顯示 '+visible.length+' 筆；訊息內容僅限獲授權同工。';}
$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 關懷訊息';
$('#members').href='members.html?church='+encodeURIComponent(church||'');$('#search').oninput=render;$('#state').onchange=render;
$('#clear-filter').onclick=()=>{$('#search').value='';$('#state').value='all';render();};$('#reload').onclick=()=>document.querySelector('main').dataset.privatePaused?flow.resume():flow.load();
document.addEventListener('visibilitychange',()=>document.hidden?flow.suspend():flow.resume());flow.load();
