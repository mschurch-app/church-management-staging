import {applicationRPC} from './coworker-application-api.mjs?v=20261022-coworker2';
import {PERMISSION_LABELS,ROLE_TEMPLATES,HOME_TEMPLATES,FEATURE_ACTIONS} from './app-function-definitions.mjs?v=20261022-experience3';
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
const labeled=(text,input)=>{const n=el('label',text);n.append(input);return n;};
const churchName=key=>key==='M+'?'M＋大雅教會':'火樂教會';
export async function mountCoworkerApplications(db,area,{accounts=[],onSaved=()=>{}}={}){
 area.replaceChildren(el('h2','LINE 同工帳號申請'));area.className='coworker-applications';
 const status=el('p','正在讀取待審核申請…','muted');status.setAttribute('role','status');status.setAttribute('aria-live','polite');area.append(status);
 let applications;
 try{applications=await applicationRPC(db,'list_coworker_applications');if(!Array.isArray(applications))throw Error('申請名單暫時無法讀取。');}
 catch(error){status.textContent=error.message;const retry=el('button','重新讀取申請','secondary');retry.type='button';retry.onclick=()=>void mountCoworkerApplications(db,area,{accounts,onSaved});area.append(retry);return;}
 status.textContent=applications.length?`共 ${applications.length} 筆待審核。請核對本人身分，再指定權限或連結既有同工。`:'目前沒有待審核的申請。';
 for(const row of applications){
  const card=el('article'),details=el('details'),summary=el('summary','審核這筆申請');
  card.append(el('h3',row.full_name),el('p',churchName(row.church_id)+'｜'+(row.ministry||'事工待確認')),
   el('small','LINE 顯示名稱：'+(row.line_name||'未提供')),
   el('small','手機：'+(row.mobile||'未填寫')),
   el('p',row.applicant_note||'無補充說明','muted'));
  const form=el('form','','application-review-form'),decision=el('select'),note=el('textarea'),newArea=el('section'),linkArea=el('section');
  decision.required=true;for(const [key,label] of [['','請選擇審核方式'],['approve','建立新同工並指定權限'],['link','確認為既有同工，連結原有權限'],['reject','退回補充資料']])decision.append(new Option(label,key));
  const name=el('input'),title=el('input'),role=el('select'),permissionArea=el('div');name.value=row.full_name;name.maxLength=title.maxLength=60;title.value='同工';
  for(const [key,template] of Object.entries(ROLE_TEMPLATES))role.append(new Option(template.label,key));role.value='custom';
  const permissions=[];
  for(const [key,label] of Object.entries(PERMISSION_LABELS)){
   const group=el('section','','application-permission'),enabled=el('input');enabled.type='checkbox';enabled.dataset.applicationPermission=key;
   group.append(labeled(label,enabled));const actions=el('div','','application-operation-grid'),boxes={};
   for(const [action,label] of Object.entries(FEATURE_ACTIONS)){const box=el('input');box.type='checkbox';box.checked=action==='view';box.disabled=true;box.dataset.applicationAction=key+':'+action;boxes[action]=box;actions.append(labeled(label,box));}
   const sync=()=>{for(const box of Object.values(boxes))box.disabled=!enabled.checked;};enabled.onchange=sync;
   permissions.push({key,enabled,boxes,sync});group.append(actions);permissionArea.append(group);
  }
  role.onchange=()=>{const allowed=new Set(ROLE_TEMPLATES[role.value]?.permissions||[]);for(const p of permissions){p.enabled.checked=allowed.has(p.key);p.sync();}};
  newArea.append(labeled('核准使用姓名',name),labeled('職稱',title),labeled('角色範本',role),el('p','預設未勾選任何功能。選擇角色可帶入建議功能；操作預設只查看，請逐項確認需要新增、修改或審核的權限。','muted'),permissionArea);
  const existing=el('select');existing.append(new Option('請選擇確認為同一人的既有同工',''));
  for(const account of accounts.filter(a=>a.is_active&&a.user_id!==row.user_id&&(a.is_owner||a.grants?.some(g=>g.church_id===row.church_id))))existing.append(new Option((account.display_name||account.email||'未命名同工')+'｜'+(account.job_title||'同工'),account.user_id));
  const confirmed=el('input');confirmed.type='checkbox';linkArea.append(labeled('既有同工',existing),labeled('我已核對，這個 LINE 與所選同工是同一人',confirmed));
  newArea.hidden=linkArea.hidden=true;note.maxLength=500;
  decision.onchange=()=>{newArea.hidden=decision.value!=='approve';linkArea.hidden=decision.value!=='link';name.required=title.required=decision.value==='approve';existing.required=confirmed.required=decision.value==='link';note.required=decision.value==='reject';};
  const feedback=el('p','','form-message');feedback.setAttribute('role','status');const submit=el('button','確認審核並儲存');submit.type='submit';
  form.append(labeled('審核方式',decision),newArea,linkArea,labeled('審核說明（退回時必填）',note),feedback,submit);form.dataset.actionFeedback='off';
  form.onsubmit=async event=>{
   event.preventDefault();if(submit.disabled||!form.reportValidity())return;
   let input=null;
   if(decision.value==='approve'){
    const chosen=permissions.filter(p=>p.enabled.checked);
    if(!chosen.length){feedback.textContent='至少選擇一項功能權限後，才能核准新同工。';return;}
    if(chosen.some(p=>!p.boxes.view.checked)){feedback.textContent='已選功能需具備查看權限，請逐項確認。';return;}
    input={display_name:name.value.trim(),job_title:title.value.trim(),active:true,
     grants:chosen.map(p=>({church_id:row.church_id,permission:p.key})),roles:[{church_id:row.church_id,role_key:role.value}],
     features:chosen.map(p=>({feature_key:p.key,...Object.fromEntries(Object.entries(p.boxes).map(([action,box])=>[action,box.checked]))})),
     home_modules:HOME_TEMPLATES[role.value]||[],notification_topics:[],ministries:[]};
   }
   submit.disabled=true;submit.setAttribute('aria-busy','true');feedback.textContent='正在儲存審核結果，請稍候…';
   try{
    const result=await applicationRPC(db,'review_coworker_application',{p_user:row.user_id,p_expected_version:row.updated_at,p_decision:decision.value,p_input:input,p_source_user:decision.value==='link'?existing.value:null,p_note:note.value.trim()});
    if(!['approved','rejected'].includes(result?.status))throw Error('審核結果尚未確認，請重新讀取申請。');
    card.replaceChildren(el('p',row.full_name+(result.status==='approved'?' 的同工申請已核准。':' 的申請已退回補充資料。')));
    await onSaved();
   }catch(error){feedback.textContent=error.message;submit.disabled=false;}
   finally{submit.removeAttribute('aria-busy');}
  };
  details.append(summary,form);card.append(details);area.append(card);
 }
}
