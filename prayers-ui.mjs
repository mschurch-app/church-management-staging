import {db} from './admin-db.mjs';
import {listPrayers,savePrayerCare} from './prayer-management.mjs?v=20260924-custom2';
import {loadChurchCustomizations,catalog} from './church-customizations.mjs?v=20260924-custom2';

const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null,$=selector=>document.querySelector(selector);
let labels={pending:'待關懷',praying:'守望中',answered:'蒙應允',closed:'已結案'},categoryOptions=[];
let rows=[],busy=false,generation=0;
const el=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node;};

function closeEditor(){generation++;$('#editor').hidden=true;$('#editor').replaceChildren();}
function formatDate(value){if(!value)return '未記錄';return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}

function editCare(row){
  const area=$('#editor');area.replaceChildren();area.hidden=false;const ticket=++generation;
  const form=document.createElement('form'),state=document.createElement('select'),category=document.createElement('select'),notes=document.createElement('textarea');
  for(const [value,label] of Object.entries(labels))state.append(new Option(label,value));state.value=row.status||'pending';category.append(new Option('未分類',''));for(const value of categoryOptions)category.append(new Option(value,value));if(row.category&&!categoryOptions.includes(row.category))category.append(new Option(row.category,row.category));category.value=row.category||'';
  notes.value=row.pastoral_notes||'';notes.maxLength=10000;notes.placeholder='例如：電話關懷紀錄、探訪安排、後續需要留意的事項。';
  const stateWrap=el('label','關懷狀態'),categoryWrap=el('label','代禱分類'),notesWrap=el('label','教牧關懷備註');stateWrap.append(state);categoryWrap.append(category);notesWrap.append(notes);
  const original=el('div','','prayer-original');original.append(el('strong',(row.author_name||'主內家人')+' · '+(row.title||'代禱事項')),el('p',row.content||''));
  const actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','儲存關懷紀錄');cancel.type='button';cancel.onclick=closeEditor;actions.append(cancel,save);
  form.append(el('h2','更新牧養關懷'),el('p','只更新關懷狀態與內部備註，不會傳送任何通知。','muted'),original,stateWrap,categoryWrap,notesWrap,actions);
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;form.querySelectorAll('button,select,textarea').forEach(node=>node.disabled=true);try{await savePrayerCare(db,church,row,{status:state.value,category:category.value,pastoral_notes:notes.value});if(ticket===generation){closeEditor();await load();$('#status').textContent='關懷紀錄已儲存。';}}catch(error){if(ticket===generation){$('#status').textContent=error.message;form.querySelectorAll('button,select,textarea').forEach(node=>node.disabled=false);}}finally{busy=false;}};
  area.append(form);area.scrollIntoView({behavior:'smooth',block:'start'});state.focus();
}

function filteredRows(){
  const term=$('#search').value.trim().toLocaleLowerCase('zh-TW'),privacy=$('#privacy').value,state=$('#state').value;
  return rows.filter(row=>(privacy==='all'||(privacy==='private')===Boolean(row.is_private))&&(state==='all'||(row.status||'pending')===state)&&(!term||[row.author_name,row.group_name,row.title,row.content,row.category,row.pastoral_notes].some(value=>String(value||'').toLocaleLowerCase('zh-TW').includes(term))));
}

function renderSummary(){
  const area=$('#summary');area.replaceChildren();for(const [key,label] of [['all','全部'],...Object.entries(labels)]){const count=key==='all'?rows.length:rows.filter(row=>(row.status||'pending')===key).length;const card=el('article','','summary-card');card.append(el('strong',String(count)),el('span',label));area.append(card);}
}

function render(){
  const area=$('#items'),visible=filteredRows();area.replaceChildren();renderSummary();
  for(const row of visible){
    const card=el('article','','audit-card prayer-card'),head=el('div','','audit-head'),badges=el('div','','prayer-badges');
    badges.append(el('span',row.is_private?'🔒 教牧私密':'🌐 公開代禱牆','status-badge'),el('span',labels[row.status||'pending']||'待關懷','status-badge'));
    head.append(el('strong',(row.author_name||'主內家人')+(row.group_name?' · '+row.group_name:'')),el('time',formatDate(row.created_at)));card.append(head,badges);if(row.category)card.append(el('span','＃'+row.category,'status-badge'));
    if(row.title)card.append(el('h3',row.title));card.append(el('p',row.content||'','prayer-content'));
    if(row.pastoral_notes){const note=el('div','','pastoral-note');note.append(el('strong','教牧關懷備註'),el('p',row.pastoral_notes));card.append(note);}
    const meta=el('p','同心禱告 '+Number(row.hands_count||0)+' 次','muted'),button=el('button',row.pastoral_notes?'更新關懷紀錄':'新增關懷紀錄','secondary');button.onclick=()=>{if(!busy)editCare(row);};card.append(meta,button);area.append(card);
  }
  $('#status').textContent=visible.length?'顯示 '+visible.length+' 筆；私密內容僅限獲授權同工。':'目前沒有符合條件的代禱事項。';
}

async function load(){
  const ticket=++generation;closeEditor();$('#status').textContent='正在確認權限並載入…';
  try{const [result,settings]=await Promise.all([listPrayers(db,church),loadChurchCustomizations(db,church)]);if(ticket+1!==generation)return;rows=result;categoryOptions=catalog(settings,'prayer_categories',[]);const names=catalog(settings,'prayer_statuses',Object.values(labels));['pending','praying','answered','closed'].forEach((key,index)=>{if(names[index])labels[key]=names[index];});const state=$('#state'),chosen=state.value;state.replaceChildren(new Option('全部','all'),...Object.entries(labels).map(([value,label])=>new Option(label,value)));state.value=[...state.options].some(option=>option.value===chosen)?chosen:'all';render();}catch(error){if(ticket+1===generation){rows=[];$('#items').replaceChildren();renderSummary();$('#status').textContent=error.message;}}
}

$('#title').textContent=(church==='M+'?'M＋大雅教會':church==='SHiNE'?'火樂教會':'')+' · 代禱與牧養關懷';$('#members').href='members.html?church='+encodeURIComponent(church||'');
for(const id of ['search','privacy','state'])$('#'+id).addEventListener(id==='search'?'input':'change',render);$('#reload').onclick=load;
document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;rows=[];$('#items').replaceChildren();}else load();});db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){generation++;rows=[];$('#items').replaceChildren();$('#status').textContent='已登出，請重新登入。';}});load();
