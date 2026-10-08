if(!window.__churchIosExperience){
  window.__churchIosExperience=true;
  const version='20261008-ios5';
  const stylesheet=document.createElement('link');
  stylesheet.rel='stylesheet';stylesheet.href=new URL(`./ios-experience.css?v=${version}`,import.meta.url).href;document.head.append(stylesheet);
  document.documentElement.classList.add('church-ios');
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)document.documentElement.classList.add('church-ios-device');
  const meta=(name,content)=>{let node=document.head.querySelector(`meta[name="${name}"]`);if(!node){node=document.createElement('meta');node.name=name;document.head.append(node);}node.content=content;};
  meta('apple-mobile-web-app-capable','yes');meta('apple-mobile-web-app-status-bar-style','black-translucent');
  let viewport=document.head.querySelector('meta[name="viewport"]');if(viewport&&!viewport.content.includes('viewport-fit'))viewport.content+=',viewport-fit=cover';

  const paths={
    home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5.5h5V20"/>',
    people:'<circle cx="9" cy="8" r="3.25" fill="#fff" stroke="none"/><path d="M2.9 19.8c0-3.7 2.45-6.15 6.1-6.15s6.1 2.45 6.1 6.15c0 .65-.45 1.2-1.1 1.2H4c-.65 0-1.1-.55-1.1-1.2Z" fill="#fff" stroke="none"/><circle cx="16.5" cy="8.4" r="2.55" fill="#fff" opacity=".72" stroke="none"/><path d="M15.2 13.7c3.65-.35 6 1.8 6 5.1 0 .65-.45 1.2-1.1 1.2h-3.25c.05-2.6-.55-4.7-1.65-6.3Z" fill="#fff" opacity=".72" stroke="none"/>',
    sprout:'<path d="M11 21V11.7c-4.5-.1-7.35-2.6-7.35-7.1 4.55 0 7.25 2.15 7.65 6.1.55-4.55 3.55-7.1 8.7-7.1 0 4.95-3.45 7.75-8 7.95V21Z" fill="#fff" stroke="none"/><path d="M12 11.2c1.4-2.6 3.4-4.45 6.05-5.55M10.8 11.4C9.6 9.2 8 7.7 5.65 6.75" opacity=".38"/>',
    tree:'<path d="M12 2.5c2.75 0 5 2.05 5.25 4.75A4.85 4.85 0 0 1 16.1 16H7.9a4.85 4.85 0 0 1-1.15-8.75A5.28 5.28 0 0 1 12 2.5Z" fill="#fff" stroke="none"/><path d="M11 13h2v8.5h-2zM7.8 19.5h8.4V22H7.8z" fill="#fff" opacity=".78" stroke="none"/>',
    link:'<path d="M14.4 4.4a5.15 5.15 0 0 1 7.3 7.3l-2.5 2.5a5.15 5.15 0 0 1-7.3 0 1.55 1.55 0 1 1 2.2-2.2 2.05 2.05 0 0 0 2.9 0l2.5-2.5a2.05 2.05 0 0 0-2.9-2.9l-1.45 1.45a1.55 1.55 0 1 1-2.2-2.2Z" fill="#fff" stroke="none"/><path d="M9.6 19.6a5.15 5.15 0 0 1-7.3-7.3l2.5-2.5a5.15 5.15 0 0 1 7.3 0 1.55 1.55 0 1 1-2.2 2.2A2.05 2.05 0 0 0 7 12l-2.5 2.5a2.05 2.05 0 0 0 2.9 2.9l1.45-1.45a1.55 1.55 0 1 1 2.2 2.2Z" fill="#fff" opacity=".8" stroke="none"/>',
    bell:'<path d="M12 2.5a2 2 0 0 1 1.8 1.12A6.55 6.55 0 0 1 18.5 9.9v3.3l2.2 3.65c.5.85-.1 1.95-1.1 1.95H4.4c-1 0-1.6-1.1-1.1-1.95l2.2-3.65V9.9a6.55 6.55 0 0 1 4.7-6.28A2 2 0 0 1 12 2.5Z" fill="#fff" stroke="none"/><path d="M9.2 20h5.6a2.9 2.9 0 0 1-5.6 0Z" fill="#fff" opacity=".72" stroke="none"/>',
    check:'<rect x="3" y="3" width="18" height="18" rx="5.2" fill="#fff" stroke="none"/><path d="m6.7 12.3 3.25 3.3 7.55-7.4" fill="none" stroke="#1976e8" stroke-width="2.6"/>',
    calendar:'<rect x="3" y="4" width="18" height="17" rx="3.5" fill="#fff" stroke="none"/><path d="M3 8.5h18V7.2A3.2 3.2 0 0 0 17.8 4H6.2A3.2 3.2 0 0 0 3 7.2Z" fill="#ff4f5e" stroke="none"/><path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 17h2M11 17h2M14.5 17h2" stroke="#d83a46" stroke-width="1.7"/>',
    box:'<path d="m12 2.8 9 4.5-9 4.55L3 7.3Z" fill="#fff" stroke="none"/><path d="M3 8.8 11 13v8.2l-8-4.15ZM21 8.8 13 13v8.2l8-4.15Z" fill="#fff" opacity=".78" stroke="none"/><path d="m8 5 9 4.5v3.1" opacity=".45"/>',
    heart:'<path data-tone="soft" d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
    chat:'<path data-tone="soft" d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4A8.2 8.2 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.5 8.4 8.4 0 0 1 9 8.5Z"/><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4A8.2 8.2 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.5 8.4 8.4 0 0 1 9 8.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/>',
    sparkle:'<path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 3l.6 1.8L7.5 5 5.6 5.6 5 7.5l-.6-1.9L2.5 5l1.9-.2L5 3Z"/>',
    gear:'<path d="M10.1 2h3.8l.55 2.35c.55.2 1.08.42 1.55.72l2.05-1.25 2.7 2.7-1.25 2.05c.3.47.53 1 .72 1.55l2.35.55v3.8l-2.35.55c-.2.55-.42 1.08-.72 1.55l1.25 2.05-2.7 2.7L16 19.93c-.47.3-1 .53-1.55.72L13.9 23h-3.8l-.55-2.35A8.6 8.6 0 0 1 8 19.93l-2.05 1.25-2.7-2.7 1.25-2.05a8.6 8.6 0 0 1-.72-1.55l-2.35-.55v-3.8l2.35-.55c.2-.55.42-1.08.72-1.55L3.25 6.38l2.7-2.7L8 4.93c.47-.3 1-.53 1.55-.72Z" fill="#fff" stroke="none"/><circle cx="12" cy="12.5" r="3.4" fill="#7b838d" stroke="none"/>',
    pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    globe:'<circle cx="12" cy="12" r="9.5" fill="#fff" opacity=".2" stroke="none"/><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    book:'<path d="M3.2 4.2h6.1c1.55 0 2.7.65 3.4 1.55v14.7c-.8-1.15-1.95-1.75-3.65-1.75H3.2Z" fill="#fff" stroke="none"/><path d="M20.8 4.2h-6.1c-.85 0-1.5.3-2 .78v15.47c.8-1.15 1.95-1.75 3.65-1.75h4.45Z" fill="#fff" opacity=".78" stroke="none"/><path d="M6 8h4M6 11h4M15 8h3.2M15 11h3.2" opacity=".38"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
    camera:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 1.5-2h5L16 6"/><circle cx="12" cy="13" r="3.5"/>',
    student:'<path d="m2.4 6.4 9.6-4.6 9.6 4.6L12 11Z" fill="currentColor" stroke="none"/><path d="M18.6 8.1v5.1"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity=".72" stroke="none"/><path d="M5.5 21c.25-4.05 2.6-6.2 6.5-6.2s6.25 2.15 6.5 6.2Z" fill="currentColor" opacity=".72" stroke="none"/>',
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
