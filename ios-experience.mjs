if(!window.__churchIosExperience){
  window.__churchIosExperience=true;
  const version='20261008-ios4';
  const stylesheet=document.createElement('link');
  stylesheet.rel='stylesheet';stylesheet.href=new URL(`./ios-experience.css?v=${version}`,import.meta.url).href;document.head.append(stylesheet);
  document.documentElement.classList.add('church-ios');
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)document.documentElement.classList.add('church-ios-device');
  const meta=(name,content)=>{let node=document.head.querySelector(`meta[name="${name}"]`);if(!node){node=document.createElement('meta');node.name=name;document.head.append(node);}node.content=content;};
  meta('apple-mobile-web-app-capable','yes');meta('apple-mobile-web-app-status-bar-style','black-translucent');
  let viewport=document.head.querySelector('meta[name="viewport"]');if(viewport&&!viewport.content.includes('viewport-fit'))viewport.content+=',viewport-fit=cover';

  const paths={
    home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5.5h5V20"/>',
    people:'<path data-tone="soft" d="M3.2 20v-2.3A5.2 5.2 0 0 1 8.4 12.5h1.2a5.2 5.2 0 0 1 5.2 5.2V20Z"/><circle data-tone="soft" cx="9" cy="7.7" r="3.4"/><circle cx="9" cy="7.7" r="3.1"/><path d="M3.8 20v-2.2A4.6 4.6 0 0 1 8.4 13h1.2a4.6 4.6 0 0 1 4.6 4.8V20M15.6 5.4a3 3 0 0 1 0 5.2M16.7 13.2a4.3 4.3 0 0 1 3.8 4.5V20"/>',
    sprout:'<path data-tone="soft" d="M12 13C7.7 13 4.8 10.5 4.8 6.6c4.3 0 7.2 2.5 7.2 6.4ZM12 10c0-4 3-6.4 7.2-6.4 0 4-3 6.4-7.2 6.4Z"/><path d="M12 21V10M12 13C7.7 13 4.8 10.5 4.8 6.6c4.3 0 7.2 2.5 7.2 6.4ZM12 10c0-4 3-6.4 7.2-6.4 0 4-3 6.4-7.2 6.4Z"/>',
    tree:'<path data-tone="soft" d="M12 2.8a5.2 5.2 0 0 0-4.6 7.6A4.2 4.2 0 0 0 9.9 17h4.2a4.2 4.2 0 0 0 2.5-6.6A5.2 5.2 0 0 0 12 2.8Z"/><path d="M12 22v-7M8.5 18H15M12 3a5 5 0 0 0-4.4 7.4A4 4 0 0 0 10 17h4a4 4 0 0 0 2.4-6.6A5 5 0 0 0 12 3Z"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
    bell:'<path data-tone="soft" d="M18.4 8.2a6.4 6.4 0 0 0-12.8 0c0 6.6-3 7-3 9h18.8c0-2-3-2.4-3-9Z"/><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    check:'<rect data-tone="soft" x="3" y="3" width="18" height="18" rx="5"/><path d="m5.5 12.2 4 4L18.8 7"/><rect x="3" y="3" width="18" height="18" rx="5"/>',
    calendar:'<rect data-tone="soft" x="3" y="5" width="18" height="16" rx="3"/><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M8 14h2M14 14h2M8 18h2M14 18h2"/>',
    box:'<path data-tone="soft" d="m4 7 8-4 8 4-8 4-8-4Zm0 0 8 4v10l-8-4V7Z"/><path d="m4 7 8-4 8 4-8 4-8-4Zm0 0 8 4 8-4v10l-8 4-8-4V7ZM12 11v10"/>',
    heart:'<path data-tone="soft" d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
    chat:'<path data-tone="soft" d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4A8.2 8.2 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.5 8.4 8.4 0 0 1 9 8.5Z"/><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4A8.2 8.2 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.5 8.4 8.4 0 0 1 9 8.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/>',
    sparkle:'<path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 3l.6 1.8L7.5 5 5.6 5.6 5 7.5l-.6-1.9L2.5 5l1.9-.2L5 3Z"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    book:'<path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4Z"/><path d="M20 4h-4a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h4V4Z"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
    camera:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 1.5-2h5L16 6"/><circle cx="12" cy="13" r="3.5"/>',
    student:'<path data-tone="soft" d="m3 6 9-4 9 4-9 4-9-4Z"/><circle data-tone="soft" cx="12" cy="11" r="3"/><path d="m3 6 9-4 9 4-9 4-9-4ZM18 8v5M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M9 11a3 3 0 0 0 6 0"/>',
    printer:'<path data-tone="soft" d="M5 14h14v7H5z"/><path d="M7 8V3h10v5M5 17H3V9h18v8h-2M5 14h14v7H5M17 11h.01"/>',
    trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6"/>',
    clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    bolt:'<path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>',
    star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    more:'<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>'
  };
  const symbolNames={'🏠':'home','⌂':'home','👥':'people','🤝':'people','🫶':'people','🌱':'sprout','🌳':'tree','🔗':'link','🔔':'bell','✅':'check','✓':'check','📅':'calendar','🗓️':'calendar','📆':'calendar','📦':'box','🙏':'heart','💛':'heart','💬':'chat','✨':'sparkle','★':'star','⚙':'gear','⚙️':'gear','📍':'pin','🌐':'globe','📚':'book','📊':'chart','▦':'grid','▶':'play','📷':'camera','🧑‍🎓':'student','👨‍🎓':'student','👩‍🎓':'student','🖨️':'printer','🖨':'printer','🏀':'target','🏆':'trophy','📋':'clipboard','🎯':'target','💪':'bolt','•••':'more'};
  function upgradeSymbols(root=document){for(const node of root.querySelectorAll?.('.dashboard-icon,.module-bar-icon,.todo-icon,.drawer-icon,.app-hub-card>span:first-of-type,.mobile-app-nav a>span:first-child')||[]){if(node.dataset.iosSymbol)return;const name=symbolNames[node.textContent.trim()];if(!name||!paths[name])continue;node.dataset.iosSymbol=name;node.textContent='';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=paths[name];node.append(svg);}}
  function upgradeSwitches(root=document){for(const input of root.querySelectorAll?.('.switch input[type="checkbox"],.media-switch input[type="checkbox"]')||[]){input.setAttribute('role','switch');input.setAttribute('aria-checked',String(input.checked));if(input.dataset.iosSwitch)return;input.dataset.iosSwitch='1';input.addEventListener('change',()=>input.setAttribute('aria-checked',String(input.checked)));}}
  function upgrade(root=document){upgradeSymbols(root);upgradeSwitches(root);}
  const install=()=>{upgrade();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)upgrade(node.matches?.('.dashboard-icon,.module-bar-icon,.todo-icon,.drawer-icon,.app-hub-card,.mobile-app-nav')?node.parentElement:node);}).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

  let pressed=null,dirty=false;
  document.addEventListener('input',event=>{if(event.target.closest('form'))dirty=true;},{passive:true});
  document.addEventListener('submit',()=>{dirty=false;},true);
  document.addEventListener('pointerdown',event=>{const target=event.target.closest('button,a,.dashboard-card,.app-hub-card,.member-card');if(!target||target.matches(':disabled'))return;pressed=target;target.classList.add('ios-pressed');},{passive:true});
  for(const type of ['pointerup','pointercancel','pointerleave'])document.addEventListener(type,()=>{pressed?.classList.remove('ios-pressed');pressed=null;},{passive:true});
  const transition=document.createElement('div');transition.className='ios-page-transition';transition.setAttribute('aria-hidden','true');
  const mountTransition=()=>{if(!transition.isConnected)document.body.append(transition);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountTransition,{once:true});else mountTransition();
  document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||link.target||link.hasAttribute('download')||event.metaKey||event.ctrlKey)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.href===location.href||url.hash&&url.pathname===location.pathname&&url.search===location.search)return;transition.classList.add('is-loading');},true);
  window.addEventListener('pageshow',()=>transition.classList.remove('is-loading'));
  if(window.visualViewport){const resize=()=>{const inset=Math.max(0,innerHeight-window.visualViewport.height-window.visualViewport.offsetTop);document.documentElement.style.setProperty('--ios-keyboard-inset',`${inset}px`);document.documentElement.classList.toggle('ios-keyboard-open',inset>100);};window.visualViewport.addEventListener('resize',resize);window.visualViewport.addEventListener('scroll',resize);resize();}
  let edgeStart=null,edgeHint;
  document.addEventListener('touchstart',event=>{const touch=event.touches[0];if(event.touches.length!==1||touch.clientX>22||dirty||event.target.closest('input,textarea,select,[contenteditable],.app-hub-grid,.module-bar'))return;edgeStart={x:touch.clientX,y:touch.clientY};},{passive:true});
  document.addEventListener('touchmove',event=>{if(!edgeStart)return;const touch=event.touches[0],dx=touch.clientX-edgeStart.x,dy=Math.abs(touch.clientY-edgeStart.y);if(dx<18||dy>70)return;if(!edgeHint){edgeHint=document.createElement('div');edgeHint.className='ios-back-hint';edgeHint.textContent='‹';document.body.append(edgeHint);}edgeHint.style.setProperty('--back-progress',Math.min(1,dx/110));edgeHint.classList.add('show');},{passive:true});
  document.addEventListener('touchend',event=>{if(!edgeStart)return;const touch=event.changedTouches[0],goBack=touch.clientX-edgeStart.x>95&&Math.abs(touch.clientY-edgeStart.y)<70;edgeStart=null;edgeHint?.classList.remove('show');if(goBack&&history.length>1)history.back();},{passive:true});
}
