import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFixture,chromium,webkit,ready,edit,device,enable,settled,writes,localRow,updateRow,outputDir} from './devotional-draft-fixture.mjs';
import {contrastMetrics} from './phase3/contrast.mjs';
const fixture=await createFixture(),out=await outputDir('devotional-device'),checks=[];
const check=(ok,name)=>{assert(ok,name);checks.push(name);console.log('PASS',name);};
if(process.env.CHURCH_PREVIEW_ONLY==='1'){console.log(fixture.origin+'/fixture.html');await new Promise(()=>{});}
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{
 for(const width of [390,1440]){
  const f=await fixture.setup(browser,width),{page,context}=f,p=engine+' '+width+': ';
  try{
   await edit(page);await page.locator('[name=devotional_title]').fill('合成未送出靈修');
   check(await localRow(page)===null&&(await writes(page)).length===0,p+'editing does not opt in or approve');
   await enable(page);const first=await localRow(page);check(first.fields.devotional_title==='合成未送出靈修'&&first.expiresAt-first.updatedAt===86400000&&first.recordId.endsWith('2'),p+'explicit opt in keeps a bounded copy of the selected record for 24 hours');
   await page.locator('[name=response_prayer]').fill('');await page.waitForFunction(()=>document.querySelector('.devotional-device-status').textContent.startsWith('已保留於'));check((await localRow(page)).fields.response_prayer==='',p+'incomplete required text remains recoverable');
   const contrast=await page.evaluate(contrastMetrics);check(contrast.failures.length===0,p+'populated device state meets contrast '+JSON.stringify(contrast.failures));
   check(await page.locator('#devotional-device button:visible').evaluateAll(ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.height>=44&&r.width>=44;})),p+'device controls retain 44 px touch targets');
   await page.locator('#devotional-device').screenshot({path:path.join(out,'device-'+engine+'-'+width+'.png')});
   f.answer(true);await page.reload();await ready(page);check(await device(page,'繼續裝置草稿').isVisible()&&await page.locator('.devotional-editor').count()===0,p+'reload offers a copy without applying it');
   await device(page,'繼續裝置草稿').click();await settled(page);check(await page.locator('[name=devotional_title]').inputValue()==='合成未送出靈修'&&await page.locator('[name=response_prayer]').inputValue()===''&&(await writes(page)).length===0,p+'verified restore keeps incomplete text and never approves');
   check(await page.locator('#list').getAttribute('data-unsaved-changes')==='true',p+'restored content remains dirty');
   await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();check((await writes(page)).length===0&&await page.locator('[name=response_prayer]').getAttribute('aria-invalid')==='true',p+'restoring does not weaken formal validation');
   await page.locator('[name=response_prayer]').fill('合成回應禱告');await page.evaluate(()=>t.writeFail=true);await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();await settled(page);
   check(await page.locator('[name=devotional_title]').inputValue()==='合成未送出靈修'&&(await localRow(page)).fields.response_prayer==='合成回應禱告',p+'rejected save retains page input and device copy');
   await page.evaluate(()=>t.writeFail=false);await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();await settled(page);
   check((await writes(page)).length===2&&await localRow(page)===null&&await page.locator('.devotional-editor').count()===0,p+'confirmed save clears only its copy and returns to reading');
   await edit(page);await enable(page);await page.locator('[name=life_application]').fill('保留本頁合成應用');await device(page,'停止保留並刪除裝置草稿').click();await settled(page);
   check(await localRow(page)===null&&await page.locator('[name=life_application]').inputValue()==='保留本頁合成應用',p+'stopping opt in removes the copy without discarding page input');
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');const geometry=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,font:parseFloat(getComputedStyle(document.querySelector('#devotional-device button')).fontSize)}));check(geometry.width<=geometry.viewport+1&&geometry.font>=32,p+'200 percent type remains usable '+JSON.stringify(geometry));
  }finally{await context.close();}
 }
 for(const scenario of ['changed','deleted','permission','session','expired','revision','storage','signed_out','unknown_ack','readback','readonly']){
  const f=await fixture.setup(browser,390,scenario),{page,context}=f,p=engine+' '+scenario+': ';
  try{
   if(scenario==='readonly'){check(await page.locator('#devotional-device').isHidden()&&await page.locator('[data-edit]:visible').count()===0,p+'read-only users receive no device controls');continue;}
   await edit(page);await page.locator('[name=devotional_title]').fill('合成恢復情境');await enable(page);f.answer(true);
   if(['changed','deleted','permission'].includes(scenario)){
    await page.getByRole('button',{name:'取消編輯',exact:true}).click();await page.evaluate(kind=>{if(kind==='changed')t.rows[0].version++;if(kind==='deleted')t.rows.shift();if(kind==='permission')t.denied=true;},scenario);await device(page,'繼續裝置草稿').click();await settled(page);
    check(await page.locator('.devotional-editor').count()===0&&(await writes(page)).length===0&&!!await localRow(page),p+'refused restore preserves its copy and causes no approval');
   }else if(scenario==='session'){
    await context.addInitScript(()=>window.fixtureSession='00000000-0000-4000-8000-000000000099');await page.reload();await ready(page);check(await device(page,'繼續裝置草稿').isHidden()&&(await writes(page)).length===0,p+'another login cannot resume the earlier login copy');
   }else if(scenario==='expired'){
    await page.evaluate(async()=>{const request=indexedDB.open('church-os-devotional-drafts-v1',1);const db=await new Promise(r=>request.onsuccess=()=>r(request.result));await new Promise((r,j)=>{const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),q=s.get(JSON.stringify([t.scope.userId,t.scope.sessionId,'M+']));q.onsuccess=()=>s.put({...q.result,expiresAt:Date.now()-1});tx.oncomplete=r;tx.onerror=j;});db.close();});await page.reload();await ready(page);check(await device(page,'繼續裝置草稿').isHidden()&&await localRow(page)===null,p+'expired copies are removed rather than restored');
   }else if(scenario==='revision'){
    const external=await updateRow(page,{fields:{...(await localRow(page)).fields,devotional_title:'另一分頁合成文字'}});await page.locator('[name=devotional_title]').fill('這一頁的合成文字');await page.waitForFunction(()=>document.querySelector('.devotional-device-status').textContent.includes('另一個分頁'));
    check((await localRow(page)).revision===external.revision&&await page.locator('[name=devotional_title]').inputValue()==='這一頁的合成文字',p+'revision conflict never overwrites either page input or the newer copy');
   }else if(scenario==='storage'){
    await device(page,'停止保留並刪除裝置草稿').click();await settled(page);await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('synthetic quota','QuotaExceededError');};});await device(page,'在這台裝置保留草稿').click();await settled(page);check(await page.locator('.devotional-device-status').textContent().then(s=>s.includes('未能更新'))&&await page.locator('[name=devotional_title]').inputValue()==='合成恢復情境',p+'storage failure does not prevent formal editing');
   }else if(scenario==='signed_out'){
    await page.evaluate(()=>t.signOut());await page.waitForFunction(()=>document.querySelector('#devotional-device').hidden);check(await page.locator('.devotional-editor').count()===0&&await page.locator('#list').textContent().then(s=>!s.includes('合成恢復情境')),p+'sign out removes visible private editor state');await page.waitForFunction(async()=>{const m=await import('/devotional-draft-store.mjs');return !await m.createDevotionalDraftStore().read(t.scope);});check(await localRow(page)===null,p+'sign out clears that login device copy');
   }else{
    await page.evaluate(kind=>{if(kind==='unknown_ack')t.invalidAck=true;else t.afterWriteFail=true;},scenario);await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();await settled(page);
    check((await writes(page)).length===1&&await page.getByRole('button',{name:'儲存並直接核准',exact:true}).isDisabled()&&await page.locator('[name=devotional_title]').inputValue()==='合成恢復情境',p+'uncertain write or readback retains input and blocks resubmission');
    check(scenario==='unknown_ack'?!!await localRow(page):await localRow(page)===null,p+'device cleanup follows acknowledged business success');
   }
  }finally{await context.close();}
 }
 }finally{await browser.close();}
}
check(fixture.errors.length===0,'no uncaught errors '+fixture.errors.join('; '));await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,realIPhone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
}finally{fixture.close();}
