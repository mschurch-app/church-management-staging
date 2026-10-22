import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const origin=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8773';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check']});
let checks=0;
const ok=(condition,name)=>{assert(condition,name);console.log('PASS',++checks,name);};
async function fixture(setup=''){
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on('request',req=>req.url().includes('/__startup-test__')?req.respond({status:200,contentType:'text/html',body:'<!doctype html><main><h2>測試</h2><form><input name="draft"></form></main>'}):req.continue());
 await page.goto(origin+'/__startup-test__');
 await page.evaluate(async setup=>{
  window.messages=[];window.clockOffset=0;const now=Date.now;Date.now=()=>now()+clockOffset;
  const sw=new EventTarget();sw.getRegistration=async()=>undefined;Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});
  window.reg=new EventTarget();reg.waiting={postMessage:message=>messages.push(message)};
  new Function(setup)();window.runtime=await import('/app-runtime.mjs?v=20261022-experience1');
 },setup);return page;
}
const count=p=>p.evaluate(()=>messages.length);
const silent=p=>p.evaluate(()=>!document.querySelector('.app-system-banner:not([hidden])'));
try{
 let p=await fixture();await p.evaluate(()=>{runtime.watchAppRegistration(reg);runtime.watchAppRegistration(reg);});ok(await count(p)===1,'opening activates waiting update once');ok(await silent(p),'opening has no update prompt');await p.close();
 p=await fixture();await p.type('input','unfinished');await p.evaluate(()=>runtime.watchAppRegistration(reg));ok(await count(p)===0&&await p.$eval('input',n=>n.value==='unfinished'),'draft prevents startup activation');ok(await silent(p),'draft never triggers nag');await p.close();
 p=await fixture();await p.evaluate(()=>document.body.setAttribute('aria-busy','true'));await p.evaluate(()=>runtime.watchAppRegistration(reg));ok(await count(p)===0,'busy operation defers activation');await p.close();
 p=await fixture();await p.click('h2');await p.evaluate(()=>runtime.watchAppRegistration(reg));ok(await count(p)===0,'interaction before update defers activation');await p.close();
 p=await fixture();await p.evaluate(()=>{clockOffset=9000;runtime.watchAppRegistration(reg);});ok(await count(p)===0&&await silent(p),'update found later stays quiet until next opening');await p.close();
 p=await fixture();await p.evaluate(()=>runtime.watchAppRegistration(reg));await p.type('input','keep me');await p.evaluate(()=>navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));ok(await p.$eval('input',n=>n.value==='keep me')&&await silent(p),'typing during activation preserves form without popup');await p.close();
 p=await fixture("Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true})");await p.evaluate(()=>runtime.watchAppRegistration(reg));ok(await count(p)===0,'hidden page cannot activate automatically');await p.close();
 p=await fixture("sessionStorage.setItem('church-os-auto-update-reload',String(Date.now()))");await p.evaluate(()=>runtime.watchAppRegistration(reg));ok(await count(p)===0,'recent automatic reload prevents loop');await p.close();
 p=await fixture("Object.defineProperty(navigator,'onLine',{value:false,configurable:true})");await p.evaluate(()=>runtime.watchAppRegistration(reg));ok(await count(p)===0,'offline opening never requests activation');ok(await p.$eval('.app-system-banner',n=>!n.hidden&&n.textContent.includes('沒有網路')),'offline recovery remains available');await p.close();
 p=await fixture();await p.evaluate(()=>{runtime.watchAppRegistration(reg);reg.waiting.postMessage=()=>{throw Error('unavailable')};});await p.type('input','x');await p.evaluate(()=>navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));await p.evaluate(()=>{document.visibilityState;Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));clockOffset=31000;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});ok(await p.$eval('input',n=>n.value==='x'),'foreground resume preserves existing drafts');await p.close();
 p=await fixture();await p.evaluate(()=>{clockOffset=9000;runtime.watchAppRegistration(reg);Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));clockOffset=40000;Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});ok(await count(p)===0,'foreground resume defers updates until a real opening');await p.close();
 p=await fixture();await p.evaluate(()=>{reg.waiting.postMessage=()=>{throw Error('unavailable')};runtime.watchAppRegistration(reg);});ok(await silent(p),'automatic activation failure stays quiet');await p.close();
 const context=await browser.createBrowserContext();p=await context.newPage();
 await p.goto(origin+'/app-offline.html');await p.evaluate(async()=>{await navigator.serviceWorker.register('/church-os-sw.js?startup-baseline',{scope:'/'});await navigator.serviceWorker.ready;});await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);ok(true,'real worker installs and controls page');
 const navigation=p.waitForNavigation({waitUntil:'networkidle0'});
 await p.evaluate(async()=>{const module=await import('/app-runtime.mjs?v=20261022-experience1');const reg=await navigator.serviceWorker.register('/church-os-sw.js?startup-updated',{scope:'/'});module.watchAppRegistration(reg);});
 await navigation;ok(await p.evaluate(()=>navigator.serviceWorker.controller?.scriptURL.includes('startup-updated')),'real waiting worker activates and page reloads automatically');ok(await silent(p),'real update reload shows no banner');
 const stamp=await p.evaluate(()=>sessionStorage.getItem('church-os-auto-update-reload'));await p.reload({waitUntil:'networkidle0'});ok(await p.evaluate(()=>sessionStorage.getItem('church-os-auto-update-reload'))===stamp,'reopening after update does not create reload loop');await context.close();
 console.log('TOTAL',checks);
}finally{await browser.close();}
