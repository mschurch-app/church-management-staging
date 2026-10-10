import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fixture} from './backend-fixture.mjs';
const {default:puppeteer}=await import(process.env.PUPPETEER_MODULE||'puppeteer-core');
const root=path.resolve(new URL('../../',import.meta.url).pathname),out=process.env.TREE_TEST_OUTPUT||'/tmp/life-tree-contracts';
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,subject='U'+'a'.repeat(32),checks=[],errors=[],calls=[];
let browser,page,backend=fixture(),omitSubject=false;
async function click(selector){
  await page.$eval(selector,node=>node.scrollIntoView({block:'center',behavior:'instant'}));
  await page.waitForFunction(selector=>{const node=document.querySelector(selector);if(!node)return false;const r=node.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));},{},selector);
  await page.click(selector);
}
async function check(name,fn){try{await fn();checks.push({name,passed:true});console.log('PASS',name);}catch(error){checks.push({name,passed:false,error:error.message});console.log('FAIL',name,error.message);try{await page.screenshot({path:out+`/failure-${checks.length}.png`});}catch{}}}
try{
  browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:fs.mkdtempSync(path.join(os.tmpdir(),'tree-contracts-')),args:['--no-first-run','--disable-background-networking']});
  page=await browser.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(15000);await page.setBypassServiceWorker(true);await page.setViewport({width:402,height:874,isMobile:true,hasTouch:true});
  await page.evaluateOnNewDocument(()=>{
    if(location.hostname!=='127.0.0.1')return;
    const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-10T13:46:00+08:00']));}static now(){return new RealDate('2026-10-10T13:46:00+08:00').getTime();}};
    localStorage.setItem('october-life-tree-guide-v1','1');
  });
  page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request',async request=>{try{
    const url=new URL(request.url()),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
    if(url.origin===base)return request.continue();
    if(url.href.includes('sdk.js'))return request.respond({status:200,contentType:'application/javascript',body:'window.liff={init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>"isolated-token"}'});
    if(url.hostname==='svwgfgyxxgbqabosriom.supabase.co'){
      if(request.method()==='OPTIONS')return request.respond({status:200,headers,body:'{}'});
      const body=JSON.parse(request.postData()||'{}'),timing={...body};calls.push(timing);const began=performance.now();
      const result=await backend.call(body.action,body.readingDate,'isolated-token',{note:body.note});
      timing.handlerMilliseconds=Math.round(performance.now()-began);const {status,...data}=result;if(omitSubject&&data.participant)delete data.participant.line_subject;
      return request.respond({status,headers,contentType:'application/json',body:JSON.stringify(data)});
    }
    if(url.hostname==='raw.githubusercontent.com')return request.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({chapters:Array.from({length:31},()=>Array.from({length:30},(_,i)=>`${i+1} 隔離經文測試，智慧使人明白道路，願神的話成為腳前的燈，路上的光。`))})});
    if(url.hostname==='api.open-meteo.com')return request.respond({status:200,headers,contentType:'application/json',body:JSON.stringify({current:{weather_code:2,temperature_2m:26,wind_speed_10m:9,time:'2026-10-10T13:45'}})});
    return request.abort();
  }catch(error){errors.push(error.message);try{await request.abort();}catch{}}});
  const devotional=base+'/tree-reading-october-test.html?view=devotional&church=M%2B&preview=1&from=october-tree';
  backend=fixture({initial:[{line_subject:subject,reading_date:'2026-10-10',completion_type:'on_time',watered_at:'2026-10-10T05:45:00Z'}]});
  await page.goto(devotional,{waitUntil:'domcontentloaded'});
  await check('Real handler me contract enables own journal without participant.id',async()=>{
    await page.waitForFunction(()=>document.querySelector('#reflection-note')&&!document.querySelector('#reflection-note').disabled);
    assert.ok(!('id' in (await backend.call('me')).participant));
  });
  await check('Real handler journal save persists today only, without extra progress',async()=>{
    await page.type('#reflection-note','Isolated contract journal');await click('#save-reflection');
    await page.waitForFunction(()=>document.querySelector('#reflection-status').textContent.includes('已收藏'));
    assert.equal((await backend.call('me')).notes[0].note,'Isolated contract journal');
    assert.equal(backend.rows.length,1);assert.equal(calls.filter(row=>row.action==='journal_save').length,1);
    await page.$eval('#october-journal',node=>node.scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:out+'/journal-contract.png'});
  });
  await check('Same-browser account switch cannot reveal another member draft or notes',async()=>{
    const first=backend,secondSubject='U'+'b'.repeat(32);
    await page.$eval('#reflection-note',node=>{node.value='Private draft A';node.dispatchEvent(new Event('input',{bubbles:true}));});
    backend=fixture({memberSubject:secondSubject,initial:[{line_subject:secondSubject,reading_date:'2026-10-10',completion_type:'on_time',watered_at:null}]});
    await page.goto(devotional,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#reflection-note')&&!document.querySelector('#reflection-note').disabled);
    assert.equal(await page.$eval('#reflection-note',node=>node.value),'');assert.match(await page.$eval('#reflection-book-count',node=>node.textContent),/0/);
    backend=first;await page.goto(devotional,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#reflection-note')&&!document.querySelector('#reflection-note').disabled);
    assert.equal(await page.$eval('#reflection-note',node=>node.value),'Private draft A');
  });
  await check('Missing verified participant identity keeps journal locked and offers recovery',async()=>{
    omitSubject=true;await page.goto(devotional,{waitUntil:'domcontentloaded'});await page.waitForSelector('.journal-retry');
    assert.equal(await page.$eval('#reflection-note',node=>node.disabled),true);
    assert.ok(await page.$('.journal-retry'));omitSubject=false;
    await click('.journal-retry');await page.waitForFunction(()=>document.querySelector('#reflection-note')&&!document.querySelector('#reflection-note').disabled);
  });
  backend=fixture({initial:[
    {line_subject:subject,reading_date:'2026-10-06',completion_type:'makeup',watered_at:null},
    {line_subject:subject,reading_date:'2026-10-10',completion_type:'on_time',watered_at:'2026-10-10T05:45:00Z'},
  ]});
  await page.goto(base+'/tree-reading-october-test.html',{waitUntil:'domcontentloaded'});await page.waitForSelector('#member-view:not([hidden])');
  await page.$eval('#makeup-dates button',node=>node.click());await page.waitForSelector('#scripture-end');
  await check('Reading 10/9 never displays unrelated 10/6 watering actions',async()=>{
    assert.match(await page.$eval('#reading-date',node=>node.textContent),/10\/9/);
    assert.equal(await page.$eval('#resume-watering',node=>node.hidden),true);
    assert.equal(await page.$eval('#care-tree',node=>node.hidden),true);
    await page.$eval('#makeup-section',node=>node.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:out+'/selected-makeup.png'});
  });
  await check('Real 10/9 completion lands at tree and waters only 10/9',async()=>{
    await page.$eval('#scripture-end',node=>node.scrollIntoView({block:'center',behavior:'instant'}));
    await page.waitForFunction(()=>!document.querySelector('#mark-late').disabled);await click('#mark-late');
    await page.waitForFunction(()=>document.activeElement.id==='tree-water-stage');
    assert.match(await page.$eval('#care-tree',node=>node.textContent),/10\/9/);
    await click('#care-tree');await page.waitForFunction(()=>document.querySelector('#care-tree').hidden);
    assert.ok(backend.rows.find(row=>row.reading_date==='2026-10-09').watered_at);
    assert.equal(backend.rows.find(row=>row.reading_date==='2026-10-06').watered_at,null);
    assert.equal(calls.filter(row=>row.action==='water_tree').at(-1).readingDate,'2026-10-09');
  });
  await check('Returning later still exposes explicit 10/6 unfinished watering',async()=>{
    assert.equal(await page.$eval('#resume-watering',node=>node.hidden),false);
    assert.match(await page.$eval('#resume-watering',node=>node.textContent),/另有.*10\/6/);
    await page.goto(base+'/tree-reading-october-test.html',{waitUntil:'domcontentloaded'});await page.waitForSelector('#member-view:not([hidden])');
    assert.match(await page.$eval('#resume-watering',node=>node.textContent),/10\/6/);await click('#resume-watering');
    await page.waitForFunction(()=>document.activeElement.id==='tree-water-stage');assert.match(await page.$eval('#care-tree',node=>node.textContent),/10\/6/);
  });
  await check('No uncaught exceptions',async()=>assert.deepEqual(errors,[]));
}catch(error){checks.push({name:'Contract harness navigation/bootstrap',passed:false,error:error.stack});console.error(error.stack);process.exitCode=1;}finally{
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(out+'/results.json',JSON.stringify({checks,errors,requests:calls.map(({action,handlerMilliseconds})=>({action,handlerMilliseconds})),passed:checks.filter(row=>row.passed).length,failed:checks.filter(row=>!row.passed).length,scope:'Real production handler with isolated LINE/SDK/database; no network or production writes'},null,2));
}
if(checks.some(row=>!row.passed))process.exitCode=1;
