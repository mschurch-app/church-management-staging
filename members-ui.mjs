import {db} from './admin-db.mjs';
import {listMembers,saveMember,FIELDS} from './member-management.mjs';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null;
const $=s=>document.querySelector(s),status=$('#status'),list=$('#list'),editor=$('#editor');
let page=0,search='',generation=0,busy=false,newcomersOnly=false;
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
function clear(){generation++;list.replaceChildren();editor.replaceChildren();$('#new').disabled=true;$('#newcomer').disabled=true;$('#prev').disabled=true;$('#next').disabled=true;}
function edit(row=null,isNewcomer=false){
 editor.replaceChildren();const form=document.createElement('form'),inputs={};
 form.append(text('h2',row?'編輯會員':isNewcomer?'登記新朋友':'新增測試會員'));
 for(const [key,[label,max]] of Object.entries(FIELDS)){
  const wrap=text('label',label),input=document.createElement(key==='memo'?'textarea':'input');
  input.maxLength=max;input.value=row?.[key]??(isNewcomer&&key==='faith_status'?'新朋友（初次聚會）':isNewcomer&&key==='welcome_status'?'新朋友':'');input.required=key==='name';
  if(key==='birthday')input.type='date';if(key==='phone')input.type='tel';
  wrap.append(input);form.append(wrap);inputs[key]=input;
 }
 const save=text('button','儲存'),cancel=text('button','取消');cancel.type='button';cancel.onclick=()=>editor.replaceChildren();
 form.append(save,cancel);editor.append(form);
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;save.disabled=true;cancel.disabled=true;
  const ticket=generation;
  try{await saveMember(db,church,Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value])),row);if(ticket===generation){await load();status.textContent='已儲存並重新載入名單。';}}
  catch(error){if(ticket===generation){status.textContent=error.message;save.disabled=false;cancel.disabled=false;}}
  finally{busy=false;}
 };
}
async function load(){
 clear();const ticket=generation;status.textContent='正在載入…';
 try{
  const result=await listMembers(db,church,search,page,newcomersOnly);if(ticket!==generation)return;
  $('#new').disabled=false;$('#newcomer').disabled=false;$('#prev').disabled=page===0;$('#next').disabled=!result.hasNext;
  status.textContent=result.rows.length?'第 '+(page+1)+' 頁，共顯示 '+result.rows.length+' 位會員。':'沒有符合條件的會員。';
  for(const row of result.rows){
   const card=text('article',''),editButton=text('button','編輯');
   card.append(text('h2',row.name),text('p','電話：'+(row.phone||'未填')+' · 地區：'+(row.district||'未填')));
   card.append(text('p','聚會狀態：'+(row.faith_status||'未填')+' · 迎新跟進：'+(row.welcome_status||'未填')));
   editButton.onclick=()=>{if(!busy)edit(row);};card.append(editButton);list.append(card);
  }
 }catch(error){if(ticket===generation)status.textContent=error.message;}
}
$('#title').textContent=(church==='M+'?'M+':church==='SHiNE'?'火樂':'')+'會員管理';
$('#review').href='binding-review.html?church='+encodeURIComponent(church||'');
$('#search-form').onsubmit=event=>{event.preventDefault();if(busy)return;search=$('#search').value;newcomersOnly=$('#newcomers-only').checked;page=0;load();};
$('#new').onclick=()=>{if(!busy)edit();};
$('#newcomer').onclick=()=>{if(!busy)edit(null,true);};
$('#prev').onclick=()=>{if(!busy&&page>0){page--;load();}};
$('#next').onclick=()=>{if(!busy){page++;load();}};
$('#logout').onclick=async()=>{clear();await db.auth.signOut();location.replace('admin-login.html');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else load();});
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();status.textContent='已登出，請重新登入。';}});
load();
