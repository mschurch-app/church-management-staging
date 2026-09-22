import {db} from './admin-db.mjs';
import {readAccess,canOpen} from './admin-access.mjs';
import {loadMinistryOptions,saveMinistryOptions} from './member-options.mjs?v=20260922-min2';
const church=new URLSearchParams(location.search).get('church'),status=document.querySelector('#status'),area=document.querySelector('#options');
let options=[],busy=false;
const churchName=church==='M+'?'M＋大雅教會':church==='SHiNE'?'火樂教會':'';
const el=(tag,value,cls='')=>{const n=document.createElement(tag);n.textContent=value;n.className=cls;return n;};
function render(){area.replaceChildren();options.forEach((value,index)=>{const row=el('article'),input=document.createElement('input'),up=el('button','上移','secondary'),down=el('button','下移','secondary'),remove=el('button','刪除','secondary');input.value=value;input.maxLength=80;input.oninput=()=>options[index]=input.value;up.type=down.type=remove.type='button';up.disabled=index===0;down.disabled=index===options.length-1;up.onclick=()=>{[options[index-1],options[index]]=[options[index],options[index-1]];render();};down.onclick=()=>{[options[index+1],options[index]]=[options[index],options[index+1]];render();};remove.onclick=()=>{if(options.length===1){status.textContent='至少保留一個項目。';return;}options.splice(index,1);render();};row.append(input,up,down,remove);area.append(row);});}
async function authorize(){if(!canOpen(await readAccess(db),church,'members'))throw new Error('沒有此堂會的恩賜選項管理權限。');}
document.querySelector('#add').onclick=()=>{options.push('');render();area.lastElementChild?.querySelector('input')?.focus();};
document.querySelector('#save').onclick=async()=>{if(busy)return;busy=true;try{await authorize();options=await saveMinistryOptions(db,church,options);render();status.textContent=churchName+'的恩賜選項已儲存。';}catch(error){status.textContent=error.message;}finally{busy=false;}};
document.querySelector('#back-settings').href='church-settings.html?church='+encodeURIComponent(church||'');
document.querySelector('#title').textContent=churchName+' · 服事恩賜選項';
authorize().then(()=>loadMinistryOptions(db,church)).then(data=>{options=data;render();status.textContent='已載入 '+data.length+' 個'+churchName+'專用項目。';}).catch(error=>{status.textContent=error.message;document.querySelector('#add').disabled=true;document.querySelector('#save').disabled=true;});
