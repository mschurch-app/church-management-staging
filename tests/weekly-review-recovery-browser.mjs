import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createFixture,chromium,webkit,ready,writes,outputDir} from './weekly-review-fixture.mjs';
const fixture=await createFixture(),checks=[];
const check=(value,label)=>{assert(value,label);checks.push(label);console.log('PASS',label);};
if(process.env.CHURCH_PREVIEW_ONLY==='1'){console.log(fixture.origin+'/fixture.html?church=M%2B');await new Promise(()=>{});}
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{for(const width of [390,1440]){
  const f=await fixture.setup(browser,width),{page,context}=f,p=engine+' '+width+': ';
  try{
   await page.locator('#review-comment').fill('請保留這段尚未送出的合成意見');
   await page.locator('.review-choice').nth(1).click();
   check(await page.locator('#review-comment').inputValue()==='請保留這段尚未送出的合成意見'&&await page.locator('#review-actions').getAttribute('data-unsaved-changes')==='true',p+'cancelled selection retains comment and dirty marker');
   f.answer(true);await page.evaluate(()=>t.readFail=true);await page.locator('.review-choice').nth(1).click();await ready(page);
   check(await page.locator('#review-comment').inputValue()==='請保留這段尚未送出的合成意見'&&await page.locator('#review-actions').getAttribute('data-unsaved-changes')==='true'&&await page.locator('#approve').isDisabled(),p+'failed selection retains original work and blocks stale decisions');
   await page.locator('#review-reload').click();await ready(page);
   check(await page.locator('#review-comment').inputValue().then(t=>t.includes('合成意見'))&&await page.locator('#review-actions').getAttribute('data-unsaved-changes')==='true',p+'failed reload does not consume discard confirmation or clear work');
   await page.evaluate(()=>{t.readFail=false;t.invalidRead=true;});await page.locator('#review-reload').click();await ready(page);
   check(await page.locator('#review-comment').inputValue().then(t=>t.includes('合成意見'))&&await page.locator('#preview h2').textContent()==='盼望中的家',p+'mismatched detail cannot replace current record or clear comment');
   await page.evaluate(()=>t.invalidRead=false);await page.locator('#review-reload').click();await ready(page);
   check(await page.locator('#review-comment').inputValue()===''&&await page.locator('#review-actions').getAttribute('data-unsaved-changes')==='false'&&await page.locator('#approve').isEnabled(),p+'validated replacement clears only after read succeeds');
   await page.locator('#review-comment').fill('失敗後保留');await page.evaluate(()=>t.writeFail=true);await page.locator('#request-changes').click();await page.getByRole('dialog').getByRole('button',{name:'退回修改',exact:true}).click();await ready(page);
   check(await page.locator('#review-comment').inputValue()==='失敗後保留'&&await page.locator('#request-changes').isEnabled(),p+'explicit rejected decision retains comment and allows retry');
   await page.evaluate(()=>{t.writeFail=false;t.unknownWrite=true;});await page.locator('#request-changes').click();await page.getByRole('dialog').getByRole('button',{name:'退回修改',exact:true}).click();await ready(page);
   const count=(await writes(page)).length;
   check(await page.locator('#review-comment').inputValue()==='失敗後保留'&&await page.locator('#request-changes').isDisabled()&&await page.locator('#review-actions').getAttribute('data-unsaved-changes')==='true',p+'unknown write keeps recoverable comment and blocks duplicate submission');
   await page.locator('#request-changes').evaluate(n=>n.click());check((await writes(page)).length===count,p+'programmatic duplicate blocked during recovery');
   await page.evaluate(()=>t.unknownWrite=false);await page.locator('#review-reload').click();await ready(page);await page.locator('#review-comment').fill('已確認的審核意見');await page.evaluate(()=>t.afterWriteFail=true);await page.locator('#request-changes').click();await page.getByRole('dialog').getByRole('button',{name:'退回修改',exact:true}).click();await ready(page);
   check(await page.locator('#status').textContent().then(t=>t.includes('審核已完成'))&&await page.locator('#review-actions').isHidden(),p+'acknowledged decision with failed refresh is distinct and blocks resubmission');
   const after=(await writes(page)).length;await page.evaluate(()=>{t.listFail=false;t.afterWriteFail=false;});await page.locator('#review-reload').click();await ready(page);check((await writes(page)).length===after,p+'recovery reload sends only reads');
  }finally{await context.close();}
 }}finally{await browser.close();}
}
check(!fixture.errors.length,'no uncaught fixture errors '+fixture.errors.join('; '));await writeFile(path.join(await outputDir(),'recovery-checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false},null,2));console.log('TOTAL',checks.length);
}finally{fixture.close();}
