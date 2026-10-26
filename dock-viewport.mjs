// Shared dock geometry only: no sessions, storage, network or page scrolling.
const selector='.mplus-function-dock,.mobile-app-nav,.mplus-dock';
const installed=new WeakMap();
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
export function dockViewport({layoutHeight,height,offsetTop=0,scale=1,editing=false}){
  layoutHeight=Math.max(0,finite(layoutHeight));
  height=Math.max(0,finite(height,layoutHeight));
  // A closed iOS keyboard can leave a stale positive offsetTop. Never place
  // the dock beyond the layout viewport; preserve offsets while pinch zooming.
  const bottom=Math.min(layoutHeight,height+Math.max(0,finite(offsetTop)));
  const inset=Math.max(0,layoutHeight-height-Math.max(0,finite(offsetTop)));
  return {bottom,inset,keyboard:editing&&Math.abs(scale-1)<.05&&layoutHeight-height>120};
}
export function dockCorrection({previous=0,bottom,target,gap=0}){
  const next=finite(previous)+finite(target)-Math.max(0,finite(gap))-finite(bottom);
  return Math.round(next*100)/100;
}
export function isTextEntry(node){
  return Boolean(node?.isContentEditable||node?.matches?.('textarea,input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden])'));
}
export function installDockViewport(win=window,doc=document){
  if(installed.has(doc))return installed.get(doc);
  const states=new Map();let frame=0,started=false;
  const set=(style,key,value)=>{if(style.getPropertyValue(key)!==value)style.setProperty(key,value);};
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(update);};
  function update(){
    frame=0;if(doc.visibilityState==='hidden')return;
    const viewport=win.visualViewport;
    const geometry=dockViewport({layoutHeight:Math.max(win.innerHeight,doc.documentElement.clientHeight||0),height:viewport?.height??win.innerHeight,offsetTop:viewport?.offsetTop,scale:viewport?.scale??1,editing:isTextEntry(doc.activeElement)});
    doc.documentElement.classList.toggle('ios-keyboard-open',geometry.keyboard);
    set(doc.documentElement.style,'--ios-keyboard-inset',geometry.inset+'px');
    for(const [dock,state] of states){
      if(!dock.isConnected){states.delete(dock);observer?.unobserve(dock);continue;}
      const css=win.getComputedStyle(dock);
      // Preserve print styles and role-specific/legacy hidden navigation.
      if(css.display==='none'||css.position!=='fixed')continue;
      dock.toggleAttribute('data-dock-keyboard-hidden',geometry.keyboard);
      if(geometry.keyboard)continue;
      const rect=dock.getBoundingClientRect();if(!rect.height)continue;
      // Translate only the measured error. Existing correct fixed positioning
      // remains untouched, and repeated events cannot accumulate the offset.
      const correction=dockCorrection({previous:state.correction,bottom:rect.bottom,target:geometry.bottom,gap:parseFloat(css.bottom)||0});
      if(Number.isFinite(correction)&&Math.abs(correction-state.correction)>.5){
        state.correction=correction;set(dock.style,'--app-dock-shift',correction+'px');
      }
    }
  }
  const observer=win.ResizeObserver?new win.ResizeObserver(schedule):null;
  function discover(){
    for(const dock of doc.querySelectorAll(selector)){
      if(states.has(dock))continue;
      // Keep fixed navigation outside scrolling/transformed workspace panels.
      if(dock.parentElement!==doc.body)doc.body.append(dock);
      dock.setAttribute('data-app-viewport-dock','');states.set(dock,{correction:0});observer?.observe(dock);
    }
    schedule();
  }
  function start(){
    if(started||!doc.body)return;started=true;
    const sheet=doc.createElement('style');sheet.dataset.dockViewport='';
    sheet.textContent='[data-app-viewport-dock]{translate:0 var(--app-dock-shift,0px)}[data-app-viewport-dock][data-dock-keyboard-hidden]{visibility:hidden!important;pointer-events:none!important}html.ios-keyboard-open [data-app-viewport-dock]{transform:none!important}@media print{[data-app-viewport-dock]{translate:none!important}}';
    doc.head.append(sheet);discover();
    if(win.MutationObserver)new win.MutationObserver(records=>{
      if(records.some(record=>record.type==='childList'&&[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.(selector)||node.querySelector?.(selector)))))discover();
    }).observe(doc.body,{childList:true,subtree:true});
    for(const event of ['scroll','resize','orientationchange','pageshow','focus'])win.addEventListener(event,schedule,{passive:true});
    for(const event of ['focusin','focusout','visibilitychange'])doc.addEventListener(event,schedule);
    viewportListeners();
  }
  function viewportListeners(){for(const event of ['resize','scroll'])win.visualViewport?.addEventListener(event,schedule,{passive:true});}
  installed.set(doc,schedule);
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
  return schedule;
}
if(typeof window!=='undefined'&&typeof document!=='undefined')installDockViewport();
