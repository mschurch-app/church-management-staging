import {db} from './admin-db.mjs?v=20261012-readable2';
import {listGroups,listGroupMembers,assignMemberToGroup,setGroupLeader} from './group-management.mjs';
const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1?values[0]:null,$=s=>document.querySelector(s),term=church==='SHiNE'?'小家':'小組',leaderTerm=church==='SHiNE'?'小家長':'小組長';
let groups=[],members=[],busy=false,loading=false,recovery=true,generation=0;
const el=(tag,value='',cls='')=>Object.assign(document.createElement(tag),{textContent:value,className:cls});
const selectedGroup=()=>groups.find(x=>String(x.id)===$('#group').value);
function syncControls(){$('main').setAttribute('aria-busy',String(busy||loading));for(const node of document.querySelectorAll('[data-mutation]'))node.disabled=busy||loading||recovery;$('#assign').disabled=busy||loading||recovery||!$('#available').value;$('#group').disabled=busy||loading;$('#reload').disabled=busy||loading;}
function render(){
 const group=selectedGroup(),current=$('#current'),available=$('#available'),prior=available.value;current.replaceChildren();available.replaceChildren(new Option('請選擇要調入的成員',''));
 const query=$('#current-search').value.trim().toLocaleLowerCase(),otherQuery=$('#available-search').value.trim().toLocaleLowerCase();let count=0,shown=0,otherCount=0;
 if(group)for(const member of members){
  const inside=(member.group_name||'').trim()===(group.name||'').trim();
  if(!inside){if([member.name,member.phone,member.group_name].some(v=>String(v||'').toLocaleLowerCase().includes(otherQuery))){available.append(new Option(member.name+'（'+(member.group_name||'未編組')+'）',member.id));otherCount++;}continue;}
  count++;if(![member.name,member.phone].some(v=>String(v||'').toLocaleLowerCase().includes(query)))continue;shown++;
  const row=el('article','','audit-card'),head=el('div','','audit-head'),actions=el('div','','card-actions');head.append(el('strong',member.name),el('span',member.phone||'無電話','muted'));
  if(group.leader!==member.name){const lead=el('button','設為'+leaderTerm,'secondary');lead.type='button';lead.dataset.mutation='true';lead.onclick=()=>change(()=>setGroupLeader(db,church,group,member),'確定將 '+member.name+' 設為'+leaderTerm+'？',leaderTerm+'已更新。');actions.append(lead);}
  const remove=el('button','移出','secondary');remove.type='button';remove.dataset.mutation='true';remove.onclick=()=>move(member,'未編組');actions.append(remove);row.append(head,el('p',group.leader===member.name?'目前'+leaderTerm:'一般成員','muted'),actions);current.append(row);
 }
 if([...available.options].some(o=>o.value===prior))available.value=prior;
 $('#group-count').textContent=group?'顯示 '+shown+' / '+count+' 位成員 · '+leaderTerm+'：'+(group.leader||'未設定'):'目前沒有可管理的'+term+'。';
 $('#available-count').textContent='找到 '+otherCount+' 位可調入成員。';if(!shown)current.append(el('p',group?(count?'沒有符合搜尋的成員。':'此'+term+'目前沒有成員。'):'請先建立'+term+'。','care-empty'));syncControls();
}
async function refresh(message=''){
 if(loading)return false;loading=true;const ticket=++generation;syncControls();$('#status').textContent='正在載入…';
 try{const [g,m]=await Promise.all([listGroups(db,church),listGroupMembers(db,church)]);if(ticket!==generation)return false;const prior=$('#group').value;groups=g;members=m;$('#group').replaceChildren(...groups.map(g=>new Option(g.name,g.id)));if(groups.some(g=>String(g.id)===prior))$('#group').value=prior;recovery=false;render();$('#status').textContent=message||'資料已載入。';return true;}
 catch(error){if(ticket===generation){recovery=true;if(/權限|登入/.test(error.message)){groups=[];members=[];$('#group').replaceChildren();render();}$('#status').textContent='清單尚未更新：'+error.message;}return false;}finally{if(ticket===generation){loading=false;syncControls();}}
}
async function change(write,question,success){
 if(busy||loading||recovery||!confirm(question))return;busy=true;syncControls();const ticket=generation;$('#status').textContent='正在儲存…';
 try{await write();if(ticket!==generation)return;const refreshed=await refresh(success);if(!refreshed&&ticket+1===generation)$('#status').textContent=success+'清單尚未更新，請重新讀取後再操作。';}
 catch(error){if(ticket===generation)$('#status').textContent=error.message;}finally{busy=false;syncControls();}
}
const move=(member,name)=>change(()=>assignMemberToGroup(db,church,member,name),'確定將 '+member.name+(name==='未編組'?' 移出目前'+term:' 調入 '+name)+'？','成員所屬已更新。');
$('#title').textContent=(church==='M+'?'M＋大雅教會':'火樂教會')+' · '+term+'成員管理';$('#back').href='groups.html?church='+encodeURIComponent(church||'');$('#group').onchange=render;$('#available').onchange=syncControls;for(const id of ['current-search','available-search'])$('#'+id).oninput=render;$('#reload').onclick=()=>{if(!busy&&!loading)void refresh();};$('#assign').onclick=()=>{const group=selectedGroup(),member=members.find(x=>String(x.id)===$('#available').value);if(group&&member)move(member,group.name);};
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){generation++;groups=[];members=[];loading=false;recovery=true;$('#group').replaceChildren();render();$('#status').textContent='已登出，請重新登入。';}});refresh();
