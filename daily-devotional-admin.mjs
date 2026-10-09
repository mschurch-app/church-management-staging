import {db} from './admin-db.mjs?v=20261009-stage3';
import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261009-stage1';
import {node as el,lockControls,workflowSummary,apiResult,uncertainWrite,draftGuard,reviewDialog} from './app-workflow.mjs?v=20261009-stage3';

const ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/daily-devotional-admin';
const $=selector=>document.querySelector(selector),labels={draft:'草稿',initial_review:'待初審',spouse_review:'待複審',final_review:'待終審',approved:'已核准',returned:'退回修改',archived:'已封存'};
let token='',items=[],reviewerStage='viewer',selectedId=null,busy=false,recovery=false,canManageContent=false;
const guard=draftGuard(document.querySelector('#list'),dirty=>{const state=document.querySelector('.workflow-save-state');if(state){state.textContent=dirty?'有尚未儲存的修改':'已儲存';state.dataset.dirty=String(dirty);}});
function status(text,tone=''){const area=$('#status');area.textContent=text;area.dataset.tone=tone;}
async function api(action,extra={}){
  const session=(await db.auth.getSession()).data.session;token=session?.access_token||'';
  if(!token)throw new Error('login_required');
  const response=await fetch(ENDPOINT,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action,...extra}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)}),data=await apiResult(response);
  if(!response.ok||!data.ok){const error=new Error(data.error||'unavailable');error.code=data.error;throw error;}return data;
}
function nextStep(item){
  const stage={initial_review:0,draft:0,returned:0,spouse_review:1,final_review:2,approved:3,archived:3}[item?.review_status]??0;
  workflowSummary($('#workflow'),{title:item?`${item.devotional_date} · ${labels[item.review_status]||item.review_status}`:'每日靈修工作區',description:recovery?'請重新載入確認最新結果，再繼續編輯或審核。':item?.review_status==='approved'?'內容已核准。修改內容後會重新進入初審。':'先閱讀經文與靈修內容；修改儲存後重新送初審，通過後依序交下一位審核人。',steps:['初審','複審','終審','核准'],active:stage});
}
function field(form,label,key,value,multiline=true){const wrap=el('label',label),input=document.createElement(multiline?'textarea':'input');input.name=key;input.value=value||'';input.required=true;input.maxLength=['devotional_title','selected_scripture_reference'].includes(key)?300:5000;wrap.append(input);form.append(wrap);}
function editor(item,card){
  if(busy||recovery||!canManageContent)return;
  const form=el('form','','devotional-editor');form.dataset.actionFeedback='off';form.append(el('p','各欄位皆須填寫；聖經版本、來源與授權說明會一併檢查。','muted'));
  const groups=[['經文與出處',[['標題','devotional_title',false],['精選經文出處','selected_scripture_reference',false],['精選經文','scripture_text',true]]],['聖經版本與授權',[['聖經版本','scripture_version',false],['經文來源','scripture_source',false],['授權說明','scripture_license_note',true]]],['靈修內容',[['經文背景','context_summary',true],['三個重點','key_points',true],['反思問題','reflection_questions',true],['生活應用','life_application',true],['回應禱告','response_prayer',true]]]];
  for(const [title,fields] of groups){const group=el('fieldset');group.append(el('legend',title));for(const [label,key,multi] of fields)field(group,label,key,item[key],multi);form.append(group);}
  const actions=el('div','','devotional-actions'),save=el('button','儲存並重新送初審'),cancel=el('button','取消編輯','secondary'),saveState=el('p','尚未修改','workflow-save-state');save.type='submit';cancel.type='button';actions.append(save,cancel);form.append(saveState,actions);card.append(form);

  cancel.onclick=()=>{if(!busy&&guard.canLeave()){guard.clear();form.remove();card.querySelector('[data-edit]').focus();}};
  form.onsubmit=async event=>{event.preventDefault();if(busy||recovery)return;const values=Object.fromEntries(new FormData(form));await mutate('content_update',{id:item.id,values},'內容已儲存，已重新送初審。');};
  form.querySelector('input')?.focus();
}
async function mutate(action,payload,message){
  if(busy||recovery)return;busy=true;const unlock=lockControls($('.review-panel'));status(action==='content_update'?'正在儲存靈修內容…':'正在更新審核狀態…');let committed=false;
  try{await api(action,payload);committed=true;guard?.clear();await loadItems();status(message,'success');}
  catch(error){if(committed||uncertainWrite(error)){recovery=true;renderList();nextStep(items.find(item=>item.id===selectedId));status(committed?'操作已完成，但最新清單暫時無法載入。請按「重新載入」確認結果。':'連線中斷，尚無法確認是否完成。請重新載入確認結果，再進行操作。','error');}
    else status(error.code==='wrong_reviewer'?'此階段須由指定審核人員處理。':error.code==='licensing_required'?'請填妥聖經版本、來源與授權說明後再發布。':'操作未完成，內容已保留，請稍後重試。','error');}
  finally{busy=false;unlock();if(recovery)$('#list').querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=true);}
}
async function review(item,toStatus,card){
  if(busy||recovery)return;if(guard?.dirty&&card.querySelector('.devotional-editor')){status('請先儲存或取消編輯，再進行審核。','error');return;}
  const note=card.querySelector('.review-note').value.trim();if(toStatus==='returned'&&!note){status('請填寫退回原因。','error');card.querySelector('.review-note').focus();return;}
  if(toStatus==='approved'){const accepted=await reviewDialog({title:'核准這篇靈修？',description:`${item.devotional_date}「${item.devotional_title}」核准後將依既有設定發布。`,withNote:false,confirmLabel:'核准發布'});if(accepted===null)return;}
  await mutate('content_review',{id:item.id,toStatus,comment:note},toStatus==='returned'?'已退回修改，請依意見調整。':toStatus==='approved'?'靈修內容已核准。':'本階段審核完成，已交下一階段。');
}
function renderList(){
  const area=$('#devotional-records'),query=$('#devotional-search').value.trim().toLowerCase(),filter=$('#devotional-filter').value;area.replaceChildren();
  const visible=items.filter(item=>(!filter||item.review_status===filter)&&`${item.devotional_date} ${item.devotional_title} ${item.selected_scripture_reference}`.toLowerCase().includes(query));
  for(const item of visible){const button=el('button','','devotional-choice secondary');button.type='button';button.dataset.id=item.id;button.disabled=recovery;button.setAttribute('aria-pressed',String(item.id===selectedId));button.append(el('small',item.devotional_date+' · '+(labels[item.review_status]||item.review_status)),el('strong',item.devotional_title));button.onclick=()=>{if(busy||recovery||item.id===selectedId)return;if(guard&&!guard.canLeave())return;guard?.clear();selectedId=item.id;renderList();renderDetail();$('#devotional-content').focus({preventScroll:true});};area.append(button);}
  $('#result-count').textContent=`${visible.length} 篇`;if(!visible.length)area.append(el('p',items.length?'沒有符合的內容，請調整搜尋或狀態。':'目前尚未匯入一月內容。','workflow-empty'));
}
function renderDetail(){
  const area=$('#list');guard.clear();area.replaceChildren();const item=items.find(row=>row.id===selectedId);nextStep(item);if(!item){area.append(el('p','從內容清單選擇一篇，開始閱讀或編輯。','workflow-empty'));return;}
  const card=el('article','','devotional-item'),head=el('div','','devotional-head'),copy=el('div');copy.append(el('h3',item.devotional_title),el('p',`${item.selected_scripture_reference}｜${item.roots_reading||''}${item.branches_reading?'・'+item.branches_reading:''}${item.fruit_reading?'・'+item.fruit_reading:''}`));head.append(copy,el('span',labels[item.review_status]||item.review_status,'review-badge'));card.append(head);
  const detail=el('section','','devotional-detail');for(const [title,value] of [['精選經文',item.scripture_text],['經文背景',item.context_summary],['三個重點',item.key_points],['反思問題',item.reflection_questions],['生活應用',item.life_application],['回應禱告',item.response_prayer]]){detail.append(el('h4',title),el('p',value||'尚未填寫','devotional-copy'));}card.append(detail);
  const note=document.createElement('textarea');note.className='review-note';note.placeholder='退回時請填寫原因；通過時可留空。';note.setAttribute('aria-label','審核意見（通過時選填）');note.maxLength=2000;
  const actions=el('div','','devotional-actions'),edit=el('button','編輯內容','secondary');edit.dataset.edit='';edit.type='button';edit.onclick=()=>{if(!card.querySelector('.devotional-editor'))editor(item,card);};edit.hidden=!canManageContent;actions.append(edit);
  let next=null;if(['draft','initial_review','returned'].includes(item.review_status)&&reviewerStage==='initial')next=['spouse_review','初審通過，送複審'];if(item.review_status==='spouse_review'&&reviewerStage==='second')next=['final_review','複審通過，送終審'];if(item.review_status==='final_review'&&reviewerStage==='final')next=['approved','終審核准發布'];
  if(next&&canManageContent){const pass=el('button',next[1]);pass.type='button';pass.dataset.review=next[0];pass.onclick=()=>review(item,next[0],card);actions.append(pass);if(!['returned','approved','archived'].includes(item.review_status)){const back=el('button','退回修改','secondary');back.type='button';back.dataset.review='returned';back.onclick=()=>review(item,'returned',card);actions.append(back);}const label=el('label','審核意見（通過時選填）');label.append(note);card.append(label);}else card.append(el('p','本篇由目前階段的指定審核人處理。','muted'));
  card.append(actions,el('p','','item-status'));area.append(card);
}
function render(){const counts=items.reduce((out,item)=>(out[item.review_status]=(out[item.review_status]||0)+1,out),{});$('#summary').textContent=`待初審 ${counts.initial_review||0} · 待複審 ${counts.spouse_review||0} · 待終審 ${counts.final_review||0} · 核准 ${counts.approved||0}`;renderList();renderDetail();}
async function loadItems(){const result=await api('content_list',{from:'2027-01-01',to:'2027-01-31'});items=result.items||[];reviewerStage=result.reviewerStage||'viewer';if(!items.some(item=>item.id===selectedId))selectedId=items[0]?.id||null;recovery=false;render();}
async function start(){if(busy)return;busy=true;$('#devotional-reload').disabled=true;try{const access=await readAccess(db);if(!canOpen(access,'M+','tree_reading_admin'))throw new Error('forbidden');canManageContent=canAction(access,'M+','tree_reading_admin','approve');await loadItems();status('內容已載入。請選擇日期，閱讀或編輯後交下一階段。','success');}catch(error){recovery=true;if(error.code==='forbidden'||['forbidden','login_required'].includes(error.message)){items=[];canManageContent=false;render();}$('#list').querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=true);renderList();status(error.message==='forbidden'?'您沒有每日靈修管理權限。':error.message==='login_required'?'登入已失效，請重新登入。':'目前無法載入每日靈修，請按「重新載入」再試。','error');}finally{busy=false;$('#devotional-reload').disabled=false;}}
$('#devotional-search').oninput=renderList;$('#devotional-filter').onchange=renderList;$('#devotional-reload').onclick=()=>{if(!busy&&(!guard||guard.canLeave())){guard?.clear();start();}};
$('#logout').onclick=async()=>{if(busy||guard&&!guard.canLeave())return;guard?.clear();await db.auth.signOut();location.replace('admin-login.html');};start();
