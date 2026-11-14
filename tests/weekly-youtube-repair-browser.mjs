import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-11-15-youtube-sync-repair');await mkdir(out,{recursive:true});
const panel=(await readFile(path.join(root,'website-maintenance.html'),'utf8')).match(/<section[^>]*id="weekly-youtube"[\s\S]*?<\/section>/)[0];
const server=createServer(async(req,res)=>{try{
 const file=new URL(req.url,'http://fixture').pathname;let body;
 if(file==='/fixture')body=`<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/apple-ui.css"><link rel="stylesheet" href="/weekly-youtube.css"><body><main style="max-width:1000px;margin:auto;padding:16px">${panel}</main><script type="module">import {initWeeklyYoutube} from '/weekly-youtube.mjs';window.fixtureContext={row:{id:'11111111-1111-4111-8111-111111111111',version:8,status:'published',service_date:'2026-11-15',sermon_topic:'合成主日主題',sermon_scripture:'列王紀下 7:1–20',sermon_speaker:'合成講員',youtube_sync_enabled:true},saved:true,editable:false,reviewer:true,busy:false};window.weekly=initWeeklyYoutube({db:{},church:'M+',getContext:()=>window.fixtureContext,onDirty:()=>{},request:(action,payload)=>window.fixtureApi(action,payload)});window.weekly.reset();</script></body></html>`;
 else {const target=path.resolve(root,'.'+file);if(!target.startsWith(root+path.sep))throw Error();body=await readFile(target);}
 res.setHeader('content-type',file==='/fixture'?'text/html; charset=utf-8':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(body);
 }catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,results=[];
try{for(const engine of [chromium,webkit]){const browser=await engine.launch({headless:true,...(engine===webkit&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});try{for(const width of [393,1440]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),calls=[],errors=[];let mode='ok',release;
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.fallback():route.abort());
 await page.exposeFunction('fixtureApi',async(action,payload)=>{calls.push({action,...payload});if(action==='weekly_status'){if(mode==='fail')throw Error('合成讀取失敗');if(mode==='hold'){mode='ok';await new Promise(resolve=>release=resolve);}return {ok:true,version:1,publication:null};}if(action==='weekly_sync')return {ok:true,status:'synced',url:'https://www.youtube.com/watch?v=synthetic01'};throw Error('unexpected action');});
 await page.goto(base+'/fixture');await page.locator('#youtube-state').filter({hasText:'尚未同步'}).waitFor();
 await page.locator('#youtube-retry').click();await page.locator('#youtube-state').filter({hasText:'已同步'}).waitFor();assert.equal(calls.find(call=>call.action==='weekly_sync').version,1);assert.equal(await page.locator('#youtube-watch').isVisible(),true);assert.equal(await page.locator('#youtube-title-edit').isDisabled(),true);
 const before=calls.filter(call=>call.action==='weekly_sync').length;mode='fail';await page.locator('#youtube-retry').click();await page.locator('#youtube-state').filter({hasText:'合成讀取失敗'}).waitFor();assert.equal(calls.filter(call=>call.action==='weekly_sync').length,before);assert.equal(await page.locator('#youtube-retry').isDisabled(),false);
 mode='hold';await page.evaluate(()=>{document.querySelector('#youtube-retry').click();document.querySelector('#youtube-retry').click();});await page.waitForFunction(()=>document.querySelector('#youtube-retry').disabled);assert.equal(calls.filter(call=>call.action==='weekly_sync').length,before);release();await page.locator('#youtube-state').filter({hasText:'已同步'}).waitFor();assert.equal(calls.filter(call=>call.action==='weekly_sync').length,before+1);
 mode='hold';await page.locator('#youtube-retry').click();await page.waitForFunction(()=>document.querySelector('#youtube-retry').disabled);const written=calls.filter(call=>call.action==='weekly_sync').length;
 await page.evaluate(()=>{window.fixtureContext={...window.fixtureContext,saved:false,row:{...window.fixtureContext.row,id:'44444444-4444-4444-8444-444444444444'}};window.weekly.reset();});release();await page.waitForFunction(()=>!document.querySelector('#youtube-retry').disabled);assert.equal(calls.filter(call=>call.action==='weekly_sync').length,written);
 await page.evaluate(()=>{window.fixtureContext={...window.fixtureContext,reviewer:false};window.weekly.sync();});assert.equal(await page.locator('#youtube-retry').isHidden(),true);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,`youtube-${engine.name()}-${width}.png`),fullPage:true});
 results.push({engine:engine.name(),width,passed:true,checks:['approved-source version 1 instead of editable bulletin 8','saved approval fields locked','read failure prevents write and restores retry','double click once','changed context cancels pending sync','reviewer permission preserved','no external calls','no overflow']});console.log('PASS',engine.name(),width);await context.close();
 }}finally{await browser.close();}}}finally{await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(out,'browser-results.json'),JSON.stringify({results,real_youtube_writes:false,physical_iphone_verified:false},null,2));
