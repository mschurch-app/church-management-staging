import {ICON_PATHS as paths,SYMBOL_NAMES as symbolNames,iconSymbol,applyAppIcon} from './app-icons.mjs?v=20261009-stage2';
if(!window.__churchIosExperience){
  window.__churchIosExperience=true;
  const version='20261009-stage2';
  const stylesheet=document.createElement('link');
  stylesheet.rel='stylesheet';stylesheet.href=new URL(`./ios-experience.css?v=${version}`,import.meta.url).href;
  const consistency=document.querySelector('link[data-app-consistency]');
  // Keep the loaded shared stylesheet attached: moving it can temporarily drop
  // its imported tokens and header rules while the browser reloads the sheet.
  if(consistency)document.head.insertBefore(stylesheet,consistency);
  else{const shared=document.createElement('link');shared.rel='stylesheet';shared.dataset.appConsistency='1';shared.href=new URL('./app-consistency.css?v=20261009-stage2',import.meta.url).href;document.head.append(stylesheet,shared);}
  document.documentElement.classList.add('church-ios');
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)document.documentElement.classList.add('church-ios-device');
  const meta=(name,content)=>{let node=document.head.querySelector(`meta[name="${name}"]`);if(!node){node=document.createElement('meta');node.name=name;document.head.append(node);}node.content=content;};
  meta('apple-mobile-web-app-capable','yes');meta('apple-mobile-web-app-status-bar-style','black-translucent');
  let viewport=document.head.querySelector('meta[name="viewport"]');if(viewport&&!viewport.content.includes('viewport-fit'))viewport.content+=',viewport-fit=cover';

  function upgradeSymbols(root=document){for(const node of root.querySelectorAll?.('.dashboard-icon,.module-bar-icon,.todo-icon,.drawer-icon,.app-hub-card>span,.mobile-app-nav a>span:first-child,.home-library-item>span,.home-icon-main>b,.settings-link-icon,.line-settings-shortcuts a>span')||[]){if(node.dataset.iosSymbol)continue;const key=node.closest('[data-ios-icon]')?.dataset.iosIcon,name=node.closest('.mobile-app-nav')&&node.textContent.trim()==='🔔'?'alert':(key?iconSymbol(key):null)||symbolNames[node.textContent.trim()];if(!name||!paths[name])continue;applyAppIcon(node,name);}}
  function upgradeSwitches(root=document){for(const input of root.querySelectorAll?.('.switch input[type="checkbox"],.media-switch input[type="checkbox"]')||[]){input.setAttribute('role','switch');input.setAttribute('aria-checked',String(input.checked));if(input.dataset.iosSwitch)continue;input.dataset.iosSwitch='1';input.addEventListener('change',()=>input.setAttribute('aria-checked',String(input.checked)));}}
  function upgrade(root=document){upgradeSymbols(root);upgradeSwitches(root);}
  const install=()=>{upgrade();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)upgrade(node.parentElement||node);}).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

  let pressed=null,dirty=false;
  document.addEventListener('input',event=>{if(event.target.closest('form'))dirty=true;},{passive:true});
  document.addEventListener('submit',()=>{dirty=false;},true);
  document.addEventListener('pointerdown',event=>{const target=event.target.closest('button,a,.dashboard-card,.app-hub-card,.member-card');if(!target||target.matches(':disabled'))return;pressed=target;target.classList.add('ios-pressed');},{passive:true});
  for(const type of ['pointerup','pointercancel','pointerleave'])document.addEventListener(type,()=>{pressed?.classList.remove('ios-pressed');pressed=null;},{passive:true});
  const transition=document.createElement('div');transition.className='ios-page-transition';transition.setAttribute('aria-hidden','true');
  const mountTransition=()=>{if(!transition.isConnected)document.body.append(transition);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountTransition,{once:true});else mountTransition();
  document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||link.target||link.hasAttribute('download')||event.metaKey||event.ctrlKey)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.href===location.href||url.hash&&url.pathname===location.pathname&&url.search===location.search)return;transition.classList.add('is-loading');setTimeout(()=>transition.classList.remove('is-loading'),12000);});
  window.addEventListener('pageshow',()=>transition.classList.remove('is-loading'));
  if(window.visualViewport){const resize=()=>{const inset=Math.max(0,innerHeight-window.visualViewport.height-window.visualViewport.offsetTop);document.documentElement.style.setProperty('--ios-keyboard-inset',`${inset}px`);document.documentElement.classList.toggle('ios-keyboard-open',inset>100);};window.visualViewport.addEventListener('resize',resize);window.visualViewport.addEventListener('scroll',resize);resize();}
  let edgeStart=null,edgeHint;
  document.addEventListener('touchstart',event=>{const touch=event.touches[0];if(event.touches.length!==1||touch.clientX>22||dirty||document.querySelector('dialog[open],[role=dialog]:not([hidden])')||event.target.closest('[role=dialog],dialog,input,textarea,select,[contenteditable],.app-hub-grid,.module-bar'))return;edgeStart={x:touch.clientX,y:touch.clientY};},{passive:true});
  document.addEventListener('touchmove',event=>{if(!edgeStart)return;const touch=event.touches[0],dx=touch.clientX-edgeStart.x,dy=Math.abs(touch.clientY-edgeStart.y);if(dx<18||dy>70)return;if(!edgeHint){edgeHint=document.createElement('div');edgeHint.className='ios-back-hint';edgeHint.textContent='‹';document.body.append(edgeHint);}edgeHint.style.setProperty('--back-progress',Math.min(1,dx/110));edgeHint.classList.add('show');},{passive:true});
  document.addEventListener('touchend',event=>{if(!edgeStart)return;const touch=event.changedTouches[0],goBack=touch.clientX-edgeStart.x>95&&Math.abs(touch.clientY-edgeStart.y)<70;edgeStart=null;edgeHint?.classList.remove('show');if(goBack&&history.length>1)history.back();},{passive:true});
}
