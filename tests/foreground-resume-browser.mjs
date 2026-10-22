import {mkdir,writeFile} from 'node:fs/promises';
const {default:puppeteer}=await import(process.env.PUPPETEER_MODULE||'puppeteer-core');
import assert from 'node:assert/strict';
const origin=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8773';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check']});
let checks=0;const names=[];
const ok=(condition,name)=>{assert(condition,name);names.push(name);console.log('PASS',++checks,name);};
const sleep=()=>new Promise(resolve=>setTimeout(resolve,650));
async function fixture({ios=false,path='/__resume-test__.html',guard=false}={}){
 const page=await browser.newPage();let visits=0;
 if(ios)await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');
 await page.setRequestInterception(true);
 page.on('request',req=>new URL(req.url()).pathname===path?(visits++,req.respond({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><main><h1>工作台</h1><form><input name="draft"></form></main><script type="module">import "/app-runtime.mjs?v=20261022-experience1";window.ready=true;</script>'})):req.continue());
 await page.goto(origin+path);await page.waitForFunction(()=>window.ready);
 await page.evaluate(guard=>{localStorage.setItem('test-session-sentinel','keep');if(guard)sessionStorage.setItem('church-os-resume-reload',JSON.stringify({at:Date.now()}));},guard);
 return {page,visits:()=>visits};
}
async function hide(page){await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});}
async function show(page,persisted=false){await page.evaluate(persisted=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));if(persisted)window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));},persisted);await sleep();}
try{
 let f=await fixture({ios:true});await hide(f.page);await show(f.page);ok(f.visits()===2,'ordinary iPhone return rebuilds a clean document even with intact DOM');await f.page.close();
 f=await fixture();await hide(f.page);await f.page.evaluate(()=>document.querySelector('main').replaceChildren());await show(f.page);await f.page.waitForFunction(()=>document.querySelector('h1'));ok(f.visits()===2,'blank restored content reloads once');ok(await f.page.evaluate(()=>localStorage.getItem('test-session-sentinel'))==='keep','recovery leaves stored session untouched');await f.page.close();
 f=await fixture({ios:true});await hide(f.page);await show(f.page,true);await f.page.waitForFunction(()=>window.ready);ok(f.visits()===2,'clean iOS frozen-page restore rebuilds document');await f.page.close();
 f=await fixture();await hide(f.page);await show(f.page,true);ok(f.visits()===1,'healthy desktop BFCache restore is retained');await f.page.close();
 f=await fixture({ios:true});await f.page.type('input','未存檔');await hide(f.page);await show(f.page,true);ok(f.visits()===1&&await f.page.$eval('input',n=>n.value==='未存檔'),'frozen restore preserves unsaved form');await f.page.close();
 f=await fixture({ios:true});await f.page.evaluate(()=>document.body.setAttribute('aria-busy','true'));await hide(f.page);await show(f.page,true);ok(f.visits()===1,'active operation never reloads or resubmits');await f.page.close();
 f=await fixture({ios:true});await f.page.type('input','draft');await hide(f.page);await f.page.evaluate(()=>document.querySelector('main').style.display='none');await show(f.page,true);ok(f.visits()===1&&await f.page.$eval('input',n=>n.value==='draft'),'blank recovery retains hidden draft');ok(!!await f.page.$('[data-resume-recovery] button'),'protected blank document offers explicit recovery');let dialogs=0;f.page.on('dialog',async dialog=>{dialogs++;await dialog.accept();});await f.page.evaluate(()=>window.addEventListener('beforeunload',event=>{if(document.querySelector('[data-unsaved-changes="true"]')){event.preventDefault();event.returnValue='';}}));await f.page.click('[data-resume-recovery] button');await sleep();await f.page.waitForFunction(()=>document.querySelector('h1')?.textContent==='工作台',{polling:100});ok(dialogs===1,'explicit discard recovery asks once before reloading');await f.page.close();
 f=await fixture({ios:true,guard:true});await hide(f.page);await show(f.page,true);ok(f.visits()===1,'repeat restore is protected against reload loop');await f.page.close();
 f=await fixture({ios:true,path:'/__test-payment-callback.html'});await hide(f.page);await show(f.page,true);ok(f.visits()===1,'payment and auth callback are not replayed');await f.page.close();
 f=await fixture({ios:true});await f.page.evaluate(()=>Object.defineProperty(navigator,'onLine',{value:false,configurable:true}));await hide(f.page);await show(f.page,true);ok(f.visits()===1,'offline restore preserves cached document');await f.page.close();
 f=await fixture({ios:true});await f.page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false})));await sleep();ok(f.visits()===1,'initial pageshow never reloads');await f.page.close();
 f=await fixture({ios:true});await f.page.evaluate(()=>{const input=document.createElement('input');input.id='outside';document.querySelector('main').append(input);});await f.page.type('#outside','outside draft');await hide(f.page);await show(f.page,true);ok(f.visits()===1&&await f.page.$eval('#outside',n=>n.value==='outside draft'),'non-form editor changes also block automatic recovery reload');await f.page.close();
 f=await fixture({ios:true});await f.page.evaluate(()=>window.dispatchEvent(new Event('blur')));await f.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await sleep();ok(f.visits()===2,'iOS blur/focus return recovers without visibility event');await f.page.close();
 f=await fixture({ios:true});await f.page.type('input','普通返回保留草稿');await hide(f.page);await show(f.page);ok(f.visits()===1&&await f.page.$eval('input',n=>n.value==='普通返回保留草稿'),'ordinary foreground return protects editable work');await f.page.close();
 f=await fixture({ios:true});await hide(f.page);await show(f.page);await f.page.waitForFunction(()=>window.ready);await hide(f.page);await show(f.page);ok(f.visits()===2,'rapid repeated returns cannot enter reload loop');await f.page.close();
 f=await fixture({ios:true});await f.page.evaluate(()=>{document.querySelector('main').style.minHeight='3000px';scrollTo(0,550);});await hide(f.page);await show(f.page);await f.page.waitForFunction(()=>window.ready);await f.page.evaluate(()=>document.querySelector('main').style.minHeight='3000px');await sleep();ok(await f.page.evaluate(()=>scrollY)===550,'safe reload restores scroll position without storing form data');ok(await f.page.evaluate(()=>sessionStorage.getItem('church-os-resume-position'))===null,'one-time scroll receipt is consumed after recovery');await f.page.close();
 const out=new URL('../docs/reports/2026-10-22-home-resume/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('resume-tests.json',out),JSON.stringify({checks:names,mode:'local Chrome with simulated iOS user agent and lifecycle events',real_iphone:false,production_writes:false},null,2));console.log('TOTAL',checks);
}finally{await browser.close();}
