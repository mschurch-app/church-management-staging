import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createFixture,chromium,webkit,ready,writes,outputDir} from './weekly-review-fixture.mjs';
const fixture=await createFixture(),checks=[];
const check=(value,label)=>{assert(value,label);checks.push(label);console.log('PASS',label);};
const confirm=page=>page.getByRole('dialog').getByRole('button',{name:'審核發佈',exact:true}).click();
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{for(const scenario of ['logout-read','logout-session','logout-response','logout-refresh','change-user','refresh','revoke-view','revoke-approve','revoke-decision','canva']){
  const f=await fixture.setup(browser,390),{page,context}=f,p=engine+' '+scenario+': ';
  try{
   await page.locator('#review-comment').fill('合成私有審核意見');
   if(scenario==='canva'){
    f.answer(true);await page.evaluate(()=>t.promos=[{...t.rows[0],id:'promo-one',title:'合成社群預告',status:'pending_initial'}]);await page.locator('#review-reload').click();await ready(page);await page.locator('.review-choice').filter({hasText:'社群預告'}).click();await ready(page);await page.locator('#canva-review-more').waitFor({state:'visible'});
    await page.locator('#canva-review-more').click();await page.keyboard.press('Escape');check(!(await writes(page)).some(c=>c.action==='review_start'),p+'Escape never starts a Canva job');
    await page.locator('#canva-review-more').click();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();check(!(await writes(page)).some(c=>c.action==='review_start'),p+'cancel button never consumes Canva quota');
    await page.locator('#canva-review-more').click();await page.getByRole('dialog').getByRole('button',{name:'產生新三套',exact:true}).click();await ready(page);check((await writes(page)).filter(c=>c.action==='review_start').length===1,p+'explicit confirmation starts exactly one synthetic job');continue;
   }
   if(scenario==='logout-read'){
    f.answer(true);await page.evaluate(()=>t.delay=180);await page.locator('.review-choice').nth(1).click();await page.evaluate(()=>t.signOut());await page.waitForTimeout(250);
   }else if(scenario==='logout-session'){
    await page.evaluate(()=>t.sessionDelay=180);await page.locator('#approve').click();await confirm(page);await page.waitForTimeout(30);await page.evaluate(()=>t.signOut());await page.waitForTimeout(230);check((await writes(page)).length===0,p+'logout while awaiting token prevents the outgoing write');
   }else if(scenario==='logout-response'){
    await page.evaluate(()=>t.writeDelay=180);await page.locator('#approve').click();await confirm(page);await page.waitForFunction(()=>t.calls.some(c=>c.action==='approve'));await page.evaluate(()=>t.signOut());await page.waitForTimeout(250);check((await writes(page)).filter(c=>c.action==='approve').length===1,p+'already sent request is never retried after logout');
   }else if(scenario==='logout-refresh'){
    await page.evaluate(()=>t.delay=180);await page.locator('#approve').click();await confirm(page);await page.waitForFunction(()=>t.calls.some(c=>c.action==='approve')&&t.calls.filter(c=>c.action==='list').length>2);await page.evaluate(()=>t.signOut());await page.waitForTimeout(250);check((await writes(page)).filter(c=>c.action==='approve').length===1,p+'logout during acknowledged-write refresh does not resend');
   }else if(scenario==='change-user')await page.evaluate(()=>t.changeUser());
   else if(scenario==='refresh'){
    const before=await page.evaluate(()=>t.authReads);await page.evaluate(()=>t.refresh());await page.waitForFunction(n=>t.authReads>n,before);await ready(page);check(await page.locator('#review-comment').inputValue()==='合成私有審核意見'&&await page.locator('#approve').isEnabled(),p+'same identity refresh preserves work after fresh verification');check((await writes(page)).length===0,p+'background verification performs only reads');continue;
   }else if(scenario==='revoke-view'){
    await page.evaluate(()=>{t.denied=true;t.refresh();});await page.waitForFunction(()=>document.querySelector('#review-actions').hidden);
   }else if(scenario==='revoke-approve'){
    await page.evaluate(()=>t.approveDenied=true);await page.locator('#approve').click();await confirm(page);await ready(page);check((await writes(page)).length===0&&await page.locator('#review-comment').inputValue()==='合成私有審核意見'&&await page.locator('#approve').isDisabled(),p+'fresh feature permission blocks outgoing decision and retains comment');continue;
   }else if(scenario==='revoke-decision'){
    await page.evaluate(()=>{t.canDecide=false;t.refresh();});await page.waitForFunction(()=>document.querySelector('#review-access-note').hidden===false);await ready(page);check(await page.locator('#review-comment').inputValue()==='合成私有審核意見'&&await page.locator('#approve').isDisabled(),p+'changed reviewer assignment retains comment and removes decision actions');continue;
   }
   check(await page.locator('#preview').textContent().then(t=>!t.includes('盼望中的家')&&!t.includes('恩典的道路'))&&await page.locator('#review-comment').inputValue()===''&&await page.locator('.review-choice').count()===0,p+'identity loss clears private detail, comments and list');
   check(await page.locator('#review-actions').isHidden()&&await page.locator('#review-actions').getAttribute('data-unsaved-changes')==='false',p+'identity loss closes editing without stale dirty markers');
   check(await page.locator('#status').textContent().then(t=>t.includes('登入')),p+'late completion cannot replace identity-loss feedback with success');
   await page.locator('#approve').evaluate(n=>n.click());check(!await page.getByRole('dialog').count(),p+'stale hidden decision handler cannot reopen confirmation');
  }finally{await context.close();}
 }}finally{await browser.close();}
}
check(!fixture.errors.length,'no uncaught identity errors '+fixture.errors.join('; '));await writeFile(path.join(await outputDir(),'identity-checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false},null,2));console.log('TOTAL',checks.length);
}finally{fixture.close();}
