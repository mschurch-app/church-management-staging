// Shared device behavior. This module does not read sessions or send business data.
let mounted=false,banner,copy,action,updateRegistration,updateActivated=false,activationRequested=false,activationTimer=0,onlineTimer=0,revision=0,approvedRevision=0;
const waitingRegistrations=new WeakSet();
const el=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
const hasDraft=()=>!!document.querySelector('[data-unsaved-changes="true"]');
const isBusy=()=>!!document.querySelector('[aria-busy="true"],button.os-action-busy');
const isOnline=()=>navigator.onLine!==false;
function ensureBanner(){if(banner)return;banner=el('aside','','app-system-banner');banner.setAttribute('aria-label','連線與更新');copy=el('p');copy.setAttribute('role','status');action=el('button','','secondary');action.type='button';action.dataset.actionFeedback='off';banner.append(copy,action);document.body.append(banner);}
function showBanner(text,label,handler){ensureBanner();copy.textContent=text;action.textContent=label||'';action.hidden=!label;action.disabled=false;action.onclick=handler||null;banner.hidden=false;}
function refreshBanner(){
  if(!mounted)return;
  if(!isOnline()){showBanner('目前沒有網路連線。連線恢復後，再重試未完成的操作。');return;}
  if(updateRegistration?.waiting||updateActivated){showBanner('有新版本可以使用，準備好後再更新。','更新',applyUpdate);return;}
  if(banner)banner.hidden=true;
}
function canReload(){
  if(isBusy()){showBanner('目前操作尚未完成。請等候結果，再重新整理。','知道了',refreshBanner);return false;}
  return !hasDraft()||confirm('還有尚未儲存的修改。要放棄修改並重新載入嗎？');
}
function reloadNow(){
  // The user has explicitly accepted discarding these drafts; avoid asking twice.
  window.dispatchEvent(new Event('church:discard-drafts'));
  document.querySelectorAll('[data-unsaved-changes="true"]').forEach(node=>node.dataset.unsavedChanges='false');
  location.reload();
}
export function refreshApp(){if(!isOnline()){refreshBanner();return false;}if(!canReload())return false;reloadNow();return true;}
async function applyUpdate(){
  if(activationRequested||!isOnline()||!canReload())return;
  if(updateActivated){reloadNow();return;}
  const worker=updateRegistration?.waiting;if(!worker){refreshBanner();return;}
  approvedRevision=revision;activationRequested=true;showBanner('正在準備新版本…');
  activationTimer=setTimeout(()=>{activationRequested=false;showBanner('更新尚未完成，請稍後再試。','重試更新',applyUpdate);},12000);
  try{worker.postMessage({type:'CHURCH_ACTIVATE_UPDATE'});}catch{clearTimeout(activationTimer);activationRequested=false;showBanner('更新尚未完成，請稍後再試。','重試更新',applyUpdate);}
}
export function watchAppRegistration(registration){
  if(!registration||waitingRegistrations.has(registration))return;
  waitingRegistrations.add(registration);
  const check=()=>{if(registration.waiting){updateRegistration=registration;refreshBanner();}};
  check();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')check();});});
}
function mount(){
  if(mounted||!document.body)return;mounted=true;
  const main=document.querySelector('main');
  if(main){if(!main.id)main.id='app-main-content';const skip=el('a','跳到主要內容','app-skip-link');skip.href='#'+main.id;skip.dataset.actionFeedback='off';skip.onclick=event=>{event.preventDefault();const heading=[...main.querySelectorAll('h2')].find(node=>node.getClientRects().length)||main;heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'instant'});};document.body.prepend(skip);}
  document.addEventListener('input',event=>{const form=event.target.closest('form');if(form){form.dataset.unsavedChanges='true';revision++;}},true);
  document.addEventListener('change',event=>{const form=event.target.closest('form');if(form){form.dataset.unsavedChanges='true';revision++;}},true);
  document.addEventListener('reset',event=>{if(event.target instanceof HTMLFormElement)event.target.dataset.unsavedChanges='false';},true);
  const probe=el('span','','app-text-probe');probe.setAttribute('aria-hidden','true');document.body.append(probe);
  const size=()=>document.documentElement.classList.toggle('app-large-text',probe.getBoundingClientRect().height>20);
  size();if('ResizeObserver'in window)new ResizeObserver(size).observe(probe);
  const dock=document.querySelector('.mobile-app-nav');if(dock){document.body.classList.add('app-has-dock');const measure=()=>document.documentElement.style.setProperty('--app-dock-height',dock.getBoundingClientRect().height+'px');measure();if('ResizeObserver'in window)new ResizeObserver(measure).observe(dock);}
  window.addEventListener('offline',()=>{clearTimeout(onlineTimer);refreshBanner();});
  window.addEventListener('online',()=>{refreshBanner();if(!updateRegistration?.waiting&&!updateActivated){showBanner('裝置已重新連線，請重試未完成的操作。');onlineTimer=setTimeout(refreshBanner,3000);}});
  navigator.serviceWorker?.getRegistration().then(watchAppRegistration).catch(()=>{});
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{
    if(!activationRequested)return;clearTimeout(activationTimer);activationRequested=false;updateActivated=true;
    if(isBusy()||revision!==approvedRevision||document.visibilityState==='hidden'){showBanner('新版已準備好。請完成目前操作，再按更新。','更新',applyUpdate);return;}
    reloadNow();
  });
  refreshBanner();installPullToRefresh();
}
function installPullToRefresh(){
  if(!(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)||!('ontouchstart'in window))return;
  const indicator=el('div','↓ 下拉更新','app-pull-refresh');indicator.setAttribute('role','status');document.body.append(indicator);
  let startX=0,startY=0,distance=0,tracking=false;
  const reset=()=>{tracking=false;distance=0;indicator.className='app-pull-refresh';indicator.style.removeProperty('transform');};
  const blocked=target=>scrollY>0||isBusy()||document.querySelector('dialog[open],[role=dialog]:not([hidden])')||target.closest('input,textarea,select,[contenteditable],dialog,[role=dialog],.app-hub-grid,.module-bar');
  document.addEventListener('touchstart',event=>{reset();const target=event.target;if(event.touches.length!==1||blocked(target))return;for(let node=target;node&&node!==document.body;node=node.parentElement){const style=getComputedStyle(node);if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1)return;}startX=event.touches[0].clientX;startY=event.touches[0].clientY;tracking=true;},{passive:true});
  document.addEventListener('touchmove',event=>{if(!tracking)return;if(event.touches.length!==1||blocked(event.target)){reset();return;}const touch=event.touches[0],dy=touch.clientY-startY,dx=Math.abs(touch.clientX-startX);if(dx>Math.abs(dy)&&dx>12||dy<0){reset();return;}distance=Math.max(0,Math.min(120,dy*.58));if(distance<=4)return;if(event.cancelable)event.preventDefault();indicator.classList.add('visible');indicator.classList.toggle('ready',distance>=72);indicator.style.transform=`translate(-50%,${distance-58}px)`;indicator.textContent=distance>=72?'↻ 放開立即更新':'↓ 下拉更新';},{passive:false});
  document.addEventListener('touchend',()=>{if(!tracking)return;const shouldRefresh=distance>=72;reset();if(shouldRefresh)refreshApp();},{passive:true});
  document.addEventListener('touchcancel',reset,{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
