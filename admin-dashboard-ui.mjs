import {createFunctionEntry} from './app-ui.mjs?v=20261009-stage2';
import {FUNCTION_CATALOG,FUNCTION_GROUPS,availableFunctionKeys,favoriteKeys,FUNCTION_ALIASES,canonicalFunctionKey,matchesFunction,friendlyLabel} from './app-function-catalog.mjs?v=20261009-stage2';
import {loadNotificationCenter} from './app-notifications.mjs?v=20261009-stage4';import {wireInstallButton,wireNotificationButtons} from './app-pwa.mjs?v=20261010-linked-push1';import {db} from './admin-db.mjs?v=20261009-stage4';import {dashboardAccess,dashboardCounts,dashboardHomePreferences} from './dashboard-management.mjs?v=20261009-stage2';import {loadChurchCustomizations} from './church-customizations.mjs?v=20261009-stage2';import {canOpen,canAction} from './admin-access.mjs?v=20261009-stage1';
const preferred=new URLSearchParams(location.search).get('church'),$=s=>document.querySelector(s);let access,church,currentHome,currentSettings={},quickEdit=false,longPressTimer=null,longPressOrigin=null,draggedQuickKey='',pointerDrag=null,suppressQuickClickUntil=0;const el=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=value;n.className=cls;return n;};
const QUICK_LINKS=FUNCTION_CATALOG;
function href(file){return file+(file.includes('?')?'&':'?')+'church='+encodeURIComponent(church);}
function quickStorageKey(){return `church-os-quick-links:${access.user.id}:${church}`;}
function defaultQuickKeys(){return (currentHome.home_modules||[]).filter(key=>QUICK_LINKS[key]);}
function allowedQuickKeys(){return availableFunctionKeys(access,church,currentHome,currentSettings);}
function readQuickKeys(){const allowed=allowedQuickKeys();try{return favoriteKeys(JSON.parse(localStorage.getItem(quickStorageKey())||'null'),defaultQuickKeys(),allowed);}catch{return favoriteKeys(null,defaultQuickKeys(),allowed);}}
function saveQuickKeys(keys){localStorage.setItem(quickStorageKey(),JSON.stringify(keys));}
function orderedQuickCards(){return [...$('#quick-links').querySelectorAll('[data-home-module]')];}
function folderKey(key){return({private_prayers:'prayers',pastoral_chats:'pastoral_inbox'})[key]||key;}
function quickKeyFromFolder(key){return canonicalFunctionKey(key);}
function syncFunctionFolder(){const area=$('#modules');if(!area)return;const query=($('#function-search')?.value||'').trim().toLowerCase(),matches=card=>matchesFunction(card.dataset.functionKey||card.dataset.homeModule,query);for(const card of orderedQuickCards())card.hidden=!matches(card);const selected=new Set(orderedQuickCards().map(card=>folderKey(card.dataset.homeModule)));let visible=0;for(const group of area.querySelectorAll(':scope > .module-group')){const cards=[...group.querySelectorAll('.dashboard-card')];for(const card of cards){card.hidden=selected.has(card.dataset.folderKey)||!matches(card);if(!card.hidden)visible+=1;}group.hidden=!cards.some(card=>!card.hidden);}area.querySelector('.folder-empty')?.remove();const found=visible+orderedQuickCards().filter(card=>!card.hidden).length,state=$('#function-search-state');if(state){state.hidden=!query;state.textContent=found?'找到 '+found+' 項可用功能':'找不到符合的功能，請換個名稱，或請管理員確認你的權限。';}if(!query&&!visible&&area.querySelector('.module-group'))area.append(el('p','所有可用功能都已放在常用功能中。','muted folder-empty'));}
function persistQuickCards(){saveQuickKeys(orderedQuickCards().map(card=>card.dataset.homeModule));}
function setQuickEdit(active){quickEdit=active;const section=$('#favorites-section'),edit=$('#edit-quick-links'),finish=$('#finish-quick-links'),help=$('#quick-links-help');section.classList.toggle('is-editing',active);edit.hidden=active;finish.hidden=!active;help.textContent=active?'拖曳圖示排列，或用 Alt＋方向鍵；按減號移除':'長按圖示即可排列或移除';for(const card of orderedQuickCards()){card.removeAttribute('aria-grabbed');card.querySelector('.function-open').setAttribute('aria-describedby','quick-links-help');}}
function removeQuickCard(card){card.classList.add('is-removing');setTimeout(()=>{card.remove();persistQuickCards();syncFunctionFolder();if(!orderedQuickCards().length){$('#quick-links').append(el('p','常用功能已全部移除，可按下方按鈕恢復預設。','muted'));$('#restore-quick-links').hidden=false;}},180);}
function moveQuickBefore(card,target){if(!card||!target||card===target)return;const cards=orderedQuickCards(),from=cards.indexOf(card),to=cards.indexOf(target);if(from<to)target.after(card);else target.before(card);persistQuickCards();}
function createQuickCard(key){const card=createFunctionEntry(key,{church,variant:'favorite',control:{className:'quick-link-remove',text:'−',label:`從常用功能移除${QUICK_LINKS[key].title}`}});card.dataset.homeModule=key;card.draggable=true;return card;}
function addQuickCard(key,trigger){if(trigger?.classList.contains('is-added')||!allowedQuickKeys().includes(key)||orderedQuickCards().some(card=>card.dataset.homeModule===key))return;trigger?.classList.add('is-added');if(trigger)trigger.textContent='✓';setTimeout(()=>{const area=$('#quick-links');area.querySelector(':scope > .muted')?.remove();area.append(createQuickCard(key));persistQuickCards();syncFunctionFolder();$('#restore-quick-links').hidden=true;navigator.vibrate?.(25);},180);}
function renderQuickLinks(home){currentHome=home;const area=$('#quick-links');area.replaceChildren();for(const key of readQuickKeys())area.append(createQuickCard(key));if(!area.children.length){area.append(el('p','常用功能已全部移除，可按下方按鈕恢復預設。','muted'));$('#restore-quick-links').hidden=false;}else $('#restore-quick-links').hidden=true;setQuickEdit(false);syncFunctionFolder();}
function quickCardAtPoint(x,y){return document.elementFromPoint(x,y)?.closest?.('[data-home-module]');}
function startPointerQuickDrag(card,event){if(!quickEdit||event.pointerType==='mouse')return;pointerDrag={card,pointerId:event.pointerId};card.classList.add('is-dragging');card.setPointerCapture?.(event.pointerId);event.preventDefault();}
$('#function-search')?.addEventListener('input',()=>{if($('#function-search').value.trim())$('#all-functions').open=true;syncFunctionFolder();});
const quickArea=$('#quick-links');
quickArea.addEventListener('click',event=>{const remove=event.target.closest('.quick-link-remove'),card=event.target.closest('[data-home-module]');if(remove&&card){event.preventDefault();event.stopPropagation();removeQuickCard(card);return;}if(quickEdit||Date.now()<suppressQuickClickUntil){event.preventDefault();return;}if(card?.dataset.homeModule.startsWith('school'))openSchool(event,card.querySelector('.function-open').href);});
quickArea.addEventListener('pointerdown',event=>{const card=event.target.closest('[data-home-module]');if(!card||event.target.closest('.quick-link-remove'))return;if(quickEdit){startPointerQuickDrag(card,event);return;}longPressOrigin={x:event.clientX,y:event.clientY};longPressTimer=setTimeout(()=>{suppressQuickClickUntil=Date.now()+700;setQuickEdit(true);navigator.vibrate?.(35);},520);});
for(const type of ['pointerup','pointercancel','pointerleave'])quickArea.addEventListener(type,()=>{clearTimeout(longPressTimer);longPressTimer=null;longPressOrigin=null;});
quickArea.addEventListener('pointercancel',()=>{if(pointerDrag){pointerDrag.card.classList.remove('is-dragging');pointerDrag=null;persistQuickCards();}});

quickArea.addEventListener('pointermove',event=>{if(longPressOrigin&&Math.hypot(event.clientX-longPressOrigin.x,event.clientY-longPressOrigin.y)>10){clearTimeout(longPressTimer);longPressTimer=null;longPressOrigin=null;}if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;const target=quickCardAtPoint(event.clientX,event.clientY);moveQuickBefore(pointerDrag.card,target);});
quickArea.addEventListener('pointerup',event=>{if(!pointerDrag||pointerDrag.pointerId!==event.pointerId)return;pointerDrag.card.classList.remove('is-dragging');pointerDrag=null;persistQuickCards();suppressQuickClickUntil=Date.now()+350;});
quickArea.addEventListener('dragstart',event=>{const card=event.target.closest('[data-home-module]');if(!quickEdit||!card){event.preventDefault();return;}draggedQuickKey=card.dataset.homeModule;card.classList.add('is-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedQuickKey);});
quickArea.addEventListener('dragover',event=>{if(!quickEdit||!draggedQuickKey)return;event.preventDefault();moveQuickBefore(quickArea.querySelector(`[data-home-module="${CSS.escape(draggedQuickKey)}"]`),event.target.closest('[data-home-module]'));});
quickArea.addEventListener('dragend',event=>{event.target.closest('[data-home-module]')?.classList.remove('is-dragging');draggedQuickKey='';persistQuickCards();});
quickArea.addEventListener('keydown',event=>{
  if(!quickEdit)return;
  if(event.key==='Escape'){event.preventDefault();setQuickEdit(false);$('#edit-quick-links').focus();return;}
  const card=event.target.closest('[data-home-module]');if(!card)return;
  if(event.key==='Delete'){event.preventDefault();removeQuickCard(card);return;}
  if(!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const cards=orderedQuickCards(),columns=getComputedStyle(quickArea).gridTemplateColumns.split(' ').length,delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key],target=cards[cards.indexOf(card)+delta];
  if(target){moveQuickBefore(card,target);card.querySelector('.function-open').focus();$('#quick-edit-status').textContent=`${QUICK_LINKS[card.dataset.homeModule].title}已移到第 ${orderedQuickCards().indexOf(card)+1} 個位置`;}
});
$('#edit-quick-links').onclick=()=>setQuickEdit(true);$('#finish-quick-links').onclick=()=>setQuickEdit(false);$('#restore-quick-links').onclick=()=>{saveQuickKeys(favoriteKeys(null,defaultQuickKeys(),allowedQuickKeys()));renderQuickLinks(currentHome);};
function renderChurches(){const nav=$('#churches');nav.replaceChildren();for(const value of access.churches){const a=el('a',value==='M+'?'M＋大雅教會':'火樂教會');a.href='admin-dashboard.html?church='+encodeURIComponent(value);if(value===church)a.className='current';nav.append(a);}}
function moduleCard(item,module,key=''){const moduleKey=canonicalFunctionKey(key||item.key||module.key),card=createFunctionEntry(moduleKey,{church,control:{className:'folder-add-quick',text:'＋',label:`將${QUICK_LINKS[moduleKey].title}加入常用`,key:moduleKey}});card.dataset.folderKey=folderKey(moduleKey);return card;}
function renderModules(settings,home){
 const area=$('#modules');area.replaceChildren();area.className='module-groups';
 const available=new Set(allowedQuickKeys());
 for(const category of FUNCTION_GROUPS){
  const group=el('section','','module-group module-group--'+category.key),head=el('div','','module-group-heading'),grid=el('div','','dashboard-grid');
  head.append(el('h3',category.title),el('p',category.note,'muted'));
  for(const key of category.keys){if(!available.has(key))continue;const item=QUICK_LINKS[key],card=moduleCard(item,item,key);if(key.startsWith('school'))card.dataset.schoolLink='true';grid.append(card);}
  if(grid.children.length){group.append(head,grid);area.append(group);}
 }
 if(!area.children.length)area.append(el('p','此堂會目前沒有開放中的管理功能。','muted'));
 area.onclick=event=>{const add=event.target.closest('[data-add-quick]');if(add){event.preventDefault();event.stopPropagation();addQuickCard(add.dataset.addQuick,add);return;}const link=event.target.closest('[data-school-link]');if(link)openSchool(event,link.querySelector('.function-open').href);};
 area.onkeydown=event=>{const add=event.target.closest('[data-add-quick]');if(!add||!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();addQuickCard(add.dataset.addQuick,add);};
 syncFunctionFolder();
}
function renderCounts(counts){const area=$('#summary');area.replaceChildren();for(const [key,label] of [['members','會友'],['groups','小組與小家'],['prayers','待關懷代禱'],['bookings','待確認預約']]){if(counts[key]===undefined)continue;if(key==='prayers'){const card=document.createElement('a'),copy=el('span','','summary-card-copy');card.className='summary-card summary-card-link';card.href=href('prayers.html?state=pending&scope=current');copy.append(el('span',label),el('small','代禱牆＋教牧私密'));card.append(el('strong',counts[key]===null?'—':String(counts[key])),copy,el('b','›','summary-card-arrow'));area.append(card);continue;}const card=el('article','','summary-card');card.append(el('strong',counts[key]===null?'—':String(counts[key])),el('span',label));area.append(card);}area.style.setProperty('--summary-columns',String(Math.max(1,Math.min(4,area.children.length))));area.hidden=!area.children.length;}
async function load(){try{({access,church}=await dashboardAccess(db,preferred));const [settings,home]=await Promise.all([loadChurchCustomizations(db,church),dashboardHomePreferences(db,church)]);const monitorAccess=await db.rpc('get_my_system_monitor_access');home.system_monitor_access=!monitorAccess.error&&monitorAccess.data===true;const capabilities=await db.rpc('get_my_app_capabilities');home.is_owner=capabilities.data?.is_owner===true;currentSettings=settings;$('#title').textContent=church==='M+'?'M＋大雅教會':'火樂教會';$('#welcome').textContent=access.user.name+'｜'+access.user.title;renderChurches();renderQuickLinks(home);renderModules(settings,home);renderCounts(await dashboardCounts(db,church,access.grants));$('#status').textContent='';$('#status').hidden=true;}catch(error){$('#status').hidden=false;$('#status').textContent=error.message;$('#logout').textContent='回登入頁';$('#logout').onclick=()=>location.replace('admin-login.html');}}
$('#logout').onclick=async()=>{await db.auth.signOut();location.replace('admin-login.html');};load();
async function openSchool(event,destination){
 event.preventDefault();$('#status').hidden=false;$('#status').textContent='正在使用教會 OS 帳號開啟課輔系統…';
 try{
  const session=await db.auth.getSession(),token=session.data.session?.access_token;if(!token)throw new Error('missing_session');
  const response=await fetch('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/mschool-api/church-login',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok||!result.session)throw new Error(result.error||'login_failed');
  location.assign(`${destination}#church_session=${encodeURIComponent(result.session)}`);
 }catch{location.assign(destination);}
}

wireInstallButton($('#install-app'),$('#install-help'));
wireNotificationButtons($('#enable-notifications'),$('#test-notification'),$('#install-help'));
loadNotificationCenter($('#notification-list'),$('#notification-count'),$('#notification-history'));
document.querySelector('[data-open-details]')?.addEventListener('click',event=>{const target=document.querySelector(event.currentTarget.getAttribute('href'));if(!target)return;event.preventDefault();target.open=true;target.scrollIntoView({behavior:'smooth',block:'start'});});
