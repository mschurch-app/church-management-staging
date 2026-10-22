import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {daily} from './phase3/fixtures.mjs';
import {contrastMetrics} from './phase3/contrast.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=process.env.CHURCH_TEST_OUT||path.join(root,'tests/phase4/results/devotional-editor');await mkdir(out,{recursive:true});
const bootstrap=`<script>
window.t={rows:${JSON.stringify(daily())},calls:[],readonly:window.fixtureMode==='readonly',denied:window.fixtureMode==='denied',writeFail:false,readFail:false,invalidAck:false,afterWriteFail:false,delay:0};
window.fixtureDb={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-only'}}}),signOut:async()=>{}}};
window.fetch=async(url,init)=>{if(!String(url).includes('/functions/v1/daily-devotional-admin'))throw Error('Unexpected request');const body=JSON.parse(init.body);t.calls.push(body);
 if(body.action==='content_list'){if(t.readFail)return Response.json({ok:false,error:'unavailable'},{status:503});return Response.json({ok:true,items:t.rows,writeVersionContract:'devotional-version-v1',reviewerStage:'final'});}
 if(t.delay)await new Promise(r=>setTimeout(r,t.delay));if(t.writeFail)return Response.json({ok:false,error:'unavailable'},{status:503});if(t.invalidAck)return Response.json({});
 const row=t.rows.find(r=>r.id===body.id);Object.assign(row,body.values,{review_status:'approved',version:row.version+1});if(t.afterWriteFail)t.readFail=true;return Response.json({ok:true,item:row});};
</script><script type="module" src="/daily-devotional-admin.mjs"></script>`;
const stubs={'/admin-db.mjs':'export const db=window.fixtureDb;','/admin-access.mjs':'export const readAccess=async()=>({});export const canOpen=()=>!t.denied;export const canAction=()=>!t.readonly&&!t.denied;'};
const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://fixture').pathname;let data;
 if(file==='/fixture.html')data=(await readFile(path.join(root,'daily-devotional-admin.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<html lang="zh-Hant"','<html class="mplus-theme" lang="zh-Hant"').replace('<head>','<head><base href="/">').replace('</body>',bootstrap+'</body>');
 else if(stubs[file])data=stubs[file];else{const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));data=await readFile(target);}
 res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,checks=[],errors=[];
const check=(result,name)=>{assert(result,name);checks.push(name);console.log('PASS',name);};
const writes=page=>page.evaluate(()=>t.calls.filter(c=>c.action!=='content_list'));
async function setup(browser,width=390,mode='owner'){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});await context.addInitScript(mode=>window.fixtureMode=mode,mode);
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage(),dialogs=[];let answer=false;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{dialogs.push(dialog.message());return answer?dialog.accept():dialog.dismiss();});
 await page.goto(origin+'/fixture.html');await page.waitForFunction(()=>!document.querySelector('#devotional-reload').disabled);
 return {context,page,dialogs,answer(value){answer=value;}};
}
const edit=async page=>{await page.locator('[data-edit]').click();await page.locator('.devotional-editor').waitFor();};
const submit=async page=>{await page.getByRole('button',{name:'儲存並直接核准',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.review-panel[aria-busy=true]'));};
if(process.env.CHURCH_PREVIEW_ONLY==='1'){console.log(origin+'/fixture.html');await new Promise(()=>{});}
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{
 for(const width of [390,1440]){
  const fixture=await setup(browser,width),{context,page,dialogs}=fixture,prefix=engine+' '+width+': ';
  try{
   await edit(page);
   check(await page.evaluate(width=>width<700?document.activeElement.matches('.devotional-editor h3'):document.activeElement.name==='devotional_title',width),prefix+'editor opening focuses its heading on mobile and first input on desktop');
   check(await page.locator('.devotional-detail').isHidden()&&await page.locator('.devotional-editor h3').textContent().then(s=>s.includes('2027-01-01')),prefix+'editor identifies the selected date and temporarily replaces its reading preview');
   const nav=page.getByRole('navigation',{name:'靈修編輯區段'});await nav.getByRole('button',{name:'靈修內容',exact:true}).focus();await page.keyboard.press('Enter');
   check(await page.evaluate(()=>document.activeElement.tagName==='LEGEND'&&document.activeElement.textContent==='靈修內容'&&document.querySelector('#list').dataset.unsavedChanges!=='true')&&(await writes(page)).length===0,prefix+'keyboard section navigation neither submits nor creates a dirty draft');
   check(await page.locator('.devotional-editor label').filter({hasText:'（選填）'}).count()===3&&await page.locator('.devotional-editor [required]').count()===8,prefix+'only the three existing licensing fields are optional');
   await page.locator('[name=devotional_title]').fill('   ');await page.locator('[name=selected_scripture_reference]').fill('');await page.locator('[name=response_prayer]').fill('');await submit(page);
   check(await page.locator('.field-guidance-link').count()===3&&(await writes(page)).length===0,prefix+'all missing or whitespace-only required fields are listed before any write');
   check(await page.evaluate(()=>{const input=document.querySelector('[name=devotional_title]');return input===document.activeElement&&input.getAttribute('aria-invalid')==='true'&&!!document.getElementById(input.getAttribute('aria-describedby'));}),prefix+'first missing field receives focus and an associated accessible explanation');
   await page.locator('[name=devotional_title]').fill('合成校訂標題');
   check(await page.locator('.field-guidance-link').count()===2&&await page.locator('[name=devotional_title]').getAttribute('aria-invalid')===null,prefix+'correcting one field clears only its own obsolete error');
   await page.getByRole('button',{name:'回應禱告：請填寫內容。',exact:true}).click();
   check(await page.evaluate(()=>document.activeElement.name==='response_prayer')&&await page.locator('[name=context_summary]').inputValue()==='在主的引領中重新得力。',prefix+'error link reaches a later section without losing other text');
   const contrast=await page.evaluate(contrastMetrics);check(contrast.failures.length===0,prefix+'visible correction and editor text meet contrast thresholds '+JSON.stringify(contrast.failures));
   check(await nav.locator('button').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;}))&&await page.locator('.field-guidance-link').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),prefix+'section and error controls retain 44 px touch areas');
   if(engine==='webkit'||width===1440)await page.locator('.devotional-editor').screenshot({path:path.join(out,'devotional-'+engine+'-'+width+'.png')});
   await page.locator('[name=key_points]').evaluate(n=>{n.value='字'.repeat(5001);n.dispatchEvent(new Event('input',{bubbles:true}));});await submit(page);
   check(await page.getByRole('button',{name:'三個重點：請縮短至 5000 字以內。',exact:true}).count()===1&&(await writes(page)).length===0,prefix+'overlength content is identified before server truncation');
   await page.locator('[name=key_points]').fill('合成重點');await page.locator('[name=selected_scripture_reference]').fill('詩篇 23:1');await page.locator('[name=response_prayer]').fill('合成禱告');for(const key of ['scripture_version','scripture_source','scripture_license_note'])await page.locator('[name='+key+']').fill('');
   await page.evaluate(()=>t.writeFail=true);await submit(page);
   check(await page.locator('[name=devotional_title]').inputValue()==='合成校訂標題'&&await page.locator('[name=response_prayer]').inputValue()==='合成禱告'&&await page.locator('.field-guidance').isHidden()&&await page.locator('.devotional-editor [aria-invalid=true]').count()===0,prefix+'server rejection retains current text and never marks valid fields as missing');
   await page.evaluate(()=>{t.writeFail=false;t.delay=120;});await page.getByRole('button',{name:'儲存並直接核准',exact:true}).evaluate(n=>{n.click();n.click();});await page.waitForFunction(()=>!document.querySelector('.devotional-editor'));
   const saved=await writes(page);check(saved.length===2&&saved[1].id==='d1'&&saved[1].values.response_prayer==='合成禱告'&&saved[1].values.scripture_version===''&&Object.keys(saved[1].values).length===11,prefix+'valid retry preserves optional blanks and targets the original record once');
   check(await page.locator('.devotional-detail').isVisible()&&await page.locator('.devotional-head').textContent().then(t=>t.includes('合成校訂標題'))&&await page.locator('#status').textContent().then(t=>t.includes('內容已儲存並直接核准')),prefix+'acknowledged save restores reading view and reports the actual approval');
   await edit(page);await page.locator('[name=life_application]').fill('尚未儲存的合成應用');await page.locator('.devotional-choice[data-id=d2]').click();
   check(dialogs.length===1&&await page.locator('[name=life_application]').inputValue()==='尚未儲存的合成應用',prefix+'cancelled record switch preserves the editor');
   await page.getByRole('button',{name:'取消編輯',exact:true}).click();check(await page.locator('.devotional-editor').count()===1,prefix+'cancelled discard keeps the editable text');fixture.answer(true);await page.getByRole('button',{name:'取消編輯',exact:true}).click();
   check(await page.locator('.devotional-detail').isVisible()&&await page.locator('[data-edit]').isEnabled()&&await page.evaluate(()=>document.activeElement.hasAttribute('data-edit'))&&await page.locator('#status').textContent().then(t=>t.includes('已取消編輯')),prefix+'confirmed cancel restores the original reading view and edit focus');
   await edit(page);await page.locator('[name=devotional_title]').fill('');await submit(page);await page.locator('.devotional-choice[data-id=d2]').click();await edit(page);
   check(await page.locator('.field-guidance').isHidden()&&await page.locator('[aria-invalid=true]').count()===0&&await page.locator('[name=devotional_title]').inputValue()==='平安的道路',prefix+'switching records removes old correction messages');
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');
   const large=await page.evaluate(()=>({pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,font:parseFloat(getComputedStyle(document.querySelector('.devotional-editor textarea')).fontSize)}));check(large.pageWidth<=large.viewport+1&&large.font>=32,prefix+'200 percent text keeps editable content legible without page overflow '+JSON.stringify(large));
  }finally{await context.close();}
 }
 for(const scenario of ['readonly','denied','unknown_ack','readback']){
  const {context,page}=await setup(browser,390,scenario),prefix=engine+' '+scenario+': ';
  try{
   if(['readonly','denied'].includes(scenario)){check(await page.locator('[data-edit]:visible').count()===0&&(await writes(page)).length===0,prefix+'existing access rules expose no editor or write');continue;}
   await edit(page);await page.locator('[name=devotional_title]').fill('合成讀回恢復');await page.evaluate(kind=>{if(kind==='unknown_ack')t.invalidAck=true;else t.afterWriteFail=true;},scenario);await submit(page);
   check(await page.locator('[name=devotional_title]').inputValue()==='合成讀回恢復'&&await page.getByRole('button',{name:'儲存並直接核准',exact:true}).isDisabled()&&(await writes(page)).length===1,prefix+'uncertain or acknowledged-but-unread result retains text and blocks another write');
   await page.getByRole('button',{name:'儲存並直接核准',exact:true}).evaluate(n=>n.click());check((await writes(page)).length===1,prefix+'blocked retry cannot silently resubmit');
   if(scenario==='readback'){await page.evaluate(()=>{t.readFail=false;t.afterWriteFail=false;});await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#devotional-reload').disabled);check((await writes(page)).length===1&&await page.locator('.devotional-head').textContent().then(t=>t.includes('合成讀回恢復')),prefix+'read-only recovery reveals the saved record without a second approval');}
  }finally{await context.close();}
 }
 }finally{await browser.close();}
}
check(errors.length===0,'no uncaught browser errors '+errors.join('; '));await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,synthetic:true,productionWrites:false,realIPhone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
