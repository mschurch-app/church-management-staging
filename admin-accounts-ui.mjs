import {mountLineIdentityReview} from './admin-line-identity-review.mjs?v=20261022-line-identity1';
import {mountCoworkerApplications} from './admin-coworker-review.mjs?v=20261022-experience6';
import {applicationRPC} from './coworker-application-api.mjs?v=20261022-coworker-review1';
import {createWorkProfileEditor} from './work-profile.mjs?v=20261022-accounts-layout1';
import {FUNCTION_CATALOG,FUNCTION_GROUPS} from './app-function-definitions.mjs?v=20261022-testimonies1';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {PERMISSIONS,ROLE_TEMPLATES,HOME_MODULES,HOME_TEMPLATES,FEATURE_ACTIONS,permissionsForRole,listAdminAccounts,removeAdminAccount,saveAdminBundle} from './admin-accounts-management.mjs?v=20261021-work-roles1';
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
function homeSelection(row,target,role){const saved=(row.home_preferences||[]).find(item=>item.church_id===target)?.home_modules;return Array.isArray(saved)?saved:[...(HOME_TEMPLATES[role]||HOME_TEMPLATES.custom)];}
const HOME_ICONS=Object.fromEntries(Object.entries(FUNCTION_CATALOG).map(([key,item])=>[key,item.icon]));
const HOME_GROUPS=FUNCTION_GROUPS.map(group=>[group.title,key=>group.keys.includes(key)]);
function homeEditor(row,getTarget,getRole){const section=document.createElement('fieldset'),selected=el('div','','home-icon-grid'),available=el('div','','home-module-groups');let dragKey='';section.className='home-preference-editor';section.append(el('legend','首頁常用'),el('p','長按圖示拖曳排序；點減號移出首頁，再從下方加入需要的功能。','muted'));const tile=key=>{const card=el('div','','home-icon-tile');card.dataset.homeModule=key;card.dataset.iosIcon=key;card.draggable=true;const main=el('span','','home-icon-main'),icon=el('b',HOME_ICONS[key]||'•'),label=el('small',HOME_MODULES[key]||key),remove=el('button','−','home-icon-remove');main.append(icon,label);remove.type='button';remove.setAttribute('aria-label',`從常用移除${HOME_MODULES[key]}`);remove.onclick=()=>{card.remove();renderLibrary();};card.append(main,remove);return card;};const renderLibrary=()=>{const chosen=new Set([...selected.children].map(item=>item.dataset.homeModule));available.replaceChildren();for(const [groupName,matches] of HOME_GROUPS){const group=el('section','','home-module-group'),grid=el('div','','home-icon-library');for(const [key,label] of Object.entries(HOME_MODULES)){if(chosen.has(key)||!matches(key))continue;const button=el('button','','home-library-item');button.type='button';button.dataset.iosIcon=key;button.append(el('span',HOME_ICONS[key]||'•'),el('small',label),el('b','＋'));button.onclick=()=>{selected.append(tile(key));renderLibrary();};grid.append(button);}if(grid.children.length){group.append(el('h4',groupName),grid);available.append(group);}}};const render=keys=>{selected.replaceChildren();for(const key of keys)if(Object.hasOwn(HOME_MODULES,key))selected.append(tile(key));renderLibrary();};selected.addEventListener('dragstart',event=>{const card=event.target.closest('.home-icon-tile');if(!card)return;dragKey=card.dataset.homeModule;card.classList.add('dragging');});selected.addEventListener('dragend',event=>{event.target.closest('.home-icon-tile')?.classList.remove('dragging');dragKey='';});selected.addEventListener('dragover',event=>{event.preventDefault();const over=event.target.closest('.home-icon-tile'),dragged=selected.querySelector(`[data-home-module="${dragKey}"]`);if(over&&dragged&&over!==dragged)selected.insertBefore(dragged,over);});selected.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const card=event.target.closest('.home-icon-tile');if(!card)return;dragKey=card.dataset.homeModule;card.classList.add('dragging');card.setPointerCapture?.(event.pointerId);});selected.addEventListener('pointermove',event=>{if(!dragKey)return;const over=document.elementFromPoint(event.clientX,event.clientY)?.closest('.home-icon-tile'),dragged=selected.querySelector(`[data-home-module="${dragKey}"]`);if(over&&over.parentElement===selected&&dragged&&over!==dragged){const box=over.getBoundingClientRect(),after=event.clientY>box.top+box.height/2||event.clientX>box.left+box.width/2;selected.insertBefore(dragged,after?over.nextSibling:over);}});const endDrag=()=>{selected.querySelector('.dragging')?.classList.remove('dragging');dragKey='';};selected.addEventListener('pointerup',endDrag);selected.addEventListener('pointercancel',endDrag);const recommended=el('button','套用角色建議','secondary');recommended.type='button';recommended.onclick=()=>render(HOME_TEMPLATES[getRole()]||HOME_TEMPLATES.custom);section.append(el('h3','首頁排列'),selected,recommended,el('h3','加入其他功能'),available);const apply=()=>render(homeSelection(row,getTarget(),getRole())),values=()=>[...selected.children].map(item=>item.dataset.homeModule);apply();return {section,apply,values};}
function step(number,title,description,...contents){const section=el('section','','account-step');section.append(el('h3',number+' · '+title));if(description)section.append(el('p',description));section.append(...contents);return section;}
function advanced(title,...contents){const details=el('details','','account-advanced');details.append(el('summary',title),...contents);return details;}
function featureEditor(row,getTarget,getRole,getFeatures,hosts=[]){
 const section=document.createElement('fieldset'),grid=el('div'),boxes=[],drafts=new Map(),openStates=new Map();let renderedChurch=null;
 section.className='feature-permission-editor';section.append(el('legend','功能操作細項'),grid);section.hidden=hosts.length>0;
 const refresh=()=>{for(const summary of [...grid.querySelectorAll('[data-operation-summary]'),...hosts.flatMap(host=>[...host.querySelectorAll('[data-operation-summary]')])]){const selected=boxes.filter(b=>b.dataset.feature===summary.dataset.operationSummary&&b.checked).map(b=>FEATURE_ACTIONS[b.dataset.action]);summary.textContent=(hosts.length?'':(PERMISSIONS[summary.dataset.operationSummary]||summary.dataset.operationSummary)+' · ')+'操作權限 · '+(selected.join('、')||'尚未選擇');}};
 const apply=()=>{
  for(const box of boxes)drafts.set(renderedChurch+':'+box.dataset.feature+':'+box.dataset.action,box.checked);
  for(const details of [...grid.children,...hosts.flatMap(host=>[...host.querySelectorAll('.account-operation-details')])])if(details.dataset.operationFeature)openStates.set(renderedChurch+':'+details.dataset.operationFeature,details.open);
  grid.replaceChildren();for(const host of hosts)host.querySelector('.account-operation-details')?.remove();boxes.length=0;
  const target=getTarget(),savedMap=new Map((row.feature_permissions||[]).filter(item=>item.church_id===target).map(item=>[item.feature_key,item])),full=['pastor','pastor_spouse'].includes(getRole())||row.is_owner;renderedChurch=target;
  for(const feature of getFeatures()){
   const details=el('details','','account-operation-details'),summary=el('summary'),operations=el('div','','account-operation-grid');details.dataset.operationFeature=feature;details.open=openStates.get(target+':'+feature)||false;summary.dataset.operationSummary=feature;
   details.append(summary,operations);
   for(const [action,label]of Object.entries(FEATURE_ACTIONS)){
    const item=el('label','','action-choice'),box=document.createElement('input'),record=savedMap.get(feature),key=target+':'+feature+':'+action;box.type='checkbox';box.dataset.feature=feature;box.dataset.action=action;
    const existing=row.is_owner||(row.grants||[]).some(g=>g.church_id===target&&g.permission===feature);box.checked=drafts.has(key)?drafts.get(key):record?Boolean(record[action]):(action==='view'||existing&&(action==='create'||action==='edit'||full));box.onchange=refresh;item.append(box,el('span',label));operations.append(item);boxes.push(box);
   }
   (hosts.find(host=>host.dataset.permissionRow===feature)||grid).append(details);
  }
  refresh();
 };
 apply();return {section,boxes,apply,refresh};
}
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
  const area=$('#editor'),form=document.createElement('form'),grid=el('div','','edit-grid'),name=document.createElement('input'),title=document.createElement('input'),active=document.createElement('input'),activeLabel=el('label','','check-panel'),matrix=el('div','','permission-matrix');
  const savedRoles=new Map((row.roles||[]).map(r=>[r.church_id,r.role_key]));let home,feature,startScopeLoad=()=>{};
  area.replaceChildren();area.hidden=false;name.required=title.required=true;name.maxLength=title.maxLength=60;name.value=row.display_name||'';title.value=row.job_title||'管理同工';
  const nameLabel=el('label','姓名');nameLabel.append(name);const titleLabel=el('label','職稱');titleLabel.append(title);grid.append(nameLabel,titleLabel);
  active.type='checkbox';active.checked=row.is_active;active.disabled=row.is_owner;activeLabel.append(active,el('span',row.is_owner?'專案擁有者保持啟用':'啟用此同工帳號'));
  if(!row.is_owner){
    let scopeGeneration=0,scopesLoading=false,scopesReady=false;
    const assigned=[...new Set((row.roles||[]).map(r=>r.church_id).concat((row.grants||[]).map(g=>g.church_id)))],target=document.createElement('select'),role=document.createElement('select'),choices=el('div','','role-permission-grid'),section=document.createElement('fieldset');
    for(const value of ['M+','SHiNE']){const option=document.createElement('option');option.value=value;option.textContent=churchName(value);target.append(option);}
    target.value=assigned.includes(church)?church:(assigned[0]||church);
    for(const [key,template] of Object.entries(ROLE_TEMPLATES)){const option=document.createElement('option');option.value=key;option.textContent=template.label;role.append(option);}
    const boxes=[];
    for(const [permission,label] of Object.entries(PERMISSIONS)){const host=el('section','','account-feature'),item=el('label','','choice'),box=document.createElement('input');host.dataset.permissionRow=permission;box.type='checkbox';box.dataset.permission=permission;item.append(box,el('span',label));host.append(item);choices.append(host);boxes.push(box);}
    const selectedCount=el('p','','muted'),library=el('details','','account-function-library'),librarySummary=el('summary'),available=el('div','','role-permission-grid');library.append(librarySummary,available);
    const syncChoices=()=>{for(const box of boxes)(box.checked?choices:available).append(box.closest('.account-feature'));const count=boxes.filter(box=>box.checked).length;selectedCount.textContent='目前開啟 '+count+' 項功能';librarySummary.textContent='加入其他功能（'+(boxes.length-count)+' 項）';};
    const loadChurch=()=>{const targetChurch=target.value,chosen=new Set((row.grants||[]).filter(g=>g.church_id===targetChurch).map(g=>g.permission));role.value=savedRoles.get(targetChurch)||(chosen.size?'custom':'administrator');const allowed=chosen.size?chosen:new Set(permissionsForRole(role.value));for(const box of boxes)box.checked=allowed.has(box.dataset.permission);syncChoices();home?.apply();feature?.apply();};
    role.onchange=()=>{if(role.value!=='custom'){const allowed=new Set(permissionsForRole(role.value));for(const box of boxes)box.checked=allowed.has(box.dataset.permission);}syncChoices();home?.apply();feature?.apply();};
    for(const box of boxes)box.onchange=()=>{const chosen=new Set(boxes.filter(i=>i.checked).map(i=>i.dataset.permission)),expected=new Set(permissionsForRole(role.value));if(role.value!=='custom'&&(chosen.size!==expected.size||[...chosen].some(p=>!expected.has(p))))role.value='custom';if(box.dataset.permission==='schedules'&&!box.checked)form._serviceScopes?.scopeBoxes.forEach(scope=>scope.checked=false);syncChoices();feature?.apply();};
    target.onchange=loadChurch;loadChurch();
    const churchLabel=el('label','所屬堂會');churchLabel.append(target);const roleLabel=el('label','角色範本');roleLabel.append(role);section.append(el('legend','堂會與權限'),churchLabel,roleLabel,selectedCount,choices,library);matrix.append(section);
    form.dataset.accessEditor='1';form._access={target,role,boxes,syncChoices};
    const scopes=document.createElement('fieldset'),scopeChoices=el('div','','role-permission-grid'),scopeBoxes=[],scopeStatus=el('p','正在載入主日服事類別…','muted'),retry=el('button','重新載入服事類別','secondary');scopes.append(el('legend','服事意願與協調｜事工領袖'),el('p','由您指定同工負責的事工領域。同工登入後只能協調自己的領域，不能自行選擇或查看其他領域；只有鈺庭及牧者可統整全部。指定領域時會開啟「服事安排」查看權，不會給予全部班表的編輯權。','muted'));scopeStatus.setAttribute('role','status');retry.type='button';retry.hidden=true;
    for(const [key,label] of Object.entries({media:'影音',worship:'敬拜團',welcome:'接待',children:'兒童主日學',all:'行政總協調（全部類別）'})){const item=el('label','','choice'),box=document.createElement('input');box.type='checkbox';box.value=key;box.dataset.scope=key;item.append(box,el('span',label));scopeChoices.append(item);scopeBoxes.push(box);}
    const loadScopes=async()=>{const generation=++scopeGeneration,requestedChurch=target.value;scopesLoading=true;scopesReady=false;scopeStatus.textContent='正在載入主日服事類別…';retry.hidden=true;scopeChoices.querySelectorAll('input').forEach(box=>box.disabled=true);try{const {data,error}=await timeout(db.rpc('get_service_signup_scopes',{p_user:row.user_id,p_church:requestedChurch}),'讀取主日服事類別逾時。');if(generation!==scopeGeneration||!form.isConnected)return;if(error)throw error;scopeBoxes.forEach(box=>box.checked=(data||[]).includes(box.value));if(requestedChurch==='M+'&&(data||[]).some(scope=>scope!=='all'))limitToAssignedMinistries();scopesReady=true;scopeStatus.textContent='主日服事類別已載入。';form._updateReadiness?.();}catch(error){if(generation===scopeGeneration&&form.isConnected){scopeStatus.textContent='主日服事類別載入失敗，請重新載入。';retry.hidden=false;scopes.closest('details.account-advanced').open=true;$('#status').textContent='編輯表單已開啟；主日服事類別載入失敗，請按「重新載入服事類別」。';}}finally{if(generation===scopeGeneration&&form.isConnected){scopesLoading=false;scopeChoices.querySelectorAll('input').forEach(box=>box.disabled=!scopesReady);}}};
    const limitToAssignedMinistries=()=>{const scheduleGrant=boxes.find(box=>box.dataset.permission==='schedules');if(!scheduleGrant.checked){const retained=new Map((feature?.boxes||[]).map(box=>[box.dataset.feature+':'+box.dataset.action,box.checked]));scheduleGrant.checked=true;role.value='custom';syncChoices();feature?.apply();for(const box of feature?.boxes||[])if(box.dataset.feature!=='schedules'&&retained.has(box.dataset.feature+':'+box.dataset.action))box.checked=retained.get(box.dataset.feature+':'+box.dataset.action);}for(const box of feature?.boxes||[])if(box.dataset.feature==='schedules')box.checked=box.dataset.action==='view';feature?.refresh();};
    scopeBoxes.forEach(box=>box.addEventListener('change',()=>{if(!box.checked)return;if(box.value==='all')scopeBoxes.forEach(other=>{if(other!==box)other.checked=false;});else{scopeBoxes.find(other=>other.value==='all').checked=false;limitToAssignedMinistries();}}));
    retry.onclick=()=>void loadScopes();scopes.append(scopeChoices,scopeStatus,retry);const scopePanel=advanced('主日服事協調範圍（需要協調排班時設定）',scopes);matrix.append(scopePanel);form._serviceScopes={scopeBoxes,loadScopes,ready:()=>scopesReady&&!scopesLoading};target.addEventListener('change',()=>{scopePanel.hidden=target.value!=='M+';void loadScopes();});scopePanel.hidden=target.value!=='M+';startScopeLoad=()=>void loadScopes();
  }
  const getTarget=()=>row.is_owner?church:form._access.target.value,getRole=()=>row.is_owner?(title.value.includes('師母')?'pastor_spouse':'pastor'):form._access.role.value;
  const workProfile=createWorkProfileEditor(db,row.user_id,getTarget,{compact:true});form._workProfile=workProfile;form._access?.target.addEventListener('change',()=>void workProfile.load().then(()=>form._updateReadiness?.()));
  home=homeEditor(row,getTarget,getRole);form._home=home;
  const getFeatures=()=>row.is_owner?Object.keys(PERMISSIONS):form._access.boxes.filter(box=>box.checked).map(box=>box.dataset.permission);
  feature=featureEditor(row,getTarget,getRole,getFeatures,form._access?.boxes.map(box=>box.closest('.account-feature'))||[]);form._feature=feature;
  const actions=el('div','','editor-actions'),saveStatus=el('p','','form-message'),cancel=el('button','取消','secondary'),save=el('button','儲存同工設定');form.dataset.actionFeedback='off';saveStatus.setAttribute('role','status');saveStatus.setAttribute('aria-live','polite');save.type='submit';cancel.type='button';cancel.onclick=close;actions.append(cancel,save);
  const heading=el('div','','account-editor-heading'),back=el('button','返回名單','secondary');back.type='button';back.onclick=close;heading.append(el('h2','設定 '+(row.display_name||'同工')),back);
  form.append(heading,el('p','依序確認基本資料、事工分工及可使用功能，最後一次儲存。','account-editor-note'),step(1,'基本資料','姓名與職稱用來辨識同工；帳號停用後無法使用後台。',grid,activeLabel),step(2,'事工分工','指定實際負責的工作；這裡的分工不會自動授予其他功能。',workProfile.section));
  if(!row.is_owner)form.append(step(3,'可使用的功能','勾選能使用的功能；需要調整新增、修改或審核等操作時，再展開該功能的「操作權限」。',matrix));
  else form.append(step(3,'擁有者權限','此帳號為專案擁有者，保有完整權限，無須逐項勾選。'));
  const extra=advanced('進階設定：首頁常用與登入身分',home.section);if(row.is_owner)extra.append(feature.section);
  const identity=el('p','','muted');appendIdentityDetails(row,identity);extra.append(identity);form.append(extra);
  if(!row.is_owner){const remove=el('button','移除教會 OS 權限','danger');remove.type='button';remove.dataset.actionFeedback='off';remove.onclick=()=>removeRow(row,remove);const danger=advanced('停用或移除帳號',el('p','暫停使用可在基本資料取消「啟用此同工帳號」；移除權限會保留登入身分與會友資料。','muted'),remove);danger.classList.add('account-danger');form.append(danger);}
  form.append(saveStatus,actions);
  for(const event of ['input','change'])form.addEventListener(event,()=>{form.dataset.dirty='true';});
  let pendingSave=null;
  form.onsubmit=async event=>{
    event.preventDefault();
    if(busy)return;
    busy=true;save.disabled=true;save.textContent='正在儲存…';
    const setStep=(message,state='')=>{saveStatus.textContent=message;saveStatus.className='form-message '+state;save.textContent=state?'儲存同工設定':message.replace('…','');};
    try{
      let grants=[],roles=[];
      if(!row.is_owner){
        const {target,role,boxes}=form._access;
        grants=boxes.filter(box=>box.checked).map(box=>({church_id:target.value,permission:box.dataset.permission}));
        if(grants.length)roles=[{church_id:target.value,role_key:role.value}];
      }
      if(!row.is_owner&&active.checked&&!grants.length)throw new Error('啟用帳號前至少選擇一項功能權限。');
      const targetChurch=getTarget(),homeModules=home.values();
      const featureRows=getFeatures().map(featureKey=>{
        const record={feature_key:featureKey};
        for(const action of Object.keys(FEATURE_ACTIONS))record[action]=Boolean(feature.boxes.find(box=>box.dataset.feature===featureKey&&box.dataset.action===action)?.checked);
        return record;
      });
      if(!row.is_owner&&!form._serviceScopes.ready()){matrix.querySelector('details.account-advanced').open=true;throw new Error('主日服事類別尚未載入，請按「重新載入服事類別」後再儲存。');}
      const cleanName=name.value.trim(),cleanTitle=title.value.trim();if(!cleanName||!cleanTitle)throw new Error('姓名與職稱皆為必填。');
      const ministries=row.is_owner||targetChurch!=='M+'?[]:form._serviceScopes.scopeBoxes.filter(box=>box.checked).map(box=>box.value);
      if(ministries.length&& !grants.some(grant=>grant.permission==='schedules'))throw new Error('使用服事意願與協調前，請勾選「服事安排」。');
      const scheduleManage=featureRows.find(item=>item.feature_key==='schedules')?.manage===true,wasGlobal=(row.feature_permissions||[]).some(item=>item.church_id===targetChurch&&item.feature_key==='schedules'&&item.manage===true);
      if(ministries.some(ministry=>ministry!=='all')&&Object.entries(featureRows.find(item=>item.feature_key==='schedules')||{}).some(([action,enabled])=>action!=='view'&&action!=='feature_key'&&enabled===true))throw new Error('事工領袖只能查看一般班表；請取消下方「服事安排」的新增、修改、刪除、匯出、審核與管理操作。');
      if(!row.is_owner&&(scheduleManage||ministries.includes('all'))&&!wasGlobal)throw new Error('全部事工統整僅限鈺庭及牧者；請指定此同工實際負責的領域。');
      const input={display_name:cleanName,job_title:cleanTitle,active:row.is_owner?true:Boolean(active.checked),grants,roles,features:featureRows,home_modules:homeModules,notification_topics:(row.home_preferences||[]).find(item=>item.church_id===targetChurch)?.notification_topics||[],ministries,work_profile:workProfile.values()};
      const fingerprint=JSON.stringify([targetChurch,input]);
      if(!pendingSave||pendingSave.fingerprint!==fingerprint)pendingSave={fingerprint,id:crypto.randomUUID()};
      setStep('正在儲存完整設定…');
      const saved=await saveAdminBundle(db,row,targetChurch,input,pendingSave.id);
      row.version=saved.version;
      const success='同工設定已儲存，包含身分、事工分工與目前勾選的權限。';
      setStep(success,'success');$('#status').textContent=success;
      try{rows=await listAdminAccounts(db);render();$('#status').textContent=success;}catch{$('#status').textContent=success+' 名單可稍後重新整理。';}
      close(true);
    }catch(error){
      const message=error?.message||'同工資料未儲存，請再試一次。';setStep(message,'error');$('#status').textContent=message;
    }finally{
      busy=false;save.disabled=false;save.textContent='儲存同工設定';
    }
  };
  form._updateReadiness=()=>{if(form.isConnected&&!area.hidden&&workProfile.ready()&&(row.is_owner||form._serviceScopes.ready()))$('#status').textContent='設定資料已載入，請確認後按「儲存同工設定」。';};
  area.append(form);revealEditor(area,name);$('#status').textContent=row.is_owner?'已開啟同工基本資料。':'已開啟同工資料與權限，主日服事類別正在載入。';startScopeLoad();void workProfile.load().then(()=>form._updateReadiness());
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
 try{rows=await listAdminAccounts(db);if(generation!==directoryGeneration)return;render();$('#status').textContent='請選擇待審申請，或從名單找到要設定的同工。';
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
if(localPreview){rows=[{user_id:'preview-owner',is_active:true,display_name:'合成牧者',job_title:'牧師',grants:[],roles:[],is_owner:true,invitation_state:'active'},{user_id:'preview-admin',is_active:true,display_name:'合成同工',job_title:'行政同工',grants:permissionsForRole('administrator').map(permission=>({church_id:'M+',permission})),roles:[{church_id:'M+',role_key:'administrator'}],is_owner:false,invitation_state:'active'}];render();$('#application-count').textContent='0';$('#status').textContent='本機介面預覽，不會寫入資料庫。';}else void load();
