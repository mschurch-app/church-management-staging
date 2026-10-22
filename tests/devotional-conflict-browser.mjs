import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createFixture,chromium,webkit,edit,device,enable,settled,writes,outputDir,ready} from './devotional-draft-fixture.mjs';
import {contrastMetrics} from './phase3/contrast.mjs';
const fixture=await createFixture(),out=await outputDir('devotional-conflict'),checks=[];
const check=(ok,name)=>{assert(ok,name);checks.push(name);console.log('PASS',name);};
const panel=page=>page.locator('#devotional-conflict'),save=page=>page.getByRole('button',{name:'儲存並直接核准',exact:true});
async function clash(page,optIn=false){await edit(page);await page.locator('[name=devotional_title]').fill('本頁尚未送出的合成修改');if(optIn)await enable(page);await page.evaluate(()=>{t.rows[0].version++;t.rows[0].devotional_title='另一位同工的最新標題';});await save(page).click();await settled(page);await panel(page).waitFor({state:'visible'});}
async function latest(page){await panel(page).getByRole('button',{name:/核對最新|再次核對/}).focus();await page.keyboard.press('Enter');await settled(page);}
if(process.env.CHURCH_PREVIEW_ONLY==='1'){console.log(fixture.origin+'/fixture.html');await new Promise(()=>{});}
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{
 for(const width of [390,1440]){
  const f=await fixture.setup(browser,width),{page,context}=f,p=engine+' '+width+': ';
  try{
   await clash(page);let calls=await writes(page);check(calls.length===1&&calls[0].action==='content_update_v2'&&calls[0].expectedVersion===1,p+'save transmits the originally opened version to the v2 action');
   check(await page.locator('[name=devotional_title]').inputValue()==='本頁尚未送出的合成修改'&&await save(page).isDisabled()&&await page.locator('#list').getAttribute('data-unsaved-changes')==='true',p+'conflict preserves dirty text and blocks another formal write');
   await save(page).evaluate(n=>n.click());check((await writes(page)).length===1,p+'disabled stale save cannot resend');
   await latest(page);check(await panel(page).textContent().then(t=>t.includes('本頁尚未送出的合成修改')&&t.includes('另一位同工的最新標題')&&t.includes('最新正式版本 2'))&&(await writes(page)).length===1,p+'comparison reads both versions without applying or sending changes');
   check(await page.evaluate(()=>document.activeElement.dataset.conflictAction==='read'),p+'keyboard comparison restores focus to its live action');
   await page.locator('[name=devotional_title]').fill('核對時繼續整理的合成修改');check(await panel(page).textContent().then(t=>t.includes('核對時繼續整理的合成修改')),p+'comparison follows continued local editing');
   const contrast=await page.evaluate(contrastMetrics);check(!contrast.failures.length,p+'populated conflict comparison meets contrast '+JSON.stringify(contrast.failures));
   check(await panel(page).locator('button').evaluateAll(ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})),p+'conflict actions meet 44 px targets');
   await panel(page).screenshot({path:path.join(out,'conflict-'+engine+'-'+width+'.png')});
   await panel(page).getByRole('button',{name:'以最新版重新編輯',exact:true}).click();await settled(page);check(await page.locator('[name=devotional_title]').inputValue()==='核對時繼續整理的合成修改'&&await panel(page).isVisible()&&await save(page).isDisabled(),p+'declining discard retains local text and the conflict lock');
   await device(page,'取回本頁內容').click();await page.getByRole('dialog').waitFor();check(await page.getByRole('dialog').getByRole('textbox').inputValue().then(t=>t.includes('核對時繼續整理的合成修改')),p+'local text remains recoverable through its existing copy dialog');await page.keyboard.press('Escape');
   f.answer(true);await panel(page).getByRole('button',{name:'以最新版重新編輯',exact:true}).click();await settled(page);check(await panel(page).isHidden()&&await page.locator('[name=devotional_title]').inputValue()==='另一位同工的最新標題'&&await save(page).isEnabled(),p+'explicit discard opens a new editor from the latest version');
   check(await page.locator('.devotional-choice').first().textContent().then(t=>t.includes('2027-01-01')),p+'using the latest record preserves chronological list order');
   await page.locator('[name=devotional_title]').fill('以版本二重新校訂');await save(page).click();await settled(page);calls=await writes(page);check(calls.length===2&&calls[1].expectedVersion===2&&calls[1].values.devotional_title==='以版本二重新校訂',p+'new editing submits version two once rather than rebasing stale text');
   await clash(page);await latest(page);await page.evaluate(()=>document.documentElement.style.fontSize='32px');const size=await panel(page).evaluate(n=>({page:document.documentElement.scrollWidth,width:innerWidth,font:parseFloat(getComputedStyle(n.querySelector('button')).fontSize)}));check(size.page<=size.width+1&&size.font>=32,p+'200 percent text fits '+JSON.stringify(size));
  }finally{await context.close();}
 }
 for(const scenario of ['device','missing_contract','missing_version','rollback','schema_missing','deleted','read_fail','changed_again','review','logout']){
  const f=await fixture.setup(browser,390),{context,page}=f,p=engine+' '+scenario+': ';
  try{
   if(['missing_contract','missing_version'].includes(scenario)){
    await page.evaluate(kind=>{if(kind==='missing_contract')t.contract=false;else delete t.rows[0].version;},scenario);await page.getByRole('button',{name:'重新載入',exact:true}).click();await ready(page);await edit(page);check(await save(page).isDisabled()&&await page.locator('#devotional-write-notice').isVisible()&&await device(page,'取回本頁內容').isVisible()&&(await writes(page)).length===0,p+'missing version capability disables writes while preserving editing and copies');continue;
   }
   if(['rollback','schema_missing'].includes(scenario)){
    await edit(page);await page.locator('[name=devotional_title]').fill('保留合成輸入');await page.evaluate(kind=>{if(kind==='rollback')t.rollback=true;else t.schemaMissing=true;},scenario);await save(page).click();await settled(page);check(await save(page).isDisabled()&&await page.locator('[name=devotional_title]').inputValue()==='保留合成輸入'&&(await writes(page)).length===1,p+'backend downgrade or missing schema fails closed without an unversioned retry');continue;
   }
   if(scenario==='review'){
    await page.evaluate(()=>t.rows[0].version++);await page.getByRole('button',{name:'牧師直接核准',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'直接核准',exact:true}).click();await settled(page);check(await panel(page).isVisible()&&(await writes(page))[0].action==='content_review_v2'&&(await writes(page))[0].expectedVersion===1,p+'approval uses its opened version and preserves stale review recovery');continue;
   }
   await clash(page,scenario==='device');
   if(scenario==='device'){check((await writes(page)).length===0&&await panel(page).isVisible(),p+'device preflight conflicts also enter the same recovery workflow');continue;}
   if(scenario==='deleted'){await page.evaluate(()=>t.rows=[]);await latest(page);check(await panel(page).textContent().then(t=>t.includes('目前不存在'))&&await panel(page).getByRole('button',{name:'以最新版重新編輯'}).count()===0&&await page.locator('[name=devotional_title]').inputValue()==='本頁尚未送出的合成修改',p+'deletion provides copy recovery without recreating or applying content');continue;}
   if(scenario==='read_fail'){await page.evaluate(()=>t.readFail=true);await latest(page);check(await panel(page).textContent().then(t=>t.includes('無法核對'))&&await page.locator('[name=devotional_title]').inputValue()==='本頁尚未送出的合成修改'&&await save(page).isDisabled(),p+'failed comparison retains text and the write lock');await page.evaluate(()=>t.readFail=false);await latest(page);check(await panel(page).textContent().then(t=>t.includes('最新正式版本 2')),p+'comparison retry is read-only');continue;}
   if(scenario==='changed_again'){await latest(page);await page.evaluate(()=>{t.rows[0].version++;t.rows[0].devotional_title='再次更新的合成內容';});f.answer(true);await panel(page).getByRole('button',{name:'以最新版重新編輯'}).click();await settled(page);check(await panel(page).textContent().then(t=>t.includes('又有更新'))&&await page.locator('[name=devotional_title]').inputValue()==='本頁尚未送出的合成修改',p+'a second server update requires another comparison before discarding local input');continue;}
   if(scenario==='logout'){await page.evaluate(()=>t.readDelay=250);const reading=panel(page).getByRole('button',{name:'核對最新正式內容'}).click();await page.waitForFunction(()=>!!document.querySelector('.review-panel[aria-busy=true]'));await page.evaluate(()=>t.signOut());await reading;await page.waitForTimeout(350);check(await panel(page).isHidden()&&await page.locator('.devotional-editor').count()===0,p+'late comparison response cannot reveal content after sign out');}
  }finally{await context.close();}
 }
 }finally{await browser.close();}
}
check(fixture.errors.length===0,'no uncaught errors '+fixture.errors.join('; '));await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,iPhone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
}finally{fixture.close();}
