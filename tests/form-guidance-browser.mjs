import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-10-22-experience8');await mkdir(out,{recursive:true});
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const financeBootstrap=`<script>
window.flow={calls:[],writeFail:false,batch:null,bags:[]};
window.fixtureDb={auth:{getUser:async()=>({data:{user:{id:'${first}'}}})},functions:{invoke:async(name,{body})=>{flow.calls.push(body);let data={ok:true};
if(body.action==='profile')data={ok:true,roles:['entry'],owner:false,actorUserId:'${first}'};
else if(body.action==='workers')data={ok:true,workers:[{userId:'${first}',name:'合成點收甲'},{userId:'${second}',name:'合成點收乙'}]};
else if(body.action==='list')data={ok:true,batches:flow.batch?[flow.batch]:[]};
else if(body.action==='members')data={ok:true,members:body.search==='待補編號'?[{id:11,name:'待補編號',offeringCode:null}]:[]};
else if(body.action==='save'){if(flow.writeFail)data={ok:false,code:'service_unavailable'};else{const d=body.data;flow.batch={id:'fixture-batch',status:'draft',offering_date:d.offeringDate,version:1,counter_1:d.counterUserIds[0],counter_2:d.counterUserIds[1],counted_cash:d.countedCash,entered_total:d.countedCash};flow.bags=d.bags.map((b,i)=>({id:String(i),bag_name:b.bagName,bag_phone:b.bagPhone,bag_address:b.bagAddress,anonymous:b.anonymous,member_id:b.memberId,offering_code:b.offeringCode,declared_total:b.declaredTotal,public_choice:b.publicChoice,receipt_preference:b.receiptPreference,hide_from_bulletin:b.hideFromBulletin,lines:b.lines,confirmed_by:'${first}',confirmed_at:'2026-10-22T00:00:00Z'}));data={ok:true,batch:flow.batch};}}
else if(body.action==='get')data={ok:true,batch:flow.batch,bags:flow.bags,events:[]};
return {data,error:null};}}};
</script><script type="module" src="/finance-cash.mjs"></script>`;
const weeklyBootstrap=`<script>
window.flow={save:0,review:0,writeFail:false};window.row={id:'fixture-weekly',service_date:'2026-10-25',title:'合成週報',status:'draft',sermon_topic:'合成信息',reel_enabled:true,reel_video_path:'fixture.mp4'};
window.fixtureDb={auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}})}};
window.weeklyBulletinController={ready:Promise.resolve(),isReady:()=>true,getCurrent:()=>row,getBulletins:()=>[row],state:()=>({editable:true,working:false,needsRefresh:false}),reload:async()=>true,open:async()=>{},setPromoStatus:()=>{},markDirty:()=>{},refreshSchedule:async()=>{},save:async()=>{flow.save++;if(flow.writeFail){document.querySelector('#status').textContent='合成儲存失敗';return false;}row.title=document.querySelector('#bulletin-title').value;return true;},requestReview:async()=>{flow.review++;return true;}};
window.fetch=async(url,init)=>{const body=JSON.parse(init.body);if(body.action==='status')return Response.json({ok:true,promo:{status:'approved',snapshot:row}});throw Error('Unexpected request');};
document.querySelector('#bulletin-title').value=row.title;document.querySelector('#service-date').value=row.service_date;document.querySelector('#bulletin-subtitle').value='保留的開場文字';
</script><script type="module" src="/weekly-bulletin-tabs.mjs"></script>`;
const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://fixture').pathname;let data;
 if(file==='/finance-fixture'||file==='/weekly-fixture'){const finance=file==='/finance-fixture';data=(await readFile(path.join(root,finance?'finance-cash.html':'website-maintenance.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<html lang="zh-Hant"','<html class="mplus-theme" lang="zh-Hant"').replace('<head>','<head><base href="/">').replace('</body>',(finance?financeBootstrap:weeklyBootstrap)+'</body>');}
 else if(file==='/admin-db.mjs')data='export const db=window.fixtureDb;';else{const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));data=await readFile(target);}
 res.setHeader('content-type',file.endsWith('fixture')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,checks=[];
const check=(result,name)=>{assert(result,name);checks.push(name);console.log('PASS',name);};
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const prefix=engine+' '+width+': ';
 await page.goto(origin+'/finance-fixture');await page.locator('#finance-app:not([hidden])').waitFor();await page.click('#new-batch');await page.click('#save-draft');await page.waitForFunction(()=>document.querySelector('#finance-status').dataset.tone==='error'&&!document.querySelector('#cash-form').inert);
 check(await page.locator('.field-guidance').isVisible()&&await page.locator('.field-guidance-link').count()===4,prefix+'finance reports missing counters, donor and amount together');
 check(await page.locator('.field-guidance-link').first().evaluate(n=>getComputedStyle(n).backgroundImage==='none'&&n.getBoundingClientRect().height>=44),prefix+'error links retain their own readable style and touch area');
 check(await page.evaluate(()=>flow.calls.filter(c=>c.action==='save').length===0),prefix+'incomplete finance form never writes');
 check(await page.evaluate(()=>document.activeElement.id==='counter-one'),prefix+'first correction receives focus after controls unlock');
 await page.fill('#offering-date','');await page.click('#save-draft');await page.waitForFunction(()=>!document.querySelector('#cash-form').inert);
 check(await page.locator('#offering-date').getAttribute('aria-invalid')==='true'&&await page.evaluate(()=>document.activeElement.id==='offering-date'&&flow.calls.filter(c=>c.action==='save').length===0),prefix+'missing finance date remains required and receives focus');await page.fill('#offering-date','2026-10-18');
 await page.selectOption('#counter-one',first);await page.selectOption('#counter-two',first);await page.click('#save-draft');await page.waitForFunction(()=>!document.querySelector('#cash-form').inert);
 check(await page.locator('#counter-two').getAttribute('aria-invalid')==='true'&&await page.locator('.field-guidance').textContent().then(t=>t.includes('須與第一位不同')),prefix+'same-person counters identify the second selector');
 await page.selectOption('#counter-two',second);await page.locator('.finance-member-query').fill('合成奉獻甲');await page.locator('[data-offering-category="十一奉獻"]').fill('100');await page.locator('.finance-bag-confirm').check();await page.click('#add-donor');
 const secondCard=page.locator('.finance-group').nth(1),firstCard=page.locator('.finance-group').first();await secondCard.locator('[data-offering-category="指定奉獻"]').fill('250');await secondCard.locator('.finance-bag summary').click();await page.click('#save-draft');await page.waitForFunction(()=>!document.querySelector('#cash-form').inert);
 check(await page.locator('.field-guidance').textContent().then(t=>t.includes('奉獻者 2：請填寫姓名')&&t.includes('奉獻者 2 · 第 1 筆：指定奉獻須填用途')),prefix+'finance identifies the exact donor and entry');
 await page.getByRole('button',{name:'奉獻者 2 · 第 1 筆：指定奉獻須填用途。',exact:true}).click();
 check(await secondCard.locator('.finance-bag').getAttribute('open')!==null&&await page.evaluate(()=>document.activeElement.dataset.offeringPurpose==='true'),prefix+'error link opens collapsed entry and focuses its purpose');
 check(await firstCard.locator('[data-offering-category="十一奉獻"]').inputValue()==='100'&&await secondCard.locator('[data-offering-category="指定奉獻"]').inputValue()==='250',prefix+'finding errors preserves other donors and amounts');
 await page.locator('#cash-form').screenshot({path:path.join(out,'finance-errors-'+engine+'-'+width+'.local.png')});
 await secondCard.locator('.finance-member-query').fill('合成奉獻乙');await secondCard.locator('[data-offering-purpose]').fill('合成用途');await page.click('#save-draft');await page.waitForFunction(()=>!document.querySelector('#cash-form').inert);
 check(await secondCard.locator('.finance-bag-confirm').getAttribute('aria-invalid')==='true',prefix+'missing per-entry confirmation is identified before a write');
 await firstCard.locator('[data-offering-category="十一奉獻"]').fill('-1');await page.click('#save-draft');await page.waitForFunction(()=>!document.querySelector('#cash-form').inert);
 check(await firstCard.locator('[data-offering-category="十一奉獻"]').getAttribute('aria-invalid')==='true'&&await page.evaluate(()=>flow.calls.filter(c=>c.action==='save').length===0),prefix+'negative amount is identified without sending data');
 await firstCard.locator('[data-offering-category="十一奉獻"]').fill('1.5');await page.click('#save-draft');await page.waitForFunction(()=>!document.querySelector('#cash-form').inert);
 check(await firstCard.locator('[data-offering-category="十一奉獻"]').getAttribute('aria-invalid')==='true',prefix+'fractional amount still respects whole-dollar validation');
 await firstCard.locator('[data-offering-category="十一奉獻"]').fill('100');await firstCard.locator('.finance-bag-confirm').check();await secondCard.locator('.finance-bag-confirm').check();await page.evaluate(()=>flow.writeFail=true);await page.click('#save-draft');await page.waitForFunction(()=>document.querySelector('#finance-status').textContent==='服務暫時無法使用，請稍後再試。');
 check(await page.locator('.field-guidance').isHidden()&&await firstCard.locator('.finance-member-query').inputValue()==='合成奉獻甲'&&await secondCard.locator('[data-offering-purpose]').inputValue()==='合成用途',prefix+'server failure keeps data without falsely blaming valid fields');
 await page.evaluate(()=>flow.writeFail=false);await page.click('#save-draft');await page.waitForFunction(()=>document.querySelector('#finance-status').textContent==='草稿已儲存。');
 const saved=await page.evaluate(()=>flow.calls.filter(c=>c.action==='save'));
 check(saved.length===2&&saved[1].data.bags.length===2&&saved[1].data.countedCash===350&&saved[1].data.bags[1].lines[0].designation==='合成用途',prefix+'corrected data saves exactly once after the failed request');
 check(await page.locator('[aria-invalid=true]').count()===0,prefix+'opening saved finance data clears obsolete errors');
 await page.goto(origin+'/finance-fixture');await page.locator('#finance-app:not([hidden])').waitFor();await page.click('#new-batch');await page.selectOption('#counter-one',first);await page.selectOption('#counter-two',second);await page.locator('.finance-member-query').fill('待補編號');await page.getByRole('button',{name:'搜尋會友',exact:true}).click();await page.getByRole('button',{name:'待補編號　奉獻編號待補',exact:true}).click();await page.locator('[data-offering-category="感恩奉獻"]').fill('100');await page.locator('.finance-bag-confirm').check();await page.click('#save-draft');await page.waitForFunction(()=>!document.querySelector('#cash-form').inert);
 check(await page.locator('.finance-code-assignment input').getAttribute('aria-invalid')==='true'&&await page.evaluate(()=>document.activeElement.getAttribute('aria-label')==='四位奉獻編號'),prefix+'linked member with no code points to code assignment');
 await page.goto(origin+'/weekly-fixture?church=M%2B&tab=bulletin');await page.waitForFunction(()=>document.querySelector('#weekly-two-track')?.getAttribute('aria-busy')==='false');
 await page.fill('#bulletin-title','');await page.fill('#weekly-topic','保留週報信息');await page.fill('#two-track-date','');await page.click('#bulletin-save');
 check(await page.locator('.field-guidance-link').count()===2&&await page.evaluate(()=>flow.save===0),prefix+'weekly date and title errors block saving stale hidden values');
 check(await page.evaluate(()=>document.activeElement.id==='two-track-date'),prefix+'weekly error focus reaches the visible date selector');
 await page.fill('#two-track-date','2026-10-25');await page.waitForFunction(()=>document.querySelector('#weekly-two-track').getAttribute('aria-busy')==='false');await page.fill('#bulletin-title','');await page.fill('#weekly-topic','保留週報信息');await page.click('#bulletin-save');
 check(await page.locator('#bulletin-title').getAttribute('aria-invalid')==='true',prefix+'weekly title is marked for correction');
 await page.getByRole('tab',{name:'主日社群預告',exact:true}).click();await page.getByRole('button',{name:'週報標題：請填寫標題。',exact:true}).click();
 check(await page.locator('#bulletin-panel').isVisible()&&await page.evaluate(()=>document.activeElement.id==='bulletin-title'),prefix+'weekly error link reveals the correct tab before focusing');
 check(await page.locator('#weekly-topic').inputValue()==='保留週報信息',prefix+'switching to correct an error preserves weekly text');
 await page.locator('#weekly-two-track').screenshot({path:path.join(out,'weekly-errors-'+engine+'-'+width+'.local.png')});
 await page.fill('#bulletin-title','修正後週報');
 check(await page.locator('#bulletin-title').getAttribute('aria-invalid')===null&&await page.locator('.field-guidance').isHidden(),prefix+'correcting the field removes its marker and summary');
 await page.evaluate(()=>flow.writeFail=true);await page.click('#bulletin-save');await page.waitForFunction(()=>document.querySelector('#two-track-state').dataset.tone==='error');
 check(await page.locator('#bulletin-title').inputValue()==='修正後週報'&&await page.locator('.field-guidance').isHidden(),prefix+'weekly server failure retains text and adds no false field errors');
 await page.evaluate(()=>flow.writeFail=false);await page.click('#bulletin-save');await page.waitForFunction(()=>document.querySelector('#two-track-state').dataset.tone==='success');
 check(await page.evaluate(()=>flow.save===2)&&await page.locator('#weekly-topic').inputValue()==='保留週報信息',prefix+'weekly valid retry saves current content once');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+'error summaries do not create page overflow');
 check(errors.length===0,prefix+'no uncaught browser errors');await context.close();
 }}finally{await browser.close();}
}
await writeFile(path.join(out,'checks.local.json'),JSON.stringify({checks,synthetic:true,production_writes:false,physical_iPhone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
