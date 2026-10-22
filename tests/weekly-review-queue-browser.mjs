import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createFixture,chromium,webkit,ready,writes,outputDir} from './weekly-review-fixture.mjs';
import {contrastMetrics} from './phase3/contrast.mjs';
import {reviewQueue} from '../weekly-review-queue.mjs';
const fixture=await createFixture(),checks=[],out=await outputDir();
const check=(value,label)=>{assert(value,label);checks.push(label);console.log('PASS',label);};
const sample=[{id:'old',track:'bulletin',status:'published',service_date:'2027-01-01',title:'Old'},{id:'new',track:'bulletin',status:'published',service_date:'2027-02-01',title:'New'},{id:'p2',track:'promo',status:'pending_review',service_date:'2027-01-17',title:'Grace ＡＢＣ'},{id:'p1',track:'bulletin',status:'pending_initial',service_date:'2027-01-03',title:'Grace'}];
check(reviewQueue(sample).ordered.map(r=>r.id).join(',')==='p1,p2,new,old','queue prioritizes pending dates then recent history without mutating source');
check(sample[0].id==='old'&&reviewQueue(sample,{query:'grace abc',track:'promo'}).visible[0]?.id==='p2','combined search normalizes case and fullwidth text');
check(reviewQueue(sample,{query:'待初審',status:'pending_initial'}).visible[0]?.id==='p1','status aliases are searchable without changing authorization');
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{for(const width of [390,1440]){
  const f=await fixture.setup(browser,width),{page,context}=f,p=engine+' '+width+': ';
  try{
   await page.locator('#review-comment').fill('篩選時保留的合成審核意見');await page.locator('#review-search').fill('恩典');
   check(await page.locator('.review-choice').count()===1&&await page.locator('#review-comment').inputValue()==='篩選時保留的合成審核意見'&&await page.locator('#review-selection-note').isVisible(),p+'filtering keeps the selected detail and unsent comment with an explicit hidden-selection note');
   await page.locator('#review-clear').click();check(await page.locator('.review-choice').count()===3&&await page.evaluate(()=>document.activeElement.id)==='review-search',p+'clear restores results and returns keyboard focus to search');
   f.answer(true);await page.locator('.review-choice').first().focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await ready(page);
   check(await page.locator('#preview h2').textContent()==='恩典的道路'&&await page.evaluate(()=>document.activeElement.dataset.id)==='b2',p+'arrow and Enter select a record and restore focus after async DOM rebuild');
   check(await page.locator('.review-choice[aria-pressed=true]').count()===1,p+'exactly one selected record is exposed to assistive technology');
   await page.locator('#review-track').selectOption('promo');check(await page.locator('.review-choice').count()===0&&await page.locator('#review-list').textContent().then(t=>t.includes('清除篩選')),p+'empty track filter provides a visible recovery action');
   await page.locator('#review-clear').click();await page.locator('#review-filter').selectOption('published');check(await page.locator('.review-choice').count()===1,p+'status filter combines with loaded queue without requests');
   await page.locator('#review-clear').click();check((await writes(page)).length===0,p+'all queue navigation and filtering remain read-only');
   await page.evaluate(()=>t.promoFail=true);await page.locator('#review-reload').click();await ready(page);check(await page.locator('#review-queue-count').textContent().then(t=>t.includes('尚未完整')&&t.includes('3 筆')),p+'partial source reports loaded counts instead of claiming all work was loaded');
   const contrast=await page.evaluate(contrastMetrics);check(!contrast.failures.length,p+'populated queue and selection meet text contrast '+JSON.stringify(contrast.failures));
   check(await page.locator('.review-choice').evaluateAll(ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})),p+'queue controls meet 44 px targets');
   await page.screenshot({path:path.join(out,'queue-'+engine+'-'+width+'.png'),fullPage:true});
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,input:parseFloat(getComputedStyle(document.querySelector('#review-comment')).fontSize)}));check(size.scroll<=size.width+1&&size.input>=32,p+'200 percent text fits the viewport '+JSON.stringify(size));
   await page.evaluate(()=>{document.documentElement.style.fontSize='';t.promoFail=false;t.rows=t.rows.filter(r=>r.id!=='b2');});await page.locator('#review-comment').fill('紀錄移除後仍可取回的意見');await page.locator('#review-reload').click();await ready(page);
   check(await page.locator('#review-comment').inputValue().then(t=>t.includes('仍可取回'))&&await page.locator('#review-choose-another').isVisible(),p+'missing selected record preserves comment and provides another-selection route');
   f.answer(false);await page.locator('#review-choose-another').click();check(await page.locator('#review-comment').inputValue().then(t=>t.includes('仍可取回')),p+'declining another selection retains unsent text');
   f.answer(true);await page.locator('#review-choose-another').click();await ready(page);check(await page.locator('#preview h2').textContent()==='盼望中的家'&&await page.locator('#approve').isEnabled(),p+'explicitly choosing another record recovers from a missing item without writes');
  }finally{await context.close();}
 }}finally{await browser.close();}
}
check(!fixture.errors.length,'no uncaught queue errors '+fixture.errors.join('; '));await writeFile(path.join(out,'queue-checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,iPhone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
}finally{fixture.close();}
