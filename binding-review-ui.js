import {db} from './admin-db.mjs';
import {loadRequests,findCandidates,reviewRequest} from './binding-review.mjs';
const church=new URLSearchParams(location.search).get('church');
const list=document.querySelector('#requests'),status=document.querySelector('#status');
let generation=0,busy=false;
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value??'';return el;};
function clear(){generation++;list.replaceChildren();}
async function load(){
  clear();const current=generation;status.textContent='正在確認權限…';
  try{
    const rows=await loadRequests(db,church);if(current!==generation)return;
    for(const row of rows){
      const card=text('article','');
      const names={pending:'待核對',approved:'已核准',rejected:'已拒絕',revoked:'已撤銷'};
      card.append(text('h2',row.applicant_name),text('p',`申請電話：${row.applicant_phone}`),text('p',names[row.status]||'未知狀態'));
      const result=text('p','');result.setAttribute('role','status');
      if(row.status==='pending'){
        const input=document.createElement('input');input.value=row.applicant_name;input.maxLength=80;input.setAttribute('aria-label','查詢完整會員姓名');
        const search=text('button','查詢會員'),select=document.createElement('select');select.setAttribute('aria-label','選擇核對過的會員');
        select.append(new Option('請先查詢並選擇會員',''));
        const verified=document.createElement('input');verified.type='checkbox';
        const label=text('label','我已透過既有聯絡方式核對本人身份 ');label.append(verified);
        search.addEventListener('click',async()=>{
          search.disabled=true;select.replaceChildren(new Option('請選擇會員',''));verified.checked=false;
          try{const candidates=await findCandidates(db,church,input.value);if(current!==generation)return;
            for(const member of candidates)select.append(new Option(`${member.name} · 電話 ${member.phone||'未填'} · 編號 ${member.id}`,String(member.id)));
            result.textContent=candidates.length?'最多顯示 30 筆；請仔細核對，系統不會自動選擇。':'沒有找到同名會員。';
          }catch(error){if(current===generation){clear();status.textContent=error.message;}}
          finally{search.disabled=false;}
        });
        select.addEventListener('change',()=>{verified.checked=false;});
        const approve=text('button','核准綁定'),reject=text('button','拒絕申請');
        approve.addEventListener('click',()=>{
          if(!select.value||!verified.checked){result.textContent='請選擇會員，並確認已核對本人身份。';return;}
          save(row.id,'approve',select.value);
        });
        reject.addEventListener('click',()=>save(row.id,'reject'));
        card.append(input,search,select,label,approve,reject);
      }else if(row.status==='approved'){
        const confirmed=document.createElement('input');confirmed.type='checkbox';
        const label=text('label','確認撤銷這筆綁定 ');label.append(confirmed);
        const revoke=text('button','撤銷本人更新權限');
        revoke.addEventListener('click',()=>{if(!confirmed.checked){result.textContent='請先勾選確認撤銷。';return;}save(row.id,'revoke');});
        card.append(text('p',`會員編號：${row.member_id}`),label,revoke);
      }
      card.append(result);list.append(card);
    }
    status.textContent=rows.length?'已載入最近 100 筆申請。':'目前沒有綁定申請。';
  }catch(error){if(current===generation){clear();status.textContent=error.message;}}
}
async function save(id,action,member=null){
  if(busy)return;busy=true;clear();const current=generation;status.textContent='正在處理…';
  try{await reviewRequest(db,church,id,action,member);if(current===generation)await load();}
  catch(error){if(current===generation)status.textContent=error.message;}
  finally{busy=false;}
}
document.querySelector('#reload').addEventListener('click',()=>{if(!busy)load();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else load();});
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();status.textContent='已登出，請重新登入。';}});
load();

document.querySelector('#logout').addEventListener('click',async()=>{clear();await db.auth.signOut();location.replace('admin-login.html');});
