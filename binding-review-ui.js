import {db} from './admin-db.mjs?v=20261008-ios1';
import {loadRequests,findCandidates,reviewRequest} from './binding-review.mjs?v=20261006-mobile-stability1';
const church=new URLSearchParams(location.search).get('church');
const list=document.querySelector('#requests'),status=document.querySelector('#status');
let generation=0,busy=false;
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value??'';return el;};
function clear(){generation++;list.replaceChildren();document.querySelector('#request-count').textContent='';}
function filterRequests(){
 const query=document.querySelector('#request-search').value.trim().toLocaleLowerCase(),state=document.querySelector('#request-state').value,cards=[...list.querySelectorAll('article')];let visible=0;
 for(const card of cards){card.hidden=!(state==='all'||card.dataset.state===state)||!card.dataset.search.includes(query);if(!card.hidden)visible++;}
 document.querySelector('#request-count').textContent='顯示 '+visible+' / '+cards.length+' 筆已載入申請。';list.querySelector('.care-empty')?.remove();if(cards.length&&!visible){const note=text('p','沒有符合的申請，請調整搜尋或狀態。');note.className='care-empty';list.append(note);}
}

async function load(success=''){
  clear();const current=generation;status.textContent='正在確認權限…';
  try{
    const rows=await loadRequests(db,church);if(current!==generation)return;
    for(const row of rows){
      const card=text('article','');card.dataset.state=row.status;card.dataset.search=[row.applicant_name,row.applicant_phone].join(' ').toLocaleLowerCase();
      const names={pending:'待核對',approved:'已核准',rejected:'已拒絕',revoked:'已撤銷'};
      card.append(text('h2',row.applicant_name),text('p',`申請手機：${row.applicant_phone}`),text('p',names[row.status]||'未知狀態'));
      const result=text('p','');result.className='status-message';result.setAttribute('role','status');
      if(row.status==='pending'){
        let candidateRevision=0;const input=document.createElement('input');input.value=row.applicant_name;input.maxLength=80;input.setAttribute('aria-label','查詢會友姓名');
        const searchLabel=text('label','要綁定的會友姓名（可輸入部分姓名）');searchLabel.append(input);
        const hint=text('p','請確認姓名與本人身份。核准後，申請手機會寫入所選會友資料，並永久綁定這個 LINE 帳號。');
        const search=text('button','查詢會友'),select=document.createElement('select');search.type='button';select.setAttribute('aria-label','選擇核對過的會友');
        select.append(new Option('請先查詢並選擇會友',''));
        const verified=document.createElement('input');verified.type='checkbox';
        const label=text('label','我已確認本人身份，並同意寫入申請手機及綁定 LINE ');label.className='care-choice';label.append(verified);
        input.addEventListener('input',()=>{candidateRevision++;select.replaceChildren(new Option('請重新查詢會友',''));verified.checked=false;});
        search.addEventListener('click',async()=>{
          if(busy)return;const revision=++candidateRevision;search.disabled=true;select.replaceChildren(new Option('請選擇會友',''));verified.checked=false;
          try{const candidates=await findCandidates(db,church,input.value);if(current!==generation||revision!==candidateRevision)return;
            for(const member of candidates)select.append(new Option(`${member.name} · 電話 ${member.phone||'未填'} · 編號 ${member.id}`,String(member.id)));
            result.textContent=candidates.length?'最多顯示 30 筆；請核對姓名、電話與會友編號，系統不會自動選擇。':'查無相符會友。請確認姓名，或先到會友名冊建立資料。';
          }catch(error){if(current===generation&&revision===candidateRevision){result.textContent=error.message||'查詢未完成，請稍後再試。';}}
          finally{search.disabled=false;}
        });
        select.addEventListener('change',()=>{verified.checked=false;});
        const approve=text('button','核准綁定'),reject=text('button','拒絕申請');approve.type=reject.type='button';reject.className='secondary';
        approve.addEventListener('click',()=>{
          if(!select.value||!verified.checked){result.textContent='請選擇會友，並確認已核對本人身份。';return;}
          save(row.id,'approve',select.value);
        });
        reject.addEventListener('click',()=>save(row.id,'reject'));
        const actions=text('div','');actions.className='review-actions';actions.append(approve,reject);card.append(searchLabel,hint,search,select,label,actions);
      }else if(row.status==='approved'){
        const confirmed=document.createElement('input');confirmed.type='checkbox';
        const label=text('label','確認撤銷這筆綁定 ');label.className='care-choice';label.append(confirmed);
        const revoke=text('button','撤銷本人更新權限');revoke.type='button';revoke.className='secondary';
        revoke.addEventListener('click',()=>{if(!confirmed.checked){result.textContent='請先勾選確認撤銷。';return;}save(row.id,'revoke');});
        card.append(text('p',`會友編號：${row.member_id}`),label,revoke);
      }
      card.append(result);list.append(card);
    }
    if(rows.length){
      const pendingCount=rows.filter(row=>row.status==='pending').length;
      status.textContent=success+`共 ${rows.length} 筆申請，待處理 ${pendingCount} 筆。`;
    }else status.textContent=success+'目前沒有綁定申請。';filterRequests();
  }catch(error){if(current===generation){clear();status.textContent=success?success+'清單尚未更新，請重新載入，勿重複處理。':error.message;}}
}
async function save(id,action,member=null){
  if(busy)return;busy=true;document.querySelector('main').setAttribute('aria-busy','true');const current=generation,controls=[...list.querySelectorAll('button,input,select')],disabledStates=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);status.textContent='正在處理，請勿關閉頁面…';
  try{await reviewRequest(db,church,id,action,member);if(current===generation)await load(({approve:'綁定已核准。',reject:'申請已拒絕。',revoke:'綁定已撤銷。'})[action]);}
  catch(error){if(current===generation)status.textContent=error.message;}
  finally{busy=false;document.querySelector('main').setAttribute('aria-busy','false');if(current===generation)controls.forEach((control,index)=>{if(control.isConnected)control.disabled=disabledStates[index];});}
}
document.querySelector('#request-search').addEventListener('input',filterRequests);document.querySelector('#request-state').addEventListener('change',filterRequests);
document.querySelector('#reload').addEventListener('click',()=>{if(!busy)load();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else load();});
db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();status.textContent='已登出，請重新登入。';}});
load();

document.querySelector('#logout').addEventListener('click',async()=>{clear();await db.auth.signOut();location.replace('admin-login.html');});
