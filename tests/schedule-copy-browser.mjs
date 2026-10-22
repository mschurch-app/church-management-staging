import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.CHURCH_TEST_OUT||path.join(root,'tests/phase4/results/schedule-copy');await mkdir(out,{recursive:true});
const bootstrap=`<script>
const uid='70000000-0000-4000-8000-000000000001',sid='70000000-0000-4000-8000-000000000002';
window.t={userId:uid,sessionId:sid,saves:JSON.parse(localStorage.getItem('fixture-saves')||'[]'),dialogs:[],writeFail:false,readFail:false,denied:false,readonly:false,delay:20,hiddenRole:false,rows:JSON.parse(localStorage.getItem('fixture-rows')||'null')||[{id:1,church_id:'M+',service_date:'2027-01-03',event:'合成主日聚會',speaker:'合成講員',tech_sound:'合成音控',tech_video:'保留導播同工'}]};
t.persist=()=>{localStorage.setItem('fixture-rows',JSON.stringify(t.rows));localStorage.setItem('fixture-saves',JSON.stringify(t.saves));};
const callbacks=[];t.session=()=>({user:{id:t.userId},access_token:[btoa('{}'),btoa(JSON.stringify({sub:t.userId,session_id:t.sessionId})),'fixture'].join('.')});
t.auth=(event,session)=>callbacks.forEach(fn=>fn(event,session));
window.fixtureDb={auth:{getSession:async()=>{if(t.authDelay)await new Promise(r=>setTimeout(r,t.authDelay));return {data:{session:t.session()},error:null};},onAuthStateChange:fn=>{callbacks.push(fn);return {data:{subscription:{unsubscribe(){}}}};}}};
</script>`;
const management=`export const COMMON=['event','speaker','worship_leader','tech_sound','tech_video','usher1','usher2'];export const M_PLUS=['presider','prayer','sunday_school','sunday_school_ta','transport'];export const SHINE=['singers','keyboard','guitar','bass','drums','ushers'];
export async function listSchedules(db,church){if(t.listDelay)await new Promise(r=>setTimeout(r,t.listDelay));if(t.readFail||t.denied)throw Error('清單暫時無法讀取');return t.rows.map(row=>({...row,church_id:church}));}
export const listScheduleMembers=async()=>[{name:'合成同工甲',group_name:'合成小組'}];
export const listRolePreferences=async()=>[{role_key:'speaker',label:'信息分享',is_visible:true,sort_order:1},{role_key:'tech_sound',label:'音控控台',is_visible:!t.hiddenRole,sort_order:2},{role_key:'tech_video',label:'導播',is_visible:false,sort_order:3}];
export async function saveSchedule(db,church,input,previous){t.saves.push({church,input,previous});t.persist();await new Promise(r=>setTimeout(r,t.delay));if(t.writeFail)throw Error('合成儲存失敗');t.rows=[{id:previous?.id||2,church_id:church,...input}];t.persist();}export const saveRolePreferences=async()=>[];`;
const stubs={'/admin-db.mjs':'export const db=window.fixtureDb;','/admin-access.mjs':`export const readAccess=async()=>{if(t.accessDelay)await new Promise(r=>setTimeout(r,t.accessDelay));if(t.denied)throw Error('無法確認排班權限');return {user:{id:t.userId}};};export const canOpen=()=>!t.denied;export const canAction=(a,c,k,action)=>!t.denied&&!t.readonly&&(action!=='export'||!t.noexport);`,'/schedule-management.mjs':management};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://fixture'),file=url.pathname;let data;
 if(file==='/fixture.html'){data=(await readFile(path.join(root,'schedules.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<head>','<head><base href="/">').replace('<html lang="zh-Hant"','<html class="mplus-theme" lang="zh-Hant"').replace('</body>',bootstrap+'<script type="module" src="/schedules-ui.mjs"></script></body>');}
 else if(stubs[file])data=stubs[file];else{const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));data=await readFile(target);}
 res.setHeader('content-type',file==='/fixture.html'?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,checks=[];
const check=(result,name)=>{assert(result,name);checks.push(name);console.log('PASS',name);};
const errors=[];
async function setup(context,church='M+'){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.goto(origin+'/fixture.html?church='+encodeURIComponent(church));await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('筆排班'));return page;
}
const entries=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('church-os-schedule-drafts-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts'),q=tx.objectStore('drafts').getAll();q.onsuccess=()=>resolve(q.result);tx.oncomplete=()=>db.close();};}));
const backup=async page=>{await page.getByRole('button',{name:'在這台裝置保留草稿',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.schedule-device-draft-status')?.textContent.includes('已保留於'));};
const typed=async(page,value='合成未送出草稿')=>{await page.locator('#editor [name=event]').fill(value);await page.waitForFunction(()=>document.querySelector('.schedule-device-draft-status')?.textContent.includes('已保留於'));};
const reopen=async(context,page,church='M+')=>{await page.close({runBeforeUnload:false});const next=await setup(context,church);return next;};
const recovered=async page=>{await page.getByRole('button',{name:'繼續填寫',exact:true}).waitFor();await page.getByRole('button',{name:'繼續填寫',exact:true}).click();await page.locator('#editor [name=event]').waitFor();};
const idle=page=>page.waitForFunction(()=>document.querySelector('#editor').getAttribute('aria-busy')!=='true');
const copyText=page=>page.locator('.draft-copy-dialog textarea');
async function downloadCopy(page,name){const event=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const item=await event;return {name:item.suggestedFilename(),text:await readFile(await item.path(),'utf8')};}
async function changeStored(page,kind){await page.evaluate(kind=>new Promise(resolve=>{const r=indexedDB.open('church-os-schedule-drafts-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),q=tx.objectStore('drafts').openCursor();q.onsuccess=()=>{const c=q.result;if(c){const row=c.value;if(kind==='expired')row.expiresAt=Date.now()-1;else row.fields.unknown_private_field='invalid';c.update(row);}};tx.oncomplete=()=>{db.close();resolve();};};}),kind);}
if(process.env.CHURCH_PREVIEW_ONLY==='1'){console.log(origin+'/fixture.html?church=M%2B');await new Promise(()=>{});}
try{for(const engine of ['chromium','webkit']){
 const browser=await(engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{
  for(const width of [390,1440])for(const church of ['M+','SHiNE']){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),prefix=engine+' '+width+' '+church+': ';
   try{
    const page=await setup(context,church);await page.getByRole('button',{name:'＋ 新增安排',exact:true}).click();await page.locator('#editor [name=event]').fill('本頁尚未送出的安排');await page.locator('#editor [name=speaker]').fill('合成講員甲');await page.getByRole('button',{name:'取回本頁內容',exact:true}).click();await copyText(page).waitFor();
    check(await copyText(page).getAttribute('readonly')!==null&&await copyText(page).inputValue().then(s=>s.includes('本頁尚未送出的安排')&&s.includes('合成講員甲'))&&await page.locator('#editor form').getAttribute('data-unsaved-changes')==='true'&&await page.evaluate(()=>t.saves.length===0),prefix+'incomplete page copy is read-only and retains input without a business write');
    const text=await downloadCopy(page,'下載文字副本');check(text.name.endsWith('.txt')&&text.text.includes(church==='M+'?'M＋大雅教會':'火樂教會')&&text.text.includes('信息分享：合成講員甲'),prefix+'text copy uses the current church and role labels');
    const full=await downloadCopy(page,'下載完整副本'),data=JSON.parse(full.text);check(full.name.endsWith('.json')&&data.kind==='schedule'&&data.church===church&&data.source==='page'&&data.fields.service_date===''&&data.fields.event==='本頁尚未送出的安排'&&!('sessionId'in data)&&!('userId'in data)&&!('baseHash'in data)&&!('revision'in data),prefix+'complete copy retains incomplete fields without login or storage metadata');
    const {contrastMetrics}=await import('./phase3/contrast.mjs'),contrast=await page.evaluate(contrastMetrics);check(!contrast.failures.length&&await page.locator('.draft-copy-dialog button').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>=44)),prefix+'copy dialog has readable contrast and 44 px actions '+JSON.stringify(contrast.failures));
    await page.getByRole('button',{name:'全選文字',exact:true}).click();check(await copyText(page).evaluate(n=>n.selectionEnd===n.value.length&&n.selectionStart===0),prefix+'system copy can select the entire draft');
    await page.evaluate(()=>document.documentElement.style.fontSize='32px');check(await page.locator('.draft-copy-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth+1)&&await copyText(page).evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=32),prefix+'200 percent copy text fits the dialog');await page.evaluate(()=>document.documentElement.style.fontSize='');
    if(church==='M+')await page.locator('.draft-copy-dialog').screenshot({path:path.join(out,'copy-'+engine+'-'+width+'.png')});await page.keyboard.press('Escape');await page.locator('.draft-copy-dialog').waitFor({state:'detached'});check(await page.evaluate(()=>document.activeElement.textContent==='取回本頁內容'&&document.body.style.position!=='fixed'),prefix+'Escape returns focus and releases background scroll');
    check((await entries(page)).length===0&&await page.locator('#editor [name=event]').inputValue()==='本頁尚未送出的安排',prefix+'copying never enables device retention or clears the current form');
   }finally{await context.close();}
  }
  for(const scenario of ['changed','deleted','roles','noexport','revoke','logout','logout_open','logout_download','cancel_download','changed_copy','invalid','storage','expired','stale_page','save_fail','other_church']){
   const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),prefix=engine+' '+scenario+': ';
   try{
    let page=await setup(context);await page.locator('#records button').first().click();await backup(page);await typed(page,'未送出的舊排班');page=await reopen(context,page);
    if(scenario==='other_church'){const other=await setup(context,'SHiNE');check(await other.getByRole('button',{name:'查看裝置草稿',exact:true}).count()===0&&(await entries(other))[0].church==='M+',prefix+'another church cannot expose or erase the pending copy');continue;}
    if(scenario==='changed')await page.evaluate(()=>t.rows[0].speaker='正式資料已更新');
    if(scenario==='deleted')await page.evaluate(()=>t.rows=[]);
    if(scenario==='roles')await page.evaluate(()=>t.hiddenRole=true);
    if(scenario==='noexport')await page.evaluate(()=>t.noexport=true);
    if(scenario==='invalid'||scenario==='expired')await changeStored(page,scenario);
    if(scenario==='storage')await page.evaluate(()=>IDBDatabase.prototype.transaction=function(){throw Error('synthetic storage unavailable');});
    if(scenario==='logout_open')await page.evaluate(()=>t.accessDelay=150);
    if(scenario==='save_fail'){await recovered(page);await page.evaluate(()=>t.writeFail=true);await page.getByRole('button',{name:'儲存更正',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('合成儲存失敗'));await page.getByRole('button',{name:'取回本頁內容',exact:true}).click();await copyText(page).waitFor();check(await copyText(page).inputValue().then(s=>s.includes('未送出的舊排班'))&&(await entries(page)).length===1&&await page.locator('#editor form').getAttribute('data-unsaved-changes')==='true',prefix+'failed formal save retains the form and device copy while allowing recovery');continue;}
    await page.getByRole('button',{name:'查看裝置草稿',exact:true}).click();
    if(scenario==='logout_open'){await page.evaluate(()=>t.auth('SIGNED_OUT',null));await page.waitForTimeout(250);check(await page.locator('.draft-copy-dialog').count()===0&&await page.locator('#editor form').count()===0,prefix+'late identity check cannot expose private copy after logout');continue;}
    if(['noexport','invalid','storage','expired'].includes(scenario)){await idle(page);check(await page.locator('.draft-copy-dialog').count()===0&&await page.evaluate(()=>t.saves.length===0),prefix+'missing permission or invalid storage blocks copy without submitting');continue;}
    await copyText(page).waitFor();
    if(['changed','deleted','roles'].includes(scenario)){const revision=(await entries(page))[0].revision,full=await downloadCopy(page,'下載完整副本');check(JSON.parse(full.text).fields.event==='未送出的舊排班'&&(await entries(page))[0].revision===revision&&await page.evaluate(()=>t.saves.length===0),prefix+'old fields remain retrievable after official data or role changes without applying them');continue;}
    if(scenario==='logout'){await page.evaluate(()=>t.auth('SIGNED_OUT',null));check(await page.locator('.draft-copy-dialog').count()===0&&await page.locator('#editor form').count()===0,prefix+'logout immediately closes the private dialog');continue;}
    if(scenario==='revoke')await page.evaluate(()=>t.noexport=true);
    if(scenario==='logout_download'||scenario==='cancel_download')await page.evaluate(()=>t.accessDelay=150);
    if(scenario==='changed_copy'){const other=await setup(context);await recovered(other);await typed(other,'另一分頁的新排班副本');}
    if(scenario==='stale_page'){await page.keyboard.press('Escape');await recovered(page);await page.getByRole('button',{name:'取回本頁內容',exact:true}).click();await copyText(page).waitFor();await page.locator('#editor [name=event]').evaluate(n=>{n.value='背景編輯已變更';n.dispatchEvent(new Event('input',{bubbles:true}));});}
    let downloaded=false;page.on('download',()=>downloaded=true);await page.getByRole('button',{name:'下載完整副本',exact:true}).click();if(scenario==='logout_download')await page.evaluate(()=>t.auth('SIGNED_OUT',null));if(scenario==='cancel_download')await page.keyboard.press('Escape');await page.waitForTimeout(250);check(!downloaded&&await page.locator('.draft-copy-dialog').count()===0,prefix+'revoked, changed or cancelled copy never downloads stale content');
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
check(errors.length===0,'no uncaught browser errors '+errors.join('; '));await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,realIPhone:false},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
