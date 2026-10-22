import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {emptyDraft} from '../sermon-preparation-contract.mjs';
import {contrastMetrics} from './phase3/contrast.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.CHURCH_TEST_OUT||path.join(root,'tests/phase4/results/sermon-copy');await mkdir(out,{recursive:true});
const first='80000000-0000-4000-8000-000000000001',second='80000000-0000-4000-8000-000000000002';
const projects=Object.fromEntries([first,second].map((id,i)=>{const project={id,title:i?'合成信息乙':'合成信息甲',speaker:'合成講員',scripture:'詩篇 23:1',version:1,backup_version:1,updated_at:'2026-10-22T00:00:00Z'},payload=emptyDraft({title:project.title,speaker:project.speaker,scripture:project.scripture,service_date:''});payload.step='manuscript';payload.manuscript='原本已儲存的合成講章';payload.materials=[{id:'personal-fixture',kind:'personal',title:'自己的合成素材',speaker:'合成講員',content:'合成內容',note:'',reviewed:true}];payload.slides=[{title:'合成投影片',content:'合成畫面',notes:'合成備註'}];return[id,{project,payload,jobs:[],versions:[{version:1,created_at:project.updated_at}]}];}));
const bootstrap=`<script>
window.t={projects:JSON.parse(localStorage.getItem('synthetic-projects')||'null')||${JSON.stringify(projects)},calls:[],listFail:false,loadFail:false,saveFail:false,malformedSave:false,invalidLoad:false,afterCreateFail:false,saveDelay:0,delays:{},holding:false};
const originalTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>{if(fn?.name==='poll'){t.poll=fn;return originalTimeout(()=>{},86400000);}return originalTimeout(fn,delay,...args);};
t.runPoll=()=>t.poll();t.userId=window.fixtureUser||'70000000-0000-4000-8000-000000000001';t.sessionId=window.fixtureSession||'70000000-0000-4000-8000-000000000002';const callbacks=[];
t.session=()=>({user:{id:t.userId},access_token:[btoa('{}'),btoa(JSON.stringify({sub:t.userId,session_id:t.sessionId})),'fixture'].join('.')});t.auth=(event,session)=>callbacks.forEach(fn=>fn(event,session));t.persist=()=>localStorage.setItem('synthetic-projects',JSON.stringify(t.projects));
window.fixtureDb={auth:{getSession:async()=>{if(t.authDelay)await new Promise(r=>originalTimeout(r,t.authDelay));return {data:{session:t.session()}};},onAuthStateChange:fn=>{callbacks.push(fn);return {data:{subscription:{unsubscribe(){}}}};}}};
window.fetch=async(url,init)=>{if(!String(url).includes('/functions/v1/sermon-preparation'))throw Error('Unexpected request');const body=JSON.parse(init.body);t.calls.push(body);
 const error=()=>Response.json({ok:false,error:'unavailable'},{status:503});
 if(body.action==='list'){if(t.listFail)return error();return Response.json({ok:true,items:Object.values(t.projects).map(p=>p.project),worker:{online:true}});}
 if(body.action==='load'||body.action==='version'){const data=structuredClone(t.projects[body.project_id]);if(t.delays[body.project_id]){t.holding=true;await new Promise(r=>originalTimeout(r,t.delays[body.project_id]));}if(t.loadFail)return error();if(t.invalidLoad)data.payload={};return Response.json({ok:true,...data});}
 if(body.action==='save'){if(t.saveDelay)await new Promise(r=>originalTimeout(r,t.saveDelay));if(t.saveFail)return error();const d=t.projects[body.project_id];if(body.base_version!==d.project.version)return Response.json({ok:false,error:'conflict'},{status:409});d.payload=structuredClone(body.payload);d.project={...d.project,...d.payload.information,version:d.project.version+1};t.persist();if(t.malformedSave)return Response.json({ok:true,project:d.project});return Response.json({ok:true,...d});}
 if(body.action==='enqueue'){const d=t.projects[body.project_id],job={id:crypto.randomUUID(),kind:body.kind,status:'queued',base_version:body.base_version};d.jobs.unshift(job);return Response.json({ok:true,job});}
 if(body.action==='create'){const id='80000000-0000-4000-8000-000000000003',project={id,title:body.title,speaker:body.speaker,scripture:body.scripture,version:1,backup_version:0,updated_at:'2026-10-22T00:00:00Z'},payload=${JSON.stringify(emptyDraft())};payload.information={title:body.title,speaker:body.speaker,scripture:body.scripture,service_date:body.service_date};t.projects[id]={project,payload,jobs:[],versions:[]};if(t.afterCreateFail)t.listFail=true;return Response.json({ok:true,project});}
 throw Error('Unexpected action '+body.action);
};
</script><script type="module" src="/sermon-preparation.mjs"></script>`;
const stubs={'/admin-db.mjs':'export const db=window.fixtureDb;','/admin-access.mjs':`export const readAccess=async()=>{if(t.accessDelay)await new Promise(r=>setTimeout(r,t.accessDelay));if(t.denied)throw Error('無法確認權限');return {user:{id:t.userId}};};export const canOpen=()=>window.fixtureMode!=='denied'&&!t.denied;export const canAction=(a,c,k,action)=>window.fixtureMode!=='readonly'&&!t.readonly&&(action!=='export'||window.fixtureMode!=='noexport'&&!t.noexport);`};
const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://fixture').pathname;let data;
 if(file==='/fixture.html')data=(await readFile(path.join(root,'sermon-preparation.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<html lang="zh-Hant"','<html class="mplus-theme" lang="zh-Hant"').replace('<head>','<head><base href="/">').replace('</body>',bootstrap+'</body>');
 else if(stubs[file])data=stubs[file];else{const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));data=await readFile(target);}
 res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,checks=[],errors=[];
const check=(result,name)=>{assert(result,name);checks.push(name);console.log('PASS',name);};
const dirty=page=>page.locator('#draft-form').getAttribute('data-unsaved-changes').then(v=>v==='true');
const writes=page=>page.evaluate(()=>t.calls.filter(c=>['save','enqueue','create'].includes(c.action)));
async function setup(browser,width=390,mode='owner',existingContext=null){
 const context=existingContext||await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});await context.addInitScript(mode=>window.fixtureMode=mode,mode);await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage(),dialogs=[];let answer=false;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());return answer?d.accept():d.dismiss();});await page.goto(origin+'/fixture.html?church=M%2B&project='+first);await page.waitForFunction(()=>document.querySelector('#workspace:not([hidden])')||document.querySelector('#status').dataset.tone==='error');
 return {page,context,dialogs,answer(value){answer=value;}};
}
const idle=page=>page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')!=='true');
const step=async(page,name)=>{await page.locator('[data-step='+name+']').click();await page.locator('[data-panel='+name+']').waitFor({state:'visible'});};
if(process.env.CHURCH_PREVIEW_ONLY==='1'){console.log(origin+'/fixture.html?church=M%2B&project='+first);await new Promise(()=>{});}
const entries=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('church-os-sermon-drafts-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts'),q=tx.objectStore('drafts').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close();};r.onerror=()=>reject(r.error);}));
const deviceStatus=page=>page.locator('.studio-device-status');
const backup=async page=>{await page.getByRole('button',{name:'在這台裝置保留草稿',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.studio-device-status').textContent.includes('已保留於'));};
const retained=async(page,text)=>{await page.fill('#manuscript',text);await page.waitForFunction(value=>document.querySelector('.studio-device-status').textContent.includes('已保留於')&&document.querySelector('#manuscript').value===value,text);};
async function reopen(browser,f,width=390){await f.page.close({runBeforeUnload:false});return setup(browser,width,'owner',f.context);}
async function mutateRow(page,change){await page.evaluate(change=>new Promise(resolve=>{const r=indexedDB.open('church-os-sermon-drafts-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),q=tx.objectStore('drafts').openCursor();q.onsuccess=()=>{const cursor=q.result;if(cursor){const row=cursor.value;if(change==='expired')row.expiresAt=Date.now()-1;if(change==='invalid')row.payload={unknown:'invalid'};cursor.update(row);}};tx.oncomplete=()=>{db.close();resolve();};};}),change);}
async function downloadCopy(page,name){const event=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const item=await event;return {name:item.suggestedFilename(),text:await readFile(await item.path(),'utf8')};}
const copyText=page=>page.locator('.draft-copy-dialog textarea');
try{for(const engine of ['chromium','webkit']){
 const browser=await(engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{
  for(const width of [390,1440]){
   const f=await setup(browser,width),{page,context}=f,prefix=engine+' '+width+': ';
   try{
    await page.fill('#manuscript','<img src=x onerror="window.executed=true">本頁未送出的講章');await step(page,'information');await page.fill('#edit-title','');await page.fill('#notes','尚未送出的私人筆記');await page.getByRole('button',{name:'取回本頁內容',exact:true}).click();await copyText(page).waitFor();
    check(await copyText(page).getAttribute('readonly')!==null&&await copyText(page).inputValue().then(s=>s.includes('本頁未送出的講章')&&s.includes('尚未送出的私人筆記'))&&(await writes(page)).length===0&&await dirty(page),prefix+'incomplete page draft opens read-only without a business write or clearing dirty state');
    check(!await page.evaluate(()=>!!window.executed)&&await page.locator('.draft-copy-dialog img').count()===0,prefix+'draft text is never interpreted as HTML');
    const contrast=await page.evaluate(contrastMetrics);check(!contrast.failures.length,prefix+'copy dialog meets contrast thresholds '+JSON.stringify(contrast.failures));
    check(await page.locator('.draft-copy-dialog button').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>=44&&n.getBoundingClientRect().width>=44))&&await page.locator('.draft-copy-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1),prefix+'copy actions retain 44 px areas and fit the dialog');
    await page.getByRole('button',{name:'全選文字',exact:true}).click();check(await copyText(page).evaluate(n=>n.selectionStart===0&&n.selectionEnd===n.value.length),prefix+'select all uses the system copy flow without clipboard permission');
    const full=await downloadCopy(page,'下載完整副本'),data=JSON.parse(full.text);check(full.name.endsWith('.json')&&data.kind==='sermon'&&data.source==='page'&&data.payload.information.title===''&&data.payload.manuscript.includes('本頁未送出的講章')&&!('userId'in data)&&!('sessionId'in data)&&!('revision'in data),prefix+'complete copy retains incomplete fields without authentication or storage identifiers');
    const text=await downloadCopy(page,'下載文字副本');check(text.name.endsWith('.txt')&&text.text.includes('素材')&&text.text.includes('投影片')&&text.text.includes('本頁未送出的講章')&&(await entries(page)).length===0,prefix+'text download preserves readable content without enabling device storage');
    await page.evaluate(()=>document.documentElement.style.fontSize='32px');check(await page.locator('.draft-copy-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1)&&await copyText(page).evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=32),prefix+'200 percent text remains usable');await page.evaluate(()=>document.documentElement.style.fontSize='');
    await page.locator('.draft-copy-dialog').screenshot({path:path.join(out,'copy-'+engine+'-'+width+'.png')});await page.keyboard.press('Escape');await page.locator('.draft-copy-dialog').waitFor({state:'detached'});check(await page.locator('.draft-copy-dialog').count()===0&&await page.evaluate(()=>document.activeElement.textContent==='取回本頁內容'&&document.body.style.position!=='fixed'),prefix+'Escape closes the copy, restores focus and releases background scroll');
   }finally{await context.close();}
  }
  for(const scenario of ['version','delete','noexport','revoke','logout','logout_open','logout_download','cancel_download','changed_copy','expired','invalid','storage','save_conflict','stale_page']){
   let f=await setup(browser),{page,context}=f,prefix=engine+' '+scenario+': ';
   try{
    await backup(page);await retained(page,'裝置中的舊講章不能遺失');f=await reopen(browser,f);page=f.page;
    if(scenario==='noexport'){await page.evaluate(()=>t.noexport=true);await page.getByRole('button',{name:'查看裝置草稿',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.studio-device-status').textContent.includes('匯出權限'));check(await page.locator('.draft-copy-dialog').count()===0&&(await entries(page)).length===1,prefix+'fresh export restriction blocks opening without deleting the copy');continue;}
    if(scenario==='invalid'||scenario==='expired')await mutateRow(page,scenario);
    if(scenario==='storage')await page.evaluate(()=>IDBDatabase.prototype.transaction=function(){throw Error('synthetic storage unavailable');});
    if(scenario==='logout_open')await page.evaluate(()=>t.authDelay=150);
    if(scenario==='version')await page.evaluate(id=>t.projects[id].project.version++,first);
    if(scenario==='delete')await page.evaluate(id=>delete t.projects[id],first);
    if(scenario==='save_conflict'){await page.getByRole('button',{name:'繼續裝置草稿',exact:true}).click();await idle(page);await page.evaluate(id=>t.projects[id].project.version++,first);await page.click('#save');await idle(page);await page.getByRole('button',{name:'取回本頁內容',exact:true}).click();await copyText(page).waitFor();check(await dirty(page)&&await copyText(page).inputValue().then(s=>s.includes('裝置中的舊講章不能遺失'))&&(await writes(page)).length===1,prefix+'conflicted formal save retains page input and allows an independent copy');continue;}
    await page.getByRole('button',{name:'查看裝置草稿',exact:true}).click();
    if(scenario==='logout_open'){await page.evaluate(()=>t.auth('SIGNED_OUT',null));await page.waitForTimeout(250);check(await page.locator('.draft-copy-dialog').count()===0&&await page.locator('#content').isHidden(),prefix+'late verification cannot open a copy after logout');continue;}
    if(['invalid','expired','storage'].includes(scenario)){await idle(page);check(await page.locator('.draft-copy-dialog').count()===0&&(await writes(page)).length===0,prefix+'invalid, expired or unreadable data never opens or writes');continue;}
    await copyText(page).waitFor();
    if(scenario==='version'||scenario==='delete'){const before=(await entries(page))[0].revision;const result=await downloadCopy(page,'下載完整副本');check(JSON.parse(result.text).payload.manuscript==='裝置中的舊講章不能遺失'&&(await entries(page))[0].revision===before&&(await writes(page)).length===0,prefix+'old copy remains retrievable after formal version change or deletion without applying it');continue;}
    if(scenario==='logout'){await page.evaluate(()=>t.auth('SIGNED_OUT',null));check(await page.locator('.draft-copy-dialog').count()===0&&await page.locator('#content').isHidden(),prefix+'logout immediately closes private copy content');continue;}
    if(scenario==='revoke')await page.evaluate(()=>t.noexport=true);
    if(scenario==='logout_download'||scenario==='cancel_download')await page.evaluate(()=>t.authDelay=150);
    if(scenario==='changed_copy'){const other=await setup(browser,390,'owner',context);await other.page.getByRole('button',{name:'繼續裝置草稿',exact:true}).click();await idle(other.page);await retained(other.page,'另一分頁的新副本');}
    if(scenario==='stale_page'){await page.keyboard.press('Escape');await page.getByRole('button',{name:'取回本頁內容',exact:true}).click();await copyText(page).waitFor();await page.locator('#manuscript').evaluate(n=>{n.value='背景內容已變更';n.dispatchEvent(new Event('input',{bubbles:true}));});}
    let downloaded=false;page.on('download',()=>downloaded=true);await page.getByRole('button',{name:'下載完整副本',exact:true}).click();
    if(scenario==='logout_download')await page.evaluate(()=>t.auth('SIGNED_OUT',null));
    if(scenario==='cancel_download')await page.keyboard.press('Escape');
    await page.waitForTimeout(250);check(!downloaded&&await page.locator('.draft-copy-dialog').count()===0,prefix+'revoked, replaced or cancelled source never produces a stale download');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
check(errors.length===0,'no uncaught browser errors '+errors.join('; '));await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,realIPhone:false},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
