import {db} from './admin-db.mjs';
import {readAccess,canOpen} from './admin-access.mjs?v=20260923-profile1';
import {loadMinistryOptions,saveMinistryOptions} from './member-options.mjs?v=20260922-min2';
const church=new URLSearchParams(location.search).get('church'),status=document.querySelector('#status'),area=document.querySelector('#options'),add=document.querySelector('#add'),save=document.querySelector('#save');
let options=[],busy=false,dirty=false;
const churchName=church==='M+'?'M＋大雅教會':church==='SHiNE'?'火樂教會':'';
const el=(tag,value,cls='')=>{const n=document.createElement(tag);n.textContent=value;n.className=cls;return n;};
function setStatus(message,state=''){status.textContent=message;status.dataset.state=state;}
function markChanged(){dirty=true;save.disabled=busy;setStatus('有尚未儲存的變更','pending');}
function action(label,symbol,disabled,handler,kind=''){const button=el('button',symbol,'option-icon '+kind);button.type='button';button.disabled=disabled;button.setAttribute('aria-label',label);button.title=label;button.onclick=handler;return button;}
function render(){area.replaceChildren();options.forEach((value,index)=>{const row=el('article','','ministry-option'),number=el('span',String(index+1).padStart(2,'0'),'option-number'),field=el('div','','option-field'),label=el('label','恩賜名稱','option-label'),input=document.createElement('input'),actions=el('div','','option-actions');input.value=value;input.maxLength=80;input.placeholder='輸入服事恩賜名稱';input.setAttribute('aria-label','第 '+(index+1)+' 項恩賜名稱');input.oninput=()=>{options[index]=input.value;markChanged();};field.append(label,input);actions.append(action('向上移動','↑',index===0,()=>{[options[index-1],options[index]]=[options[index],options[index-1]];markChanged();render();}),action('向下移動','↓',index===options.length-1,()=>{[options[index+1],options[index]]=[options[index],options[index+1]];markChanged();render();}),action('刪除此選項','×',options.length===1,()=>{if(options.length===1)return;options.splice(index,1);markChanged();render();},'danger'));row.append(number,field,actions);area.append(row);});document.querySelector('#option-count').textContent=options.length+' 個項目';}
async function authorize(){if(!canOpen(await readAccess(db),church,'members'))throw new Error('沒有此堂會的恩賜選項管理權限。');}
add.onclick=()=>{options.push('');markChanged();render();requestAnimationFrame(()=>area.lastElementChild?.querySelector('input')?.focus());};
save.onclick=async()=>{if(busy||!dirty)return;busy=true;save.disabled=true;add.disabled=true;setStatus('正在安全儲存…','loading');try{await authorize();options=await saveMinistryOptions(db,church,options);dirty=false;render();setStatus('已儲存 '+churchName+' 的恩賜選項','success');}catch(error){setStatus(error.message,'error');save.disabled=false;}finally{busy=false;add.disabled=false;save.disabled=!dirty;}};
document.querySelector('#back-settings').href='church-settings.html?church='+encodeURIComponent(church||'');
document.querySelector('#title').textContent=churchName+' · 服事恩賜';
document.querySelector('#church-badge').textContent='⌂ '+churchName;
authorize().then(()=>loadMinistryOptions(db,church)).then(data=>{options=data;dirty=false;render();save.disabled=true;setStatus('已載入專屬選項，可以開始調整','success');}).catch(error=>{setStatus(error.message,'error');add.disabled=true;save.disabled=true;});
