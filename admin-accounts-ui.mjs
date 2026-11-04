import {createPermissionControls} from './account-permission-controls.mjs?v=20261103-unifiedpermissions1';
import {mountLineIdentityReview} from './admin-line-identity-review.mjs?v=20261103-unifiedpermissions1';
import {mountCoworkerApplications} from './admin-coworker-review.mjs?v=20261103-unifiedpermissions1';
import {applicationRPC} from './coworker-application-api.mjs?v=20261103-unifiedpermissions1';
import {createWorkProfileEditor} from './work-profile.mjs?v=20261103-unifiedpermissions1';
import {FUNCTION_CATALOG,FUNCTION_GROUPS} from './app-function-definitions.mjs?v=20261104-potluck1';
import {db} from './admin-db.mjs?v=20261103-unifiedpermissions1';
import {PERMISSIONS,ROLE_TEMPLATES,HOME_MODULES,HOME_TEMPLATES,FEATURE_ACTIONS,permissionsForRole,listAdminAccounts,removeAdminAccount,saveAdminBundle} from './admin-accounts-management.mjs?v=20261103-unifiedpermissions1';
const search=new URLSearchParams(location.search),church=search.get('church')||'M+',localPreview=['127.0.0.1','localhost'].includes(location.hostname)&&search.get('preview')==='1',$=s=>document.querySelector(s);let rows=[],busy=false,reviewUser=/^[0-9a-f-]{36}$/i.test(search.get('review_user')||'')?search.get('review_user'):'';
const el=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=value;n.className=cls;return n;};
const churchName=value=>value==='M+'?'M＋大雅教會':'火樂教會';
const timeout=(promise,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),15000))]);
function close(force=false){const area=$('#editor');if(force!==true&&area.querySelector('form')?.dataset.dirty==='true'&&!confirm('還有尚未儲存的同工設定，確定放棄這次修改？'))return false;area.hidden=true;$('#accounts-directory').hidden=false;requestAnimationFrame(()=>setTimeout(()=>{if(area.hidden)area.replaceChildren();},120));}
function revealEditor(area,firstField){
  $('#accounts-directory').hidden=true;
  const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<760;
  requestAnimationFrame(()=>{
    area.scrollIntoView({behavior:mobile?'auto':'smooth',block:'start'});
    if(!mobile)firstField?.focus({preventScroll:true});else{area.tabIndex=-1;area.focus({preventScroll:true});}
  });
}
function step(number,title,description,...contents){const section=el('section','','account-step');section.append(el('h3',number+' · '+title));if(description)section.append(el('p',description));section.append(...contents);return section;}
function advanced(title,...contents){const details=el('details','','account-advanced');details.append(el('summary',title),...contents);return details;}
async function removeRow(row,button){
  if(busy||!confirm(`確定移除 ${row.display_name||row.email} 的教會 OS 權限？\n\n此人會立即失去後台權限；登入帳號與會友名冊資料都會保留。`))return;
  busy=true;
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='正在移除…';}
  $('#status').textContent='正在移除教會 OS 權限…';
  try{
    await timeout(removeAdminAccount(db,row),'移除權限逾時，請重新整理頁面確認結果。');
    rows=rows.filter(item=>item.user_id!==row.user_id);
    close(true);
    render();
    $('#status').textContent=`已移除 ${row.display_name||row.email} 的教會 OS 權限；登入帳號與會友資料均已保留。`;
  }catch(error){
    $('#status').textContent=error.message;
  }finally{
    busy=false;
    if(button?.isConnected){button.disabled=false;button.textContent=original;}
  }
}
async function accountForm(row){
 const area=$('#editor'),form=el('form'),name=el('input'),title=el('input'),active=el('input'),target=el('select'),status=el('p','','form-message'),save=el('button','儲存權限'),cancel=el('button','返回名單','secondary');let alive=true,scopeReady=false,scopeGeneration=0,pendingSave=null;
 area.replaceChildren();area.hidden=false;form.dataset.actionFeedback='off';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 name.value=row.display_name||'';title.value=row.job_title||'同工';name.required=title.required=true;name.maxLength=title.maxLength=60;active.type='checkbox';active.checked=row.is_active;active.disabled=row.is_owner;
 for(const ch of ['M+','SHiNE'])target.append(new Option(churchName(ch),ch));target.value=row.is_owner?church:((row.grants||[]).some(g=>g.church_id===church)?church:row.grants?.[0]?.church_id||church);target.disabled=row.is_owner;
 const field=(label,input)=>{const wrap=el('label',label);wrap.append(input);return wrap;},grid=el('div','','edit-grid');grid.append(field('姓名',name),field('職稱',title),field('所屬堂會',target),field('啟用帳號',active));
 const getTarget=()=>target.value,oldRole=(row.roles||[]).find(r=>r.church_id===target.value)?.role_key||'custom',controls=row.is_owner?null:createPermissionControls(row,getTarget,HOME_TEMPLATES[oldRole]||HOME_TEMPLATES.custom);
 const heading=el('div','','account-editor-heading');cancel.type='button';cancel.onclick=()=>{if(close()!==false)alive=false;};heading.append(el('h2','設定 '+(row.display_name||'同工')),cancel);form.append(heading,el('p','勾選後即開放對應功能；首頁、功能中心與搜尋會自動依權限呈現。','account-editor-note'),step(1,'同工資料','',grid));
 if(controls)form.append(step(2,'勾選權限','勾「查看」會開放入口；新增、修改、刪除、匯出與審核分開勾選。部分功能共用資料權限，包含項目列在下方。',controls.section));else form.append(step(2,'擁有者','系統擁有者保有完整權限，無須勾選。'));
 const scopeBoxes=[],scopeState=el('p','','muted'),retry=el('button','重新載入服事範圍','secondary'),scopeArea=el('fieldset');scopeArea.append(el('legend','服事協調範圍'),el('p','指定實際協調的事工；領袖僅查看一般班表，並在指定領域協調。','muted'));
 for(const [key,label]of Object.entries({media:'影音',worship:'敬拜團',welcome:'接待',children:'兒童主日學',all:'行政總協調（全部類別）'})){const box=el('input');box.type='checkbox';box.value=key;scopeBoxes.push(box);scopeArea.append(field(label,box));box.onchange=()=>{if(!box.checked)return;if(key==='all')scopeBoxes.forEach(b=>{if(b!==box)b.checked=false;});else{scopeBoxes.find(b=>b.value==='all').checked=false;controls.setScheduleViewOnly();}};}
 const scopeDetails=advanced('服事協調範圍',scopeArea,scopeState,retry);retry.type='button';
 async function loadScopes(){const ticket=++scopeGeneration,ch=getTarget();scopeReady=false;scopeDetails.hidden=row.is_owner||ch!=='M+';if(scopeDetails.hidden){scopeReady=true;return;}scopeState.textContent='正在載入…';scopeBoxes.forEach(b=>b.disabled=true);try{const r=await timeout(db.rpc('get_service_signup_scopes',{p_user:row.user_id,p_church:ch}),'讀取服事範圍逾時。');if(!alive||ticket!==scopeGeneration||!form.isConnected)return;if(r.error)throw r.error;scopeBoxes.forEach(b=>b.checked=(r.data||[]).includes(b.value));scopeReady=true;scopeState.textContent='已載入。';}catch{if(alive&&ticket===scopeGeneration)scopeState.textContent='載入失敗，請重試；尚未改動任何設定。';}finally{if(ticket===scopeGeneration)scopeBoxes.forEach(b=>b.disabled=!scopeReady);}}
 retry.onclick=loadScopes;
 const work=createWorkProfileEditor(db,row.user_id,getTarget,{compact:true}),identity=el('p','','muted');appendIdentityDetails(row,identity);form.append(scopeDetails,advanced('職位、事工分工與工作提醒',work.section),advanced('登入身分',identity));
 if(!row.is_owner){const remove=el('button','移除教會 OS 權限','danger');remove.type='button';remove.onclick=()=>removeRow(row,remove);form.append(advanced('停用或移除',el('p','停用可取消上方「啟用帳號」；移除權限保留登入及會友資料。','muted'),remove));}
 const actions=el('div','','editor-actions');save.type='submit';actions.append(save);form.append(status,actions);for(const event of ['input','change'])form.addEventListener(event,event=>{if(!event.target.hasAttribute('data-permission-search'))form.dataset.dirty='true';});
 target.onchange=()=>{controls?.apply();void loadScopes();void work.load();};controls?.section.addEventListener('change',()=>controls.clearScopesIfNeeded(scopeBoxes));
 form.onsubmit=async event=>{event.preventDefault();if(busy||!alive)return;busy=true;const fields=[...form.querySelectorAll('input,select,button')],disabled=fields.map(n=>n.disabled);fields.forEach(n=>n.disabled=true);save.textContent='正在儲存…';status.textContent='正在儲存整份權限設定…';
 try{
  if(!scopeReady||!work.ready())throw Error('設定資料尚未載入完成，請重新載入失敗的區塊後再儲存。');
  const ch=getTarget(),featureRows=controls?.features()||[],grants=featureRows.map(r=>({church_id:ch,permission:r.feature_key}));
  if(!row.is_owner&&active.checked&&!grants.length){const any=controls.moduleValues().length||Object.values(controls.financeValues()).some(Boolean)||controls.expenseValues().length;if(!any)throw Error('啟用帳號前至少勾選一項功能或操作權限。');grants.push({church_id:ch,permission:'portal'});}
  const ministries=row.is_owner||ch!=='M+'?[]:scopeBoxes.filter(b=>b.checked).map(b=>b.value),schedule=featureRows.find(r=>r.feature_key==='schedules');
  if(ministries.length&&!schedule?.view)throw Error('請先勾選服事安排的查看權限。');
  if(ministries.some(k=>k!=='all')&&Object.entries(schedule||{}).some(([k,v])=>k!=='view'&&k!=='feature_key'&&v===true))throw Error('事工領袖僅查看一般班表；協調指定領域時，請取消服事安排的其他操作。');
  const input={display_name:name.value.trim(),job_title:title.value.trim(),active:row.is_owner||active.checked,grants,roles:row.is_owner||!grants.length?[]:[{church_id:ch,role_key:'custom'}],features:featureRows,home_modules:row.is_owner?((row.home_preferences||[]).find(h=>h.church_id===ch)?.home_modules||HOME_TEMPLATES[row.job_title?.includes('師母')?'pastor_spouse':'pastor']||[]):controls.homeValues(),notification_topics:(row.home_preferences||[]).find(h=>h.church_id===ch)?.notification_topics||[],ministries,work_profile:work.values()};
  if(!row.is_owner&&ch==='M+'&&active.checked){input.finance={version:row.finance_version,permissions:controls.financeValues()};input.expenses={version:row.expense_version,roles:controls.expenseValues()};}
  const fingerprint=JSON.stringify([ch,input]);if(!pendingSave||pendingSave.fingerprint!==fingerprint)pendingSave={fingerprint,id:crypto.randomUUID()};
  const saved=await saveAdminBundle(db,row,ch,input,pendingSave.id);if(!alive||!form.isConnected)return;row.version=saved.version;form.dataset.dirty='false';status.textContent='權限已儲存。';$('#status').textContent='權限已儲存，功能選項會依授權自動呈現。';alive=false;close(true);try{rows=await listAdminAccounts(db);render();}catch{$('#status').textContent='權限已儲存；名單讀取失敗，請重新整理確認。';}
 }catch(e){if(alive&&form.isConnected){status.textContent=e.message||'儲存失敗，設定仍保留。';$('#status').textContent=status.textContent;}}
 finally{busy=false;if(form.isConnected){fields.forEach((n,i)=>n.disabled=disabled[i]);save.textContent='儲存權限';}}
 };
 area.append(form);revealEditor(area,name);$('#status').textContent='已開啟同工權限，正在讀取事工資料。';void loadScopes();void work.load();
}
function appendIdentityDetails(row, identity){
  identity.append(el('strong',row.display_name||row.email||'LINE 同工'),el('span',row.job_title||'管理同工','muted'));
  if(!row.email&&row.retired_email){
    identity.append(el('small',`原 Email 登入：${row.retired_email}（已停用）`,'muted'));
    identity.append(el('small','已合併為單一 LINE 同工，請使用 LINE 登入。','muted'));
  }else{
    if(row.email)identity.append(el('small',row.email,'muted'));
    if(row.linked_user_ids?.length)identity.append(el('small','Email 與 LINE 身分已核對','muted'));
  }
  if(row.identity_review_required)identity.append(el('small','LINE 登入身分待核對','muted'));
}
let directorySelected=false,directoryGeneration=0;
function showDirectory(kind,manual=false){
 if(manual)directorySelected=true;
 for(const key of ['applications','accounts']){const selected=kind===key;$('#'+key+'-panel').hidden=!selected;const button=$('#'+key+'-tab');button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
}
function render(){
 const area=$('#items'),query=$('#account-search').value.trim().toLocaleLowerCase(),target=$('#account-church').value,state=$('#account-state').value;area.replaceChildren();
 const visible=rows.filter(row=>(!query||[row.display_name,row.job_title].some(value=>String(value||'').toLocaleLowerCase().includes(query)))&&(target==='all'||row.is_owner||(row.grants||[]).some(g=>g.church_id===target)||(row.roles||[]).some(r=>r.church_id===target))&&(state==='all'||(state==='active'?row.is_active:!row.is_active)));
 $('#account-count').textContent=String(rows.length);$('#account-results').textContent='顯示 '+visible.length+' 位同工';
 if(!visible.length)area.append(el('p','沒有符合條件的同工，請調整姓名、堂會或帳號狀態。','muted'));
 for(const row of visible){
  const card=el('article','','admin-account-card'),copy=el('div'),head=el('div','','admin-profile-head'),identity=el('div','','admin-profile-copy'),badge=el('span',row.is_owner?'擁有者':row.is_active?'已啟用':'未啟用','status-badge');
  identity.append(el('strong',row.display_name||'LINE 同工'),el('span',row.job_title||'同工','muted'));head.append(identity,badge);copy.append(head);
  const assigned=['M+','SHiNE'].filter(ch=>row.is_owner||(row.grants||[]).some(g=>g.church_id===ch));
  const summary=row.is_owner?'擁有者 · 完整權限':assigned.map(ch=>churchName(ch)+' · '+(row.grants||[]).filter(g=>g.church_id===ch).length+' 項功能').join('／')||'尚未指定功能';copy.append(el('p',summary,'account-overview'));
  if(row.identity_review_required)copy.append(el('small','LINE 身分待核對','muted'));
  const actions=el('div','','admin-card-actions'),edit=el('button','設定','secondary');edit.type='button';edit.setAttribute('aria-label','設定 '+(row.display_name||'同工'));edit.onclick=async()=>{if(edit.disabled)return;edit.disabled=true;try{await accountForm(row);}catch(error){$('#status').textContent='無法開啟設定：'+error.message;}finally{edit.disabled=false;}};actions.append(edit);
  if(row.identity_review_required&&row.line_user_id){const verify=el('a','核對 LINE 身分','secondary');verify.href='admin-accounts.html?church='+encodeURIComponent(church)+'&review_user='+encodeURIComponent(row.line_user_id);actions.append(verify);}
  card.append(copy,actions);area.append(card);
 }
}
async function lineReview(){
 if(!reviewUser)return;
 const area=$('#editor');area.hidden=false;$('#status').textContent='請核對同工姓名與 LINE 暱稱，再確認是否為本人。';
 await mountLineIdentityReview(db,area,reviewUser,{
  onBack:()=>{reviewUser='';const url=new URL(location.href);url.searchParams.delete('review_user');history.replaceState(null,'',url);close(true);showDirectory('accounts',true);},
  onSaved:async()=>{rows=await listAdminAccounts(db);render();}
 });
 if(reviewUser)revealEditor(area);
}
async function load(){
 const generation=++directoryGeneration;close(true);$('#status').textContent='正在確認帳號管理權限…';
 const applicationsRequest=applicationRPC(db,'list_coworker_applications').then(data=>({data}),error=>({error}));
 try{rows=await listAdminAccounts(db);if(generation!==directoryGeneration)return;render();$('#status').textContent='選擇同工，勾選開放的功能與操作，最後儲存。';
  void mountCoworkerApplications(db,$('#applications'),{accounts:rows,applicationsRequest,onSaved:load,onLoaded:count=>{if(generation!==directoryGeneration)return;$('#application-count').textContent=String(count);if(!directorySelected)showDirectory(count?'applications':'accounts');}});
  if(reviewUser){await lineReview();if(reviewUser)$('#accounts-directory').hidden=true;}
 }catch(error){$('#items').replaceChildren();$('#applications').replaceChildren();$('#accounts-directory').hidden=true;$('#status').textContent=error.message;}
}
$('#members').href='church-settings.html?church='+encodeURIComponent(church);
$('#account-church').value=['M+','SHiNE'].includes(church)?church:'all';
for(const id of ['account-search','account-church','account-state'])$('#'+id).addEventListener(id==='account-search'?'input':'change',render);
for(const kind of ['applications','accounts']){
 const tab=$('#'+kind+'-tab');tab.onclick=()=>showDirectory(kind,true);
 tab.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'applications':event.key==='End'?'accounts':kind==='accounts'?'applications':'accounts';showDirectory(next,true);$('#'+next+'-tab').focus();};
}
let verifiedActor=null;db.auth?.onAuthStateChange?.((event,session)=>{const actor=session?.user?.id||null,changed=verifiedActor&&actor&&verifiedActor!==actor;if(actor)verifiedActor=actor;if(['SIGNED_OUT','USER_DELETED'].includes(event)||changed){directoryGeneration++;rows=[];busy=false;close(true);$('#items').replaceChildren();$('#applications').replaceChildren();$('#status').textContent='登入身分已變更，請重新載入權限設定。';if(event==='SIGNED_OUT')verifiedActor=null;}});
if(localPreview){rows=[{user_id:'preview-owner',is_active:true,display_name:'合成牧者',job_title:'牧師',grants:[],roles:[],is_owner:true,invitation_state:'active'},{user_id:'preview-admin',is_active:true,display_name:'合成同工',job_title:'行政同工',grants:permissionsForRole('administrator').map(permission=>({church_id:'M+',permission})),roles:[{church_id:'M+',role_key:'administrator'}],is_owner:false,invitation_state:'active'}];render();$('#application-count').textContent='0';$('#status').textContent='本機介面預覽，不會寫入資料庫。';}else void load();

