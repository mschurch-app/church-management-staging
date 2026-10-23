import {db} from './admin-db.mjs?v=20261012-readable2';
import {listMemberAudit} from './member-management.mjs?v=20261003-access-guard1';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null,$=s=>document.querySelector(s),status=$('#status'),list=$('#audit-list');
let limit=50,busy=false,rows=[],generation=0;
const labels={insert:'新增',update:'修改',archive:'封存',restore:'恢復'};
const fieldLabels={name:'姓名',gender:'性別',phone:'電話',group_name:'小組／小家',birthday:'生日',baptism_date:'受洗日期',faith_status:'信仰成熟度',district:'居住區域',growth_progress:'聚會近況',ministry:'服事恩賜',memo:'牧養備註',welcome_status:'迎新狀態',know_us_from:'認識管道',age_group:'年齡層',archived_at:'封存狀態',member_created:'建立會友'};
const el=(tag,value='',cls='')=>Object.assign(document.createElement(tag),{textContent:value,className:cls});
function render(){
 const action=$('#audit-action').value,member=$('#audit-member').value.trim(),visible=rows.filter(r=>(action==='all'||r.action===action)&&(!member||String(r.member_id)===member));list.replaceChildren();
 for(const row of visible){const card=el('article','','audit-card'),head=el('div','','audit-head');head.append(el('strong',labels[row.action]||row.action),el('time',new Date(row.created_at).toLocaleString('zh-TW')));card.append(head,el('p','會友編號：'+row.member_id),el('p','變更欄位：'+((row.changed_fields||[]).map(x=>fieldLabels[x]||x).join('、')||'無')),el('p','操作者：'+(row.actor_id?'管理員 '+row.actor_id.slice(0,8):'系統流程'),'muted'));list.append(card);}
 if(!visible.length)list.append(el('p',rows.length?'沒有符合的操作，請調整篩選。':'目前沒有操作日誌。','care-empty'));
 $('#audit-count').textContent='已載入最近 '+rows.length+' 筆，顯示 '+visible.length+' 筆（最多 100 筆）';$('#more').hidden=rows.length<limit||limit>=100;
}
async function load(nextLimit=limit){
 if(busy)return;busy=true;$('main').setAttribute('aria-busy','true');const ticket=++generation;$('#more').disabled=$('#reload').disabled=true;status.textContent='正在載入操作日誌…';
 try{const data=await listMemberAudit(db,church,nextLimit);if(ticket!==generation)return;rows=data;limit=nextLimit;render();status.textContent=rows.length?'操作日誌已更新。':'目前沒有操作日誌。';}
 catch(error){if(ticket===generation){if(/權限|登入/.test(error.message)){rows=[];render();}status.textContent='清單尚未更新：'+error.message;}}finally{if(ticket===generation){busy=false;$('main').setAttribute('aria-busy','false');$('#more').disabled=$('#reload').disabled=false;}}
}
if(!['M+','SHiNE'].includes(church)){status.textContent='堂會連結不正確。';$('#reload').disabled=true;}else{
 $('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · 會友操作日誌';$('#back').href='members.html?church='+encodeURIComponent(church);$('#more').onclick=()=>load(Math.min(limit+50,100));$('#reload').onclick=()=>load();$('#audit-action').onchange=render;$('#audit-member').oninput=render;
 $('#logout').onclick=async()=>{await db.auth.signOut();location.replace('admin-login.html');};db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){generation++;rows=[];render();busy=false;$('main').setAttribute('aria-busy','false');status.textContent='已登出，請重新登入。';}});load();
}
