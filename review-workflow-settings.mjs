import {db} from './admin-db.mjs?v=20261009-app-audit1';
import {readAccess,canOpen} from './admin-access.mjs?v=20261009-app-audit1';
const $=s=>document.querySelector(s),church=new URLSearchParams(location.search).get('church')||'M+',status=$('#status'),root=$('#workflows');
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
let payload={people:[],workflows:[],can_manage:false},busy=false;
function mergeLinkedPeople(data){
  const groups=new Map(),aliases=new Map(),people=[];
  for(const item of Array.isArray(data.people)?data.people:[]){
    const key=String(item.name||'').trim().replace(/\s+/g,'')||'id:'+item.id;
    groups.set(key,[...(groups.get(key)||[]),item]);
  }
  for(const group of groups.values()){
    const emailOnly=group.filter(item=>item.email&&!item.has_line),lineOnly=group.filter(item=>!item.email&&item.has_line);
    if(group.length===2&&emailOnly.length===1&&lineOnly.length===1){
      const canonical={...lineOnly[0],email:emailOnly[0].email,linked_ids:group.map(item=>item.id)};
      people.push(canonical);
      for(const item of group)aliases.set(item.id,canonical.id);
    }else{
      people.push(...group);
      for(const item of group)aliases.set(item.id,item.id);
    }
  }
  return {...data,people,workflows:(Array.isArray(data.workflows)?data.workflows:[]).map(item=>({...item,initial_reviewer_id:aliases.get(item.initial_reviewer_id)||item.initial_reviewer_id,final_reviewer_id:aliases.get(item.final_reviewer_id)||item.final_reviewer_id}))};
}
function person(id){return payload.people.find(item=>item.id===id)}
function reviewerField(label,value,workflow,kind){const wrap=el('label',label),select=document.createElement('select'),state=el('small','','reviewer-state');select.append(new Option('請選擇同工',''));for(const p of payload.people)select.append(new Option(p.name+(p.email?'｜'+p.email:'')+(p.has_line?'｜LINE 已連結':'｜無 LINE ID'),p.id));select.value=value||'';const update=()=>{const p=person(select.value);state.textContent=!p?'尚未選擇':p.has_line?'App 可用・LINE ID 可用':'App 可用・尚無 LINE ID';state.className='reviewer-state '+(!p?'':p.has_line?'ok':'missing');};select.onchange=update;update();select.dataset.kind=kind;wrap.append(select,state);return wrap}
function render(){root.replaceChildren();for(const workflow of payload.workflows){const card=el('article','','workflow-card'),heading=el('h2',workflow.label),copy=el('p','依序由初審人確認，再交由複審人核准。'),reviewers=el('div','','reviewer-grid'),initial=reviewerField('初審人',workflow.initial_reviewer_id,workflow,'initial'),final=reviewerField('複審人',workflow.final_reviewer_id,workflow,'final'),channelTitle=el('div','通知方式','channel-title'),channels=el('div','','channel-grid'),app=document.createElement('input'),line=document.createElement('input');app.type=line.type='checkbox';app.checked=workflow.notify_app;line.checked=workflow.notify_line;const appLabel=el('label','','channel-choice'),lineLabel=el('label','','channel-choice');appLabel.append(app,el('span','App 推播'));lineLabel.append(line,el('span','LINE 通知'));channels.append(appLabel,lineLabel);reviewers.append(initial,final);for(const input of [...reviewers.querySelectorAll('select'),app,line])input.disabled=!payload.can_manage;const save=el('button','儲存這項審核流程');save.disabled=!payload.can_manage;save.onclick=async()=>{if(busy)return;const initialId=initial.querySelector('select').value,finalId=final.querySelector('select').value;if(!initialId||!finalId){status.textContent='請選擇初審人與複審人。';return}if(initialId===finalId){status.textContent='初審與複審必須由不同同工負責。';return}if(!app.checked&&!line.checked){status.textContent='至少選擇一種通知方式。';return}if(line.checked){const missing=[person(initialId),person(finalId)].filter(p=>!p?.has_line).map(p=>p?.name||'未選擇');if(missing.length){status.textContent='無法啟用 LINE 通知：'+missing.join('、')+' 尚無 LINE ID。';return}}busy=true;save.disabled=true;try{const result=await db.rpc('save_review_workflow_setting',{p_church:church,p_workflow:workflow.key,p_initial:initialId,p_final:finalId,p_app:app.checked,p_line:line.checked});busy=false;save.disabled=!payload.can_manage;if(result.error){status.textContent='設定未儲存：'+result.error.message;return}if(result.data?.saved!==true){status.textContent='無法啟用 LINE 通知：'+(result.data?.missing_names||[]).join('、')+' 尚無 LINE ID。';return}workflow.initial_reviewer_id=initialId;workflow.final_reviewer_id=finalId;workflow.notify_app=app.checked;workflow.notify_line=line.checked;status.textContent=workflow.label+'已儲存。'}catch{status.textContent='設定未完成，請檢查網路後重試。';}finally{busy=false;save.disabled=!payload.can_manage;}};card.append(heading,copy,reviewers,channelTitle,channels,save);root.append(card)}}
async function load(){if(!['M+','SHiNE'].includes(church)||!canOpen(await readAccess(db),church,'notification_settings')){status.textContent='沒有審核流程設定權限。';return}const result=await db.rpc('get_review_workflow_settings',{p_church:church});if(result.error){status.textContent='無法載入審核流程設定。';return}payload=mergeLinkedPeople(result.data||{});render();if(!payload.workflows.length){status.textContent='此堂會尚未設定審核流程，請洽專案擁有者。';return;}status.textContent=payload.can_manage?'請逐項設定初審、複審與通知方式。':'目前為唯讀檢視。'}
document.querySelectorAll('.page-nav a').forEach(link=>{const url=new URL(link.href);url.searchParams.set('church',church);link.href=url.href;});$('#dashboard').href='admin-dashboard.html?church='+encodeURIComponent(church);load().catch(error=>{status.textContent=error.message||'無法載入審核流程，請重新整理。';});
