import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFixture,chromium,webkit,edit,device,enable,settled,writes,localRow,updateRow,outputDir} from './devotional-draft-fixture.mjs';
import {contrastMetrics} from './phase3/contrast.mjs';
const fixture=await createFixture(),out=await outputDir('devotional-copy'),checks=[];
const check=(ok,name)=>{assert(ok,name);checks.push(name);console.log('PASS',name);};
const dialog=page=>page.getByRole('dialog'),open=async(page,source='page')=>{await device(page,source==='page'?'取回本頁內容':'查看裝置草稿').click();await dialog(page).waitFor();await settled(page);};
const close=async page=>{await page.keyboard.press('Escape');await dialog(page).waitFor({state:'detached'});};
async function download(page,full=false){const file=page.waitForEvent('download');await dialog(page).getByRole('button',{name:full?'下載完整副本':'下載文字副本',exact:true}).click();const d=await file;return{name:d.suggestedFilename(),text:await readFile(await d.path(),'utf8')};}
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{
 for(const width of [390,1440]){
  const f=await fixture.setup(browser,width),{context,page}=f,p=engine+' '+width+': ';
  try{
   await edit(page);await page.locator('[name=devotional_title]').fill('合成副本 <img src=x onerror=alert(1)>');await page.locator('[name=response_prayer]').fill('');await open(page);
   check(await dialog(page).getByRole('textbox',{name:'草稿內容'}).inputValue().then(t=>t.includes('<img src=x onerror=alert(1)>')&&t.includes('2027-01-01'))&&await dialog(page).locator('img').count()===0,p+'incomplete content and HTML are read-only text with the selected date');
   check(await localRow(page)===null&&(await writes(page)).length===0&&await page.locator('#list').getAttribute('data-unsaved-changes')==='true',p+'viewing a page copy neither opts in nor clears dirty input');
   await dialog(page).getByRole('button',{name:'全選文字',exact:true}).click();check(await dialog(page).getByRole('textbox').evaluate(n=>n.readOnly&&n.selectionStart===0&&n.selectionEnd===n.value.length),p+'native selection covers the whole copy');
   const text=await download(page),full=await download(page,true),json=JSON.parse(full.text);check(text.name.endsWith('.txt')&&text.text.includes('回應禱告')&&text.text.includes('未送出')&&full.name.endsWith('.json')&&!/[<>]/.test(full.name),p+'actual TXT and JSON downloads preserve content with safe file names');
   check(json.format==='church-os-draft-copy-v1'&&json.kind==='devotional'&&json.source==='page'&&json.fields.response_prayer===''&&Object.keys(json.fields).length===11&&!/access_token|sessionId|userId|baseFingerprint/.test(full.text),p+'complete copy contains known fields without login or storage identifiers');
   check(await dialog(page).locator('.draft-copy-status').textContent().then(t=>t.includes('已準備下載')&&!t.includes('已儲存')),p+'download feedback asks the user to check browser records');
   const contrast=await page.evaluate(contrastMetrics);check(contrast.failures.length===0,p+'copy dialog meets text contrast '+JSON.stringify(contrast.failures));
   check(await dialog(page).locator('button').evaluateAll(ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.height>=44&&r.width>=44;})),p+'all dialog actions meet touch targets');
   await dialog(page).screenshot({path:path.join(out,'copy-'+engine+'-'+width+'.png')});await close(page);
   check(await page.evaluate(()=>document.activeElement.textContent==='取回本頁內容')&&await page.locator('[name=response_prayer]').inputValue()===''&&await page.locator('#list').getAttribute('data-unsaved-changes')==='true',p+'Escape returns focus and retains incomplete editor text');
   await enable(page);await page.locator('[name=devotional_title]').fill('裝置副本合成文字');await page.waitForFunction(()=>document.querySelector('.devotional-device-status').textContent.startsWith('已保留於'));const before=await localRow(page);await open(page,'device');const deviceJson=JSON.parse((await download(page,true)).text);
   check(deviceJson.source==='device'&&deviceJson.fields.devotional_title==='裝置副本合成文字'&&(await localRow(page)).revision===before.revision&&(await writes(page)).length===0,p+'device export preserves its revision and never approves');await close(page);
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');await open(page);const geometry=await dialog(page).evaluate(n=>({width:n.getBoundingClientRect().width,viewport:innerWidth,font:parseFloat(getComputedStyle(n.querySelector('textarea')).fontSize),scroll:n.scrollWidth,client:n.clientWidth}));check(geometry.width<=geometry.viewport&&geometry.scroll<=geometry.client+1&&geometry.font>=32,p+'200 percent copy text fits and remains readable '+JSON.stringify(geometry));
  }finally{await context.close();}
 }
 for(const scenario of ['noexport','revoked_open','revoked_download','changed_page','changed_copy','expired_copy','bad_fields','cancel','logout','changed_official','deleted_official','save_unknown','save_readback','fresh_save_conflict','cancel_restore','cross_month','late_identity','cleanup_conflict']){
  const f=await fixture.setup(browser,390),{context,page}=f,p=engine+' '+scenario+': ';let downloads=0;page.on('download',()=>downloads++);
  try{
   if(scenario==='noexport'){await page.evaluate(()=>t.exportDenied=true);await page.getByRole('button',{name:'重新載入',exact:true}).click();await settled(page);await edit(page);check(await device(page,'取回本頁內容').isHidden()&&(await writes(page)).length===0,p+'no export permission means no copy entry');continue;}
   await edit(page);await page.locator('[name=devotional_title]').fill('合成安全副本');
   if(['changed_copy','expired_copy','bad_fields','changed_official','deleted_official','cross_month'].includes(scenario))await enable(page);
   if(scenario==='revoked_open'){
    await page.evaluate(()=>t.exportDenied=true);await device(page,'取回本頁內容').click();await settled(page);check(await dialog(page).count()===0&&downloads===0,p+'fresh permission is required before opening');
   }else if(['changed_official','deleted_official'].includes(scenario)){
    f.answer(true);await page.getByRole('button',{name:'取消編輯',exact:true}).click();await page.evaluate(kind=>{if(kind==='changed_official')t.rows[0].version++;else t.rows.shift();},scenario);await device(page,'繼續裝置草稿').click();await settled(page);check(await page.locator('.devotional-editor').count()===0,p+'old formal content prevents applying the draft');await open(page,'device');const d=JSON.parse((await download(page,true)).text);check(d.fields.devotional_title==='合成安全副本'&&(await writes(page)).length===0,p+'own existing copy is still downloadable after formal change or deletion');
   }else if(['save_unknown','save_readback'].includes(scenario)){
    await page.evaluate(kind=>{if(kind==='save_unknown')t.invalidAck=true;else t.afterWriteFail=true;},scenario);await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();await settled(page);await open(page);check((await download(page)).text.includes('合成安全副本')&&(await writes(page)).length===1,p+'input remains exportable after an uncertain result without another approval');
   }else if(scenario==='fresh_save_conflict'){
    await enable(page);f.answer(true);await page.getByRole('button',{name:'取消編輯',exact:true}).click();await device(page,'繼續裝置草稿').click();await settled(page);await page.evaluate(()=>t.rows[0].version++);await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();await settled(page);check((await writes(page)).length===0&&await page.locator('[name=devotional_title]').inputValue()==='合成安全副本'&&await page.locator('#status').textContent().then(t=>t.includes('正式靈修已變更')),p+'restored drafts are checked again immediately before formal save');
   }else if(scenario==='cancel_restore'){
    await enable(page);f.answer(true);await page.getByRole('button',{name:'取消編輯',exact:true}).click();await edit(page);await page.locator('[name=devotional_title]').fill('保留目前輸入');f.answer(false);await device(page,'繼續裝置草稿').click();check(await page.locator('[name=devotional_title]').inputValue()==='保留目前輸入'&&(await writes(page)).length===0,p+'declining to replace dirty input cancels restore');
   }else if(scenario==='cross_month'){
    f.answer(true);await page.getByRole('button',{name:'取消編輯',exact:true}).click();await page.locator('#devotional-month').selectOption('2027-02');await settled(page);await device(page,'繼續裝置草稿').click();await settled(page);check(await page.locator('#devotional-month').inputValue()==='2027-01'&&await page.locator('[name=devotional_title]').inputValue()==='合成安全副本',p+'restoring another month selects its actual date and month');
   }else if(scenario==='cleanup_conflict'){
    await enable(page);const external=await updateRow(page,{fields:{...(await localRow(page)).fields,devotional_title:'另一分頁的合成副本'}});await page.locator('[name=devotional_title]').fill('本頁正式校訂');await page.waitForFunction(()=>document.querySelector('.devotional-device-status').textContent.includes('另一個分頁'));await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();await settled(page);check((await writes(page)).length===1&&(await localRow(page)).revision===external.revision&&await page.locator('#status').textContent().then(t=>t.includes('副本尚未清除')&&t.includes('勿重複送出')),p+'a confirmed save reports cleanup conflict and preserves the other tab copy');
   }else if(scenario==='late_identity'){
    await page.evaluate(()=>t.identityDelay=250);const opening=device(page,'取回本頁內容').click();await page.waitForFunction(()=>!!document.querySelector('.review-panel[aria-busy=true]'));await page.evaluate(()=>t.signOut());await opening;await page.waitForTimeout(350);check(await dialog(page).count()===0&&await page.locator('#devotional-device').isHidden()&&(await writes(page)).length===0,p+'late identity response cannot reopen private content after sign out');
   }else{
    await open(page,['changed_copy','expired_copy','bad_fields'].includes(scenario)?'device':'page');
    if(scenario==='revoked_download')await page.evaluate(()=>t.exportDenied=true);
    if(scenario==='changed_page')await page.locator('[name=devotional_title]').evaluate(n=>n.value='已變動');
    if(scenario==='changed_copy')await updateRow(page,{fields:{...(await localRow(page)).fields,devotional_title:'另一分頁副本'}});
    if(scenario==='bad_fields')await updateRow(page,{fields:{unexpected:'不能匯出'}});
    if(scenario==='expired_copy')await page.evaluate(async()=>{const q=indexedDB.open('church-os-devotional-drafts-v1',1),db=await new Promise(r=>q.onsuccess=()=>r(q.result));await new Promise(r=>{const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),request=s.get(JSON.stringify([t.scope.userId,t.scope.sessionId,'M+']));request.onsuccess=()=>s.put({...request.result,expiresAt:Date.now()-1});tx.oncomplete=r;});db.close();});
    if(scenario==='logout'){await page.evaluate(()=>t.signOut());await page.waitForTimeout(50);check(await dialog(page).count()===0&&await page.locator('.devotional-editor').count()===0&&downloads===0,p+'sign out closes copy and removes the private editor');continue;}
    if(scenario==='cancel'){await page.evaluate(()=>t.identityDelay=250);await dialog(page).getByRole('button',{name:'下載完整副本',exact:true}).click();await page.keyboard.press('Escape');await page.waitForTimeout(350);check(await dialog(page).count()===0&&downloads===0,p+'cancelling during verification prevents a late download');continue;}
    await dialog(page).getByRole('button',{name:'下載完整副本',exact:true}).click();await dialog(page).waitFor({state:'detached'});await page.waitForTimeout(30);check(downloads===0&&(await writes(page)).length===0,p+'stale or unauthorized source prevents download');
    if(scenario==='bad_fields'){await device(page,'查看裝置草稿').click();await settled(page);check(await dialog(page).count()===0,p+'unknown device fields cannot be re-opened as a copy');}
   }
  }finally{await context.close();}
 }
 }finally{await browser.close();}
}
check(fixture.errors.length===0,'no uncaught errors '+fixture.errors.join('; '));await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,realIPhone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
}finally{fixture.close();}
