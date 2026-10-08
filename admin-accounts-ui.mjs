import {db} from './admin-db.mjs?v=20261008-ios2';
import {PERMISSIONS,ROLE_TEMPLATES,HOME_MODULES,HOME_TEMPLATES,FEATURE_ACTIONS,permissionsForRole,listAdminAccounts,inviteAdmin,addExistingAdmin,removeAdminAccount,resendAdminInvite,saveAdminProfile,saveAdminAccess,saveHomePreferences,saveFeaturePermissions} from './admin-accounts-management.mjs?v=20261008-admin-actions2';
const search=new URLSearchParams(location.search),church=search.get('church')||'M+',reviewUser=/^[0-9a-f-]{36}$/i.test(search.get('review_user')||'')?search.get('review_user'):'',localPreview=['127.0.0.1','localhost'].includes(location.hostname)&&search.get('preview')==='1',$=s=>document.querySelector(s);let rows=[],busy=false;
const el=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=value;n.className=cls;return n;};
const churchName=value=>value==='M+'?'M＋大雅教會':'火樂教會';
const timeout=(promise,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),15000))]);
function close(){const area=$('#editor');area.hidden=true;requestAnimationFrame(()=>setTimeout(()=>{if(area.hidden)area.replaceChildren();},120));}
function revealEditor(area,firstField){
  const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<760;
  requestAnimationFrame(()=>{
    area.scrollIntoView({behavior:mobile?'auto':'smooth',block:'start'});
    if(!mobile)firstField?.focus({preventScroll:true});
  });
}
function homeSelection(row,target,role){const saved=(row.home_preferences||[]).find(item=>item.church_id===target)?.home_modules;return Array.isArray(saved)?saved:[...(HOME_TEMPLATES[role]||HOME_TEMPLATES.custom)];}
const HOME_ICONS={members:'👥',newcomer_care:'🌱',pastoral_workspace:'🤝',private_prayers:'🙏',pastoral_chats:'💬',attendance:'✅',groups:'🫶',schedules:'📅',spaces:'📍',inventory:'📦',heat_camp:'🏀',website_weekly:'🌐',website_group_resources:'📚',tree_reading_admin:'🌳',binding_review:'🔗',notification_settings:'🔔',school:'🎒',school_checkin:'📷',school_schedules:'🗓️',school_rollcall:'✅',school_students:'🧑‍🎓',school_counseling:'💛',school_reports:'🖨️',basketball:'🏀',basketball_gamecenter:'🏆',basketball_tactics:'📋',basketball_assignments:'🎯',basketball_schedule:'📆',basketball_daily:'💪',system_monitor:'📊',church_settings:'⚙️'};
const HOME_GROUPS=[['教會',key=>!key.startsWith('school')&&!key.startsWith('basketball')&&!['notification_settings','system_monitor','church_settings'].includes(key)],['課輔',key=>key.startsWith('school')],['籃球隊',key=>key.startsWith('basketball')],['系統設定',key=>['notification_settings','system_monitor','church_settings'].includes(key)]];
function homeEditor(row,getTarget,getRole){const section=document.createElement('fieldset'),selected=el('div','','home-icon-grid'),available=el('div','','home-module-groups');let dragKey='';section.className='home-preference-editor';section.append(el('legend','首頁常用'),el('p','長按圖示拖曳排序；點減號移出首頁，再從下方加入需要的功能。','muted'));const tile=key=>{const card=el('div','','home-icon-tile');card.dataset.homeModule=key;card.draggable=true;const main=el('span','','home-icon-main'),icon=el('b',HOME_ICONS[key]||'•'),label=el('small',HOME_MODULES[key]||key),remove=el('button','−','home-icon-remove');main.append(icon,label);remove.type='button';remove.onclick=()=>{card.remove();renderLibrary();};card.append(main,remove);return card;};const renderLibrary=()=>{const chosen=new Set([...selected.children].map(item=>item.dataset.homeModule));available.replaceChildren();for(const [groupName,matches] of HOME_GROUPS){const group=el('section','','home-module-group'),grid=el('div','','home-icon-library');for(const [key,label] of Object.entries(HOME_MODULES)){if(chosen.has(key)||!matches(key))continue;const button=el('button','','home-library-item');button.type='button';button.append(el('span',HOME_ICONS[key]||'•'),el('small',label),el('b','＋'));button.onclick=()=>{selected.append(tile(key));renderLibrary();};grid.append(button);}if(grid.children.length){group.append(el('h4',groupName),grid);available.append(group);}}};const render=keys=>{selected.replaceChildren();for(const key of keys)if(Object.hasOwn(HOME_MODULES,key))selected.append(tile(key));renderLibrary();};selected.addEventListener('dragstart',event=>{const card=event.target.closest('.home-icon-tile');if(!card)return;dragKey=card.dataset.homeModule;card.classList.add('dragging');});selected.addEventListener('dragend',event=>{event.target.closest('.home-icon-tile')?.classList.remove('dragging');dragKey='';});selected.addEventListener('dragover',event=>{event.preventDefault();const over=event.target.closest('.home-icon-tile'),dragged=selected.querySelector(`[data-home-module="${dragKey}"]`);if(over&&dragged&&over!==dragged)selected.insertBefore(dragged,over);});selected.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const card=event.target.closest('.home-icon-tile');if(!card)return;dragKey=card.dataset.homeModule;card.classList.add('dragging');card.setPointerCapture?.(event.pointerId);});selected.addEventListener('pointermove',event=>{if(!dragKey)return;const over=document.elementFromPoint(event.clientX,event.clientY)?.closest('.home-icon-tile'),dragged=selected.querySelector(`[data-home-module="${dragKey}"]`);if(over&&over.parentElement===selected&&dragged&&over!==dragged){const box=over.getBoundingClientRect(),after=event.clientY>box.top+box.height/2||event.clientX>box.left+box.width/2;selected.insertBefore(dragged,after?over.nextSibling:over);}});const endDrag=()=>{selected.querySelector('.dragging')?.classList.remove('dragging');dragKey='';};selected.addEventListener('pointerup',endDrag);selected.addEventListener('pointercancel',endDrag);const recommended=el('button','套用角色建議','secondary');recommended.type='button';recommended.onclick=()=>render(HOME_TEMPLATES[getRole()]||HOME_TEMPLATES.custom);section.append(el('h3','首頁排列'),selected,recommended,el('h3','加入其他功能'),available);const apply=()=>render(homeSelection(row,getTarget(),getRole())),values=()=>[...selected.children].map(item=>item.dataset.homeModule);apply();return {section,apply,values};}
function featureEditor(row,getTarget,getRole,getFeatures){const section=document.createElement('fieldset'),grid=el('div','','feature-action-grid'),boxes=[];section.className='feature-permission-editor';section.append(el('legend','各頁面可使用的操作'),el('p','逐頁設定查看、新增、修改、刪除、匯出、審核與管理設定。','muted'));const apply=()=>{grid.replaceChildren();boxes.length=0;const target=getTarget(),saved=(row.feature_permissions||[]).filter(item=>item.church_id===target),savedMap=new Map(saved.map(item=>[item.feature_key,item])),full=['pastor','pastor_spouse'].includes(getRole())||row.is_owner;for(const feature of getFeatures()){const line=el('div','','feature-action-row');line.append(el('strong',PERMISSIONS[feature]||feature));for(const [action,label] of Object.entries(FEATURE_ACTIONS)){const item=el('label','','action-choice'),box=document.createElement('input'),record=savedMap.get(feature);box.type='checkbox';box.dataset.feature=feature;box.dataset.action=action;box.checked=record?Boolean(record[action]):(action==='view'||action==='create'||action==='edit'||full);item.append(box,el('span',label));line.append(item);boxes.push(box);}grid.append(line);}};section.append(grid);apply();return {section,boxes,apply};}
async function removeRow(row,button){
  if(busy||!confirm(`確定移除 ${row.display_name||row.email} 的管理員資格？\n\n此人會立即失去後台權限；登入帳號與會友名冊資料都會保留。`))return;
  busy=true;
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent='正在移除…';}
  $('#status').textContent='正在移除管理員資格…';
  try{
    await timeout(removeAdminAccount(db,row),'移除管理員逾時，請重新整理頁面確認結果。');
    rows=rows.filter(item=>item.user_id!==row.user_id);
    close();
    render();
    $('#status').textContent=`已移除 ${row.display_name||row.email} 的管理員資格；登入帳號與會友資料均已保留。`;
  }catch(error){
    $('#status').textContent=error.message;
  }finally{
    busy=false;
    if(button?.isConnected){button.disabled=false;button.textContent=original;}
  }
}
async function resendRow(row){if(busy||!confirm(`要重新寄送管理員邀請給 ${row.email} 嗎？\n\n舊連結會失效，請對方使用最新一封信。`))return;busy=true;try{$('#status').textContent='正在重新寄送邀請…';await resendAdminInvite(db,row);$('#status').textContent=`已重新寄送中文邀請信到 ${row.email}；請對方使用最新一封信設定密碼。`;}catch(error){$('#status').textContent=error.message;}finally{busy=false;}}
function addForm(){const area=$('#editor'),form=document.createElement('form'),grid=el('div','','edit-grid'),name=document.createElement('input'),title=document.createElement('input'),email=document.createElement('input'),target=document.createElement('select'),role=document.createElement('select'),permissions=el('div','','invite-permission-preview'),actions=el('div','','editor-actions'),cancel=el('button','取消','secondary'),save=el('button','寄送邀請並建立權限'),existing=el('button','已有系統登入帳號，直接授權','secondary');area.replaceChildren();area.hidden=false;name.required=title.required=email.required=true;name.maxLength=title.maxLength=60;name.placeholder='例如：王小明';title.value='管理同工';email.type='email';email.placeholder='同工的登入 Email';for(const value of ['M+','SHiNE']){const option=document.createElement('option');option.value=value;option.textContent=churchName(value);target.append(option);}target.value=['M+','SHiNE'].includes(church)?church:'M+';for(const [key,template] of Object.entries(ROLE_TEMPLATES)){if(key==='custom')continue;const option=document.createElement('option');option.value=key;option.textContent=template.label;role.append(option);}role.value='administrator';const labeled=(text,input)=>{const label=el('label',text);label.append(input);return label;};const showPermissions=()=>{permissions.replaceChildren(el('strong','將取得的功能權限'));for(const permission of permissionsForRole(role.value))permissions.append(el('span','✓ '+PERMISSIONS[permission]));};role.onchange=showPermissions;showPermissions();grid.append(labeled('姓名',name),labeled('職稱',title),labeled('登入 Email',email),labeled('所屬堂會',target),labeled('角色',role));cancel.type=existing.type='button';cancel.onclick=close;existing.onclick=async()=>{if(busy)return;busy=true;try{await addExistingAdmin(db,email.value);close();await load();$('#status').textContent='既有系統登入帳號已取得管理員資格；請開啟該帳號補齊姓名、職稱與堂會權限。';}catch(error){$('#status').textContent=error.message;}finally{busy=false;}};actions.append(cancel,save);form.append(el('h2','新增管理員'),el('p','管理員不需要先存在於會友名冊。系統會寄出中文邀請信，請對方自行設定密碼；接受邀請前不會啟用管理權限。','muted'),grid,permissions,actions,existing);form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=true;try{await inviteAdmin(db,{email:email.value,display_name:name.value,job_title:title.value,church_id:target.value,role_key:role.value});close();await load();$('#status').textContent=`邀請已寄到 ${email.value.trim()}。對方設定密碼後，${churchName(target.value)}權限會正式啟用。`;}catch(error){$('#status').textContent=error.message;}finally{busy=false;save.disabled=false;}};area.append(form);area.scrollIntoView({behavior:'smooth',block:'start'});name.focus();}
async function accountForm(row){
  const area=$('#editor'),form=document.createElement('form'),grid=el('div','','edit-grid'),name=document.createElement('input'),title=document.createElement('input'),active=document.createElement('input'),activeLabel=el('label','','check-panel'),matrix=el('div','','permission-matrix');
  const savedRoles=new Map((row.roles||[]).map(r=>[r.church_id,r.role_key]));let home,feature;
  area.replaceChildren();area.hidden=false;name.required=title.required=true;name.maxLength=title.maxLength=60;name.value=row.display_name||'';title.value=row.job_title||'管理同工';
  const nameLabel=el('label','姓名');nameLabel.append(name);const titleLabel=el('label','職稱');titleLabel.append(title);grid.append(nameLabel,titleLabel);
  active.type='checkbox';active.checked=row.is_active;active.disabled=row.is_owner;activeLabel.append(active,el('span',row.is_owner?'專案擁有者保持啟用':'啟用此管理員帳號'));
  if(!row.is_owner){
    const assigned=[...new Set((row.roles||[]).map(r=>r.church_id).concat((row.grants||[]).map(g=>g.church_id)))],target=document.createElement('select'),role=document.createElement('select'),choices=el('div','','role-permission-grid'),section=document.createElement('fieldset');
    for(const value of ['M+','SHiNE']){const option=document.createElement('option');option.value=value;option.textContent=churchName(value);target.append(option);}
    target.value=assigned.includes(church)?church:(assigned[0]||church);
    for(const [key,template] of Object.entries(ROLE_TEMPLATES)){const option=document.createElement('option');option.value=key;option.textContent=template.label;role.append(option);}
    const boxes=[];
    for(const [permission,label] of Object.entries(PERMISSIONS)){const item=el('label','','choice'),box=document.createElement('input');box.type='checkbox';box.dataset.permission=permission;item.append(box,el('span',label));choices.append(item);boxes.push(box);}
    const loadChurch=()=>{const targetChurch=target.value,chosen=new Set((row.grants||[]).filter(g=>g.church_id===targetChurch).map(g=>g.permission));role.value=savedRoles.get(targetChurch)||(chosen.size?'custom':'administrator');const allowed=chosen.size?chosen:new Set(permissionsForRole(role.value));for(const box of boxes)box.checked=allowed.has(box.dataset.permission);home?.apply();feature?.apply();};
    role.onchange=()=>{if(role.value!=='custom'){const allowed=new Set(permissionsForRole(role.value));for(const box of boxes)box.checked=allowed.has(box.dataset.permission);}home?.apply();feature?.apply();};
    for(const box of boxes)box.onchange=()=>{const chosen=new Set(boxes.filter(i=>i.checked).map(i=>i.dataset.permission)),expected=new Set(permissionsForRole(role.value));if(role.value!=='custom'&&(chosen.size!==expected.size||[...chosen].some(p=>!expected.has(p))))role.value='custom';feature?.apply();};
    target.onchange=loadChurch;loadChurch();
    const churchLabel=el('label','所屬堂會');churchLabel.append(target);const roleLabel=el('label','角色範本');roleLabel.append(role);section.append(el('legend','堂會與權限'),churchLabel,roleLabel,choices);matrix.append(section);
    form.dataset.accessEditor='1';form._access={target,role,boxes};
    const scopes=document.createElement('fieldset'),scopeChoices=el('div','','role-permission-grid'),scopeBoxes=[];scopes.append(el('legend','主日服事負責類別'),el('p','只勾選負責的類別；這些同工進入服事登記後台時，只會看到並管理勾選的類別。','muted'));
    for(const [key,label] of Object.entries({media:'影音',worship:'敬拜團',welcome:'接待',children:'兒童主日學'})){const item=el('label','','choice'),box=document.createElement('input');box.type='checkbox';box.value=key;box.dataset.scope=key;item.append(box,el('span',label));scopeChoices.append(item);scopeBoxes.push(box);}
    const loadScopes=async()=>{scopeChoices.querySelectorAll('input').forEach(box=>box.disabled=true);try{const {data,error}=await db.rpc('get_service_signup_scopes',{p_user:row.user_id,p_church:target.value});if(error)throw error;scopeBoxes.forEach(box=>box.checked=(data||[]).includes(box.value));}catch(error){throw new Error('無法載入此同工的主日服事類別，請重新開啟編輯畫面。');}finally{scopeChoices.querySelectorAll('input').forEach(box=>box.disabled=false);}};
    scopes.append(scopeChoices);matrix.append(scopes);form._serviceScopes={scopeBoxes,loadScopes};target.addEventListener('change',loadScopes);await loadScopes();
  }
  const getTarget=()=>row.is_owner?church:form._access.target.value,getRole=()=>row.is_owner?(title.value.includes('師母')?'pastor_spouse':'pastor'):form._access.role.value;
  home=homeEditor(row,getTarget,getRole);form._home=home;
  const getFeatures=()=>row.is_owner?Object.keys(PERMISSIONS):form._access.boxes.filter(box=>box.checked).map(box=>box.dataset.permission);
  feature=featureEditor(row,getTarget,getRole,getFeatures);form._feature=feature;
  const actions=el('div','','editor-actions'),saveStatus=el('p','','form-message'),cancel=el('button','取消','secondary'),save=el('button','儲存管理員資料');form.dataset.actionFeedback='off';save.type='submit';cancel.type='button';cancel.onclick=close;actions.append(cancel);if(!row.is_owner){const remove=el('button','移除管理員資格','danger');remove.type='button';remove.dataset.actionFeedback='off';remove.onclick=()=>removeRow(row,remove);actions.append(remove);}actions.append(save);form.append(el('h2','編輯 '+(row.display_name||row.email)),grid,activeLabel);if(!row.is_owner)form.append(matrix);form.append(saveStatus,actions);
  form.insertBefore(home.section,actions);form.insertBefore(feature.section,actions);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(busy)return;
    busy=true;save.disabled=true;save.textContent='正在儲存…';
    const setStep=(message,state='')=>{saveStatus.textContent=message;saveStatus.className='form-message '+state;save.textContent=state?'儲存管理員資料':message.replace('…','');};
    const saveRpc=async(name,args,errorMessage)=>{const result=await timeout(db.rpc(name,args),errorMessage.replace('未儲存','儲存逾時'));if(result.error||result.data!==true)throw new Error(result.error?.message||errorMessage);};
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
      setStep('正在儲存每頁操作權限…');
      await saveRpc('set_admin_feature_permissions',{p_user:row.user_id,p_church:targetChurch,p_permissions:featureRows},'操作權限未儲存，請再試一次。');
      setStep('正在儲存基本資料…');
      const cleanName=name.value.trim(),cleanTitle=title.value.trim();if(!cleanName||!cleanTitle)throw new Error('姓名與職稱皆為必填。');
      await saveRpc('set_admin_account_profile',{p_user:row.user_id,p_display_name:cleanName,p_job_title:cleanTitle},'基本資料未儲存，請再試一次。');
      setStep('正在儲存首頁設定…');
      await saveRpc('set_admin_home_preferences',{p_user:row.user_id,p_church:targetChurch,p_home_modules:homeModules,p_notification_topics:[]},'首頁設定未儲存，請再試一次。');
      if(!row.is_owner){
        setStep('正在儲存堂會權限…');
        await saveRpc('set_admin_account_access_v3',{p_user:row.user_id,p_active:Boolean(active.checked),p_grants:grants,p_roles:roles},'堂會權限未儲存，請再試一次。');
        const ministries=form._serviceScopes.scopeBoxes.filter(box=>box.checked).map(box=>box.value);
        setStep('正在儲存主日服事負責類別…');
        const scopeResult=await timeout(db.rpc('set_service_signup_scopes',{p_user:row.user_id,p_church:targetChurch,p_ministries:ministries}),'主日服事負責類別儲存逾時，請再按一次儲存。');
        if(scopeResult.error||scopeResult.data!==true)throw new Error(scopeResult.error?.message||'主日服事負責類別未儲存，請重新整理後再試。');
      }
      const success='管理員資料、首頁版面、頁面操作與服事類別權限已儲存。';
      setStep(success,'success');$('#status').textContent=success;
      await new Promise(resolve=>setTimeout(resolve,650));close();
      requestAnimationFrame(()=>setTimeout(async()=>{try{rows=await listAdminAccounts(db);render();$('#status').textContent=success;}catch{$('#status').textContent=success+' 名單可稍後重新整理。';}},180));
    }catch(error){
      const message=error?.message||'管理員資料未儲存，請再試一次。';setStep(message,'error');$('#status').textContent=message;
    }finally{
      busy=false;save.disabled=false;save.textContent='儲存管理員資料';
    }
  };
  area.append(form);revealEditor(area,name);
}
function render(){const area=$('#items');area.replaceChildren();for(const row of rows){const card=el('article','','admin-account-card'),head=el('div','','admin-profile-head'),avatar=el('span',(row.display_name||row.email||'管').trim().slice(0,1).toUpperCase(),'admin-profile-avatar'),identity=el('div','','admin-profile-copy'),badge=el('span',row.is_owner?'專案擁有者':row.invitation_state==='pending'?'等待接受邀請':row.is_active?'已啟用':'已停用','status-badge');identity.append(el('strong',row.display_name||row.email),el('span',row.job_title||'管理同工','muted'),el('small',row.email));head.append(avatar,identity,badge);card.append(head);for(const target of ['M+','SHiNE']){const names=(row.grants||[]).filter(g=>g.church_id===target).map(g=>PERMISSIONS[g.permission]).filter(Boolean),roleKey=(row.roles||[]).find(r=>r.church_id===target)?.role_key,roleName=row.is_owner?'擁有者':ROLE_TEMPLATES[roleKey]?.label;const p=el('p','','admin-role-line');p.append(el('strong',churchName(target)),el('span',row.is_owner?'擁有者 · 完整權限':names.length?`${roleName||'自訂權限'} · ${names.join('、')}`:'未授權'));card.append(p);}const actions=el('div','','admin-card-actions'),edit=el('button',row.is_owner?'編輯基本資料':'編輯資料與權限','secondary');edit.type='button';edit.onclick=async()=>{if(edit.disabled)return;edit.disabled=true;$('#status').textContent='正在開啟管理員資料與權限…';try{await accountForm(row);}catch(error){$('#status').textContent='無法開啟編輯畫面：'+error.message;}finally{edit.disabled=false;}};actions.append(edit);if(row.invitation_state==='pending'){const resend=el('button','重新寄送邀請','secondary');resend.type='button';resend.onclick=()=>resendRow(row);actions.append(resend);}if(!row.is_owner){const remove=el('button','移除管理員資格','danger');remove.type='button';remove.dataset.actionFeedback='off';remove.onclick=()=>removeRow(row,remove);actions.append(remove);}card.append(actions);area.append(card);}$('#status').textContent='共 '+rows.length+' 個管理員帳號。角色名稱只協助套用權限，不會取代資料庫授權。';}
async function lineReview(){if(!reviewUser)return;const area=$('#editor');area.hidden=false;area.replaceChildren(el('h2','正在載入 LINE 身分核對…'));area.scrollIntoView({block:'start'});const result=await db.rpc('get_line_admin_access_review',{p_user:reviewUser});if(result.error||!result.data)throw new Error('無法載入待核對的 LINE 身分。');const detail=result.data;area.replaceChildren();area.append(el('h2','核對 LINE 登入身分'),el('p',`LINE 顯示名稱：${detail.line_name||'LINE 同工'}`,'muted'));if(detail.approved){area.append(el('p',`已完成權限對接${detail.account_name?'：'+detail.account_name:''}。`,'status-message success'));return;}const label=el('label','這個 LINE 身分是誰？'),select=document.createElement('select'),approve=el('button','確認並套用既有權限');for(const item of detail.candidates||[]){const option=document.createElement('option');option.value=item.user_id;option.textContent=`${item.display_name||item.email}｜${item.job_title||'管理同工'}${item.email?'｜'+item.email:''}`;select.append(option);}label.append(select);approve.disabled=!select.options.length;approve.onclick=async()=>{if(busy||!select.value)return;busy=true;approve.disabled=true;approve.textContent='正在對接權限…';try{const saved=await db.rpc('approve_line_admin_access_review',{p_user:reviewUser,p_source_user:select.value});if(saved.error||saved.data!==true)throw saved.error||new Error();await load();$('#status').textContent='LINE 身分與既有管理員權限已完成對接。';}catch{$('#status').textContent='權限對接失敗，請重新整理後再試。';approve.disabled=false;approve.textContent='確認並套用既有權限';}finally{busy=false;}};area.append(label,approve,el('p','確認後會複製所選管理員的堂會、功能、操作及常用首頁設定。','muted'));}
async function load(){close();$('#status').textContent='正在確認擁有者權限…';try{rows=await listAdminAccounts(db);render();if(reviewUser)await lineReview();}catch(error){if(!rows.length)$('#items').replaceChildren();$('#status').textContent=error.message;$('#add').disabled=true;}}
$('#members').href='church-settings.html?church='+encodeURIComponent(church);$('#add').onclick=addForm;if(localPreview){rows=[{user_id:'preview-owner',email:'owner@example.org',is_active:true,display_name:'王牧師',job_title:'主任牧師',grants:[],roles:[],is_owner:true,invitation_state:'active'},{user_id:'preview-admin',email:'coworker@example.org',is_active:false,display_name:'林同工',job_title:'行政同工',grants:permissionsForRole('administrator').map(permission=>({church_id:'M+',permission})),roles:[{church_id:'M+',role_key:'administrator'}],is_owner:false,invitation_state:'pending'}];render();$('#status').textContent='本機介面預覽：不會寄信或寫入資料庫。';}else load();
