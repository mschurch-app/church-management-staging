import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.CHURCH_TEST_OUT||path.join(root,'tests/phase4/results/schedule-drafts');await mkdir(out,{recursive:true});
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
const stubs={'/admin-db.mjs':'export const db=window.fixtureDb;','/admin-access.mjs':`export const readAccess=async()=>{if(t.denied)throw Error('無法確認排班權限');return {user:{id:t.userId}};};export const canOpen=()=>!t.denied;export const canAction=()=>!t.denied&&!t.readonly;`,'/schedule-management.mjs':management};
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
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{
 for(const width of [390,1440])for(const church of ['M+','SHiNE']){
  const prefix=engine+' '+width+' '+church+': ',context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  try{
   let page=await setup(context,church);await page.getByRole('button',{name:'＋ 新增安排',exact:true}).click();await page.locator('#editor [name=event]').fill('未開啟暫存');
   check((await entries(page)).length===0,prefix+'does not persist any input before explicit opt-in');
   await page.locator('#editor [name=service_date]').fill('2027-01-10');await backup(page);await typed(page);
   let rows=await entries(page);check(rows.length===1&&rows[0].church===church&&rows[0].fields.event==='合成未送出草稿',prefix+'opt-in stores only this login and church');
   const revision=rows[0].revision;await page.locator('#schedule-role-search').fill('音控');await page.selectOption('#schedule-role-filter','empty');check((await entries(page))[0].revision===revision,prefix+'role filters never change persisted business fields');
   page=await reopen(context,page,church);await recovered(page);
   check(await page.locator('#editor [name=event]').inputValue()==='合成未送出草稿'&&await page.locator('#editor [name=service_date]').inputValue()==='2027-01-10',prefix+'new page instance restores date and text after its predecessor is destroyed');
   check(await page.evaluate(()=>t.saves.length===0)&&await page.locator('#editor form').getAttribute('data-unsaved-changes')==='true',prefix+'restore remains unsaved and makes no server write');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+'recovery fits the viewport');
   if(church==='M+')await page.locator('#editor').screenshot({path:path.join(out,'draft-'+engine+'-'+width+'.png')});
   await page.evaluate(()=>t.writeFail=true);await page.getByRole('button',{name:'儲存排班',exact:true}).click();await page.getByText('合成儲存失敗',{exact:true}).first().waitFor();
   check((await entries(page)).length===1&&await page.locator('#editor [name=event]').inputValue()==='合成未送出草稿',prefix+'server failure retains the device draft and form');
   await page.evaluate(()=>t.writeFail=false);await page.getByRole('button',{name:'儲存排班',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor').hidden);
   check((await entries(page)).length===0&&await page.evaluate(()=>t.saves.length===2),prefix+'acknowledged save removes the draft without a background resubmit');
  }finally{await context.close();}
 }
 // Failure and isolation cases use a fresh context for each scenario.
 for(const scenario of ['changed','deleted','roles','readonly','denied','session','account','church','logout','concurrent','stale_save','expired','storage','write_storage','logout_restore','logout_load','invalid_fields']){
  const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),prefix=engine+' '+scenario+': ';
  try{
   let page=await setup(context);await page.locator('#records button').first().click();
   if(scenario==='storage'){
    await page.evaluate(()=>IDBDatabase.prototype.transaction=function(){throw Error('synthetic storage unavailable');});
    await page.getByRole('button',{name:'在這台裝置保留草稿',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.schedule-device-draft-status').textContent.includes('synthetic storage unavailable'));
    check(await page.locator('#editor [name=event]').isVisible()&&await page.getByRole('button',{name:'儲存更正',exact:true}).isEnabled(),prefix+'storage failure leaves normal editing and saving available');continue;
   }
   await backup(page);await typed(page,'合成編輯草稿');
   if(scenario==='logout_load'){
    await page.evaluate(()=>t.listDelay=150);await page.getByRole('button',{name:'重新讀取服事安排',exact:true}).click();await page.evaluate(()=>t.auth('SIGNED_OUT',null));await page.waitForTimeout(250);
    check(!await page.locator('#editor form').count()&&await page.locator('#records').textContent().then(s=>!s.includes('合成講員'))&&await page.getByRole('button',{name:'＋ 新增安排',exact:true}).isDisabled(),prefix+'late schedule list response remains hidden after logout');continue;
   }
   if(scenario==='logout'){
    await page.evaluate(()=>t.auth('SIGNED_OUT',null));await page.waitForFunction(()=>document.querySelector('#editor').hidden);await page.waitForTimeout(100);
    check((await entries(page)).length===0&&await page.locator('#records').textContent().then(s=>!s.includes('合成講員')),prefix+'sign-out hides private form/list and clears the device draft');continue;
   }
   if(scenario==='concurrent'){
    const second=await setup(context);await recovered(second);await typed(second,'另一分頁較新草稿');await page.locator('#editor [name=event]').fill('本頁舊分頁內容');await page.waitForFunction(()=>document.querySelector('.schedule-device-draft-status').textContent.includes('另一個分頁'));
    check((await entries(second))[0].fields.event==='另一分頁較新草稿'&&await page.locator('.schedule-device-draft-status').textContent().then(s=>s.includes('另一個分頁')),prefix+'atomic revision comparison prevents an older tab from replacing a newer draft');continue;
   }
   if(scenario==='write_storage'){
    await page.evaluate(()=>IDBDatabase.prototype.transaction=function(){throw Error('synthetic quota');});await page.locator('#editor [name=event]').fill('儲存空間失敗時的新輸入');await page.waitForFunction(()=>document.querySelector('.schedule-device-draft-status').textContent.includes('未更新'));
    const second=await setup(context);check((await entries(second))[0].fields.event==='合成編輯草稿'&&await page.locator('#editor [name=event]').inputValue()==='儲存空間失敗時的新輸入',prefix+'a failed device write never claims the new input was retained and keeps the previous draft');continue;
   }
   if(scenario==='church'){
    const other=await setup(context,'SHiNE');await other.waitForTimeout(100);check(!await other.locator('#schedule-draft-recovery').isVisible()&&(await entries(other))[0].church==='M+',prefix+'another church cannot reveal or erase the draft');continue;
   }
   page=await reopen(context,page);
   if(scenario==='session'||scenario==='account'){
    await page.evaluate(kind=>{if(kind==='session')t.sessionId='70000000-0000-4000-8000-000000000099';else t.userId='70000000-0000-4000-8000-000000000099';t.auth('SIGNED_IN',t.session());},scenario);await page.getByRole('button',{name:'重新讀取服事安排',exact:true}).click();await page.waitForTimeout(100);
    check(!await page.locator('#schedule-draft-recovery').isVisible()&&(await entries(page)).length===0,prefix+'another login cannot resume the old login draft');continue;
   }
   await page.getByRole('button',{name:'繼續填寫',exact:true}).waitFor();
   if(scenario==='logout_restore'){
    await page.evaluate(()=>t.authDelay=150);await page.getByRole('button',{name:'繼續填寫',exact:true}).click();await page.evaluate(()=>t.auth('SIGNED_OUT',null));await page.waitForTimeout(250);
    check(!await page.locator('#editor form').count()&&!await page.locator('#schedule-draft-recovery').isVisible()&&(await entries(page)).length===0,prefix+'a late identity response cannot reopen a draft after logout');continue;
   }
   if(scenario==='invalid_fields'){
    await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('church-os-schedule-drafts-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),q=tx.objectStore('drafts').openCursor();q.onsuccess=()=>{const c=q.result;if(c)c.update({...c.value,fields:{...c.value.fields,unknown_private_field:'invalid'}});};tx.oncomplete=()=>{db.close();resolve();};};}));
   }
   if(scenario==='expired'){
    await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('church-os-schedule-drafts-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),q=store.openCursor();q.onsuccess=()=>{const c=q.result;if(c){c.update({...c.value,expiresAt:Date.now()-1});}};tx.oncomplete=()=>{db.close();resolve();};};}));page=await reopen(context,page);await page.waitForTimeout(100);check(!await page.locator('#schedule-draft-recovery').isVisible()&&(await entries(page)).length===0,prefix+'expired drafts are removed and cannot be restored');continue;
   }
   if(scenario==='changed')await page.evaluate(()=>{t.rows[0].speaker='另一同工已更新';t.persist();});
   if(scenario==='deleted')await page.evaluate(()=>{t.rows=[];t.persist();});
   if(scenario==='roles')await page.evaluate(()=>t.hiddenRole=true);
   if(scenario==='readonly')await page.evaluate(()=>t.readonly=true);
   if(scenario==='denied')await page.evaluate(()=>t.denied=true);
   await page.getByRole('button',{name:'繼續填寫',exact:true}).click();
   if(scenario==='stale_save'){
    await page.locator('#editor [name=event]').waitFor();await page.evaluate(()=>{t.rows[0].speaker='恢復後別人又修改';t.persist();});await page.getByRole('button',{name:'儲存更正',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('尚未送出'));
    check(await page.evaluate(()=>t.saves.length===0)&&await page.locator('#editor [name=event]').inputValue()==='合成編輯草稿',prefix+'a server change after restore is checked before the manual save');
   }else{
    await page.waitForFunction(()=>document.querySelector('#status').dataset.tone==='error');check(!await page.locator('#editor form').count()&&await page.evaluate(()=>t.saves.length===0)&&(await entries(page)).length===1,prefix+'conflicting or unauthorized draft remains unapplied and never writes');
   }
  }finally{await context.close();}
 }
 }finally{await browser.close();}
}
// A persistent Chromium profile proves the draft outlives the browser process.
const profile=await mkdtemp(path.join(os.tmpdir(),'church-draft-restart-'));let persistent;
try{
 persistent=await chromium.launchPersistentContext(profile,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:390,height:900},serviceWorkers:'block'});
 let page=await setup(persistent);await page.getByRole('button',{name:'＋ 新增安排',exact:true}).click();await page.locator('#editor [name=service_date]').fill('2027-02-14');await backup(page);await typed(page,'瀏覽器重啟合成草稿');await persistent.close();persistent=null;
 persistent=await chromium.launchPersistentContext(profile,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,viewport:{width:390,height:900},serviceWorkers:'block'});
 page=await setup(persistent);await recovered(page);check(await page.locator('#editor [name=event]').inputValue()==='瀏覽器重啟合成草稿'&&await page.evaluate(()=>t.saves.length===0),'Chromium browser process restart retains the opted-in draft without a server write');
}finally{await persistent?.close();await rm(profile,{recursive:true,force:true});}
check(errors.length===0,'no uncaught browser errors: '+errors.join('; '));await writeFile(path.join(out,'draft-checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,realIPhone:false},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
