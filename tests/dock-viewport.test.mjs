import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dockViewport,dockCorrection,installDockViewport} from '../dock-viewport.mjs';

test('closed keyboard stale offset cannot carry the dock below the screen',()=>{
  assert.deepEqual(dockViewport({layoutHeight:852,height:852,offsetTop:300}),{bottom:852,inset:0,keyboard:false});
});
test('keyboard requires an active text field; toolbar resizing and zoom are not keyboards',()=>{
  assert.equal(dockViewport({layoutHeight:852,height:500,editing:true}).keyboard,true);
  assert.equal(dockViewport({layoutHeight:852,height:500,editing:false}).keyboard,false);
  assert.equal(dockViewport({layoutHeight:852,height:800,editing:true}).keyboard,false);
  assert.equal(dockViewport({layoutHeight:852,height:426,scale:2,editing:true}).keyboard,false);
  assert.equal(dockViewport({layoutHeight:852,height:426,offsetTop:100,scale:2}).bottom,526);
});
test('correction repairs upward and downward drift without accumulating on repeated scroll',()=>{
  const shift=dockCorrection({bottom:552,target:852});assert.equal(shift,300);
  assert.equal(dockCorrection({previous:shift,bottom:852,target:852}),shift);
  assert.equal(dockCorrection({previous:shift,bottom:1152,target:852}),0);
  assert.equal(dockCorrection({bottom:900,target:852,gap:12}),-60);
});

function fixture(){
  class Style{values=new Map();getPropertyValue(k){return this.values.get(k)||'';}setProperty(k,v){this.values.set(k,v);}}
  class Node extends EventTarget{
    constructor(){super();this.style=new Style();this.attrs=new Map();this.isConnected=true;this.parentElement=null;this.offset=0;this.display='flex';}
    setAttribute(k,v){this.attrs.set(k,v);}toggleAttribute(k,on){if(on)this.attrs.set(k,'');else this.attrs.delete(k);}
    getBoundingClientRect(){return {height:80,bottom:win.visualViewport.height+this.offset+parseFloat(this.style.getPropertyValue('--app-dock-shift')||0)};}
  }
  const callbacks=[];let mutation;const viewport=Object.assign(new EventTarget(),{height:852,offsetTop:0,scale:1});
  const win=Object.assign(new EventTarget(),{innerHeight:852,visualViewport:viewport,requestAnimationFrame:fn=>(callbacks.push(fn),callbacks.length),getComputedStyle:n=>({display:n.display,position:'fixed',bottom:'0px'}),MutationObserver:class{constructor(cb){mutation=cb;}observe(){}},ResizeObserver:class{observe(){}unobserve(){}}});
  const body={append(n){n.parentElement=this;}},docks=[new Node()];docks[0].parentElement=body;
  const doc=Object.assign(new EventTarget(),{readyState:'complete',visibilityState:'visible',activeElement:null,body,head:{append(){}},documentElement:{style:new Style(),clientHeight:852,classList:{toggle(k,v){this[k]=v;}}},querySelectorAll:()=>docks,createElement:()=>({dataset:{}})});
  const flush=()=>{const batch=callbacks.splice(0);batch.forEach(fn=>fn());};
  return {win,doc,viewport,dock:docks[0],docks,Node,flush,mutate:records=>mutation(records),pending:()=>callbacks.length};
}
test('real event wiring handles scroll drift, keyboard closure, pageshow and background recovery',()=>{
  const f=fixture();installDockViewport(f.win,f.doc);f.flush();assert.equal(f.dock.style.getPropertyValue('--app-dock-shift'),'');
  f.dock.offset=-280;f.win.dispatchEvent(new Event('scroll'));f.flush();assert.equal(f.dock.style.getPropertyValue('--app-dock-shift'),'280px');
  for(let i=0;i<20;i++){f.viewport.dispatchEvent(new Event('scroll'));f.flush();}assert.equal(f.dock.style.getPropertyValue('--app-dock-shift'),'280px');
  f.doc.activeElement={matches:()=>true};f.viewport.height=500;f.viewport.dispatchEvent(new Event('resize'));f.flush();assert.equal(f.dock.attrs.has('data-dock-keyboard-hidden'),true);
  f.doc.activeElement=null;f.viewport.height=852;f.viewport.offsetTop=300;f.doc.dispatchEvent(new Event('focusout'));f.flush();assert.equal(f.dock.attrs.has('data-dock-keyboard-hidden'),false);assert.equal(f.doc.documentElement.classList['ios-keyboard-open'],false);
  f.dock.offset=0;f.win.dispatchEvent(new Event('pageshow'));f.flush();assert.equal(f.dock.style.getPropertyValue('--app-dock-shift'),'0px');
  f.doc.visibilityState='hidden';f.dock.offset=-100;f.doc.dispatchEvent(new Event('visibilitychange'));f.flush();assert.equal(f.dock.style.getPropertyValue('--app-dock-shift'),'0px');
  f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));f.flush();assert.equal(f.dock.style.getPropertyValue('--app-dock-shift'),'100px');
});
test('listeners coalesce events and initialization is idempotent',()=>{
  const f=fixture();const first=installDockViewport(f.win,f.doc);assert.equal(first,installDockViewport(f.win,f.doc));f.flush();
  for(let i=0;i<100;i++)f.win.dispatchEvent(new Event('scroll'));assert.equal(f.pending(),1);f.flush();assert.equal(f.pending(),0);
});
test('hidden docks remain hidden and late inserted navigation is discovered outside workspace',()=>{
  const f=fixture();f.dock.display='none';f.dock.offset=-200;installDockViewport(f.win,f.doc);f.flush();assert.equal(f.dock.style.getPropertyValue('--app-dock-shift'),'');
  const late=new f.Node();late.parentElement={};f.docks.push(late);late.offset=-20;
  f.mutate([{type:'childList',addedNodes:[{nodeType:1,matches:()=>true}]}]);f.flush();assert.equal(late.parentElement,f.doc.body);assert.equal(late.style.getPropertyValue('--app-dock-shift'),'20px');
});
test('school, functional navigation, runtime and worker share the same version',()=>{
  const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
  for(const file of ['school/index.html','scripts/school/build-isolated-view.py','app-runtime.mjs','mplus-function-nav.mjs','church-os-sw.js'])assert.match(read(file),/dock-viewport.mjs\?v=20261026-dock1/,file);
  assert.doesNotMatch(read('ios-experience.mjs'),/classList.toggle\('ios-keyboard-open',inset>100\)/);
});
