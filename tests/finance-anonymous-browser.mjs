import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-11-14-anonymous-offerings');
await mkdir(out,{recursive:true});
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://fixture').pathname,target=path.resolve(root,'.'+name);if(!target.startsWith(root+path.sep))throw Error();
 let body=await readFile(target);
 if(name==='/finance-cash.html') body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module" src="/finance-cash.mjs"></script></body>');
 res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(target)]||'application/octet-stream');res.end(body);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,results=[];
try {for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true,...(engine===webkit&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
 try {for(const width of [393,1440]){
  let batch=null,bags=[],calls=[],failSave=false,roles=['entry','counter'];
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const clone=value=>structuredClone(value);
  await page.exposeFunction('fixtureApi',async body=>{
   calls.push(clone(body));
   if(body.action==='profile')return {ok:true,roles,owner:false,actorUserId:ids[0]};
   if(body.action==='workers')return {ok:true,workers:ids.map((userId,i)=>({userId,name:'合成同工'+i}))};
   if(body.action==='list')return {ok:true,batches:batch?[clone(batch)]:[]};
   if(body.action==='get')return {ok:true,batch:clone(batch),bags:clone(bags),events:[]};
   if(body.action==='confirm_counter'){batch.counter_1_confirmed_at='2026-11-08T04:00:00Z';batch.counter_1_confirmed_by=ids[0];batch.version++;return {ok:true,batch:clone(batch)};}
   if(body.action==='transition'){assert.equal(body.step,'submit');assert(batch.counter_1_confirmed_at);batch.status='spouse_review';batch.version++;return {ok:true,batch:clone(batch)};}
   if(body.action==='save'){
    if(failSave){failSave=false;return {ok:false,code:'service_unavailable'};}
    const d=body.data;batch={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:(batch?.version||0)+1,status:'draft',offering_date:d.offeringDate,counter_1:d.counterUserIds[0],counter_2:d.counterUserIds[1],entered_total:d.bags.reduce((n,b)=>n+b.declaredTotal,0),counted_cash:d.countedCash};
    bags=d.bags.map((b,i)=>({id:'bag-'+i,bag_no:i+1,bag_name:b.bagName,bag_phone:b.bagPhone,bag_address:b.bagAddress,member_id:b.memberId,offering_code:b.offeringCode,payment_method:b.paymentMethod,reported_offering_code:b.reportedOfferingCode,anonymous:b.anonymous,public_choice:b.publicChoice,receipt_preference:b.receiptPreference,hide_from_bulletin:b.hideFromBulletin,declared_total:b.declaredTotal,confirmed_by:b.confirmed?ids[0]:null,confirmed_at:b.confirmed?'2026-11-08T04:00:00Z':null,lines:b.lines}));
    return {ok:true,batch:clone(batch)};
   }
   return {ok:false,code:'invalid_request'};
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/admin-db.mjs'))return route.fulfill({contentType:'text/javascript',body:`export const db={auth:{getUser:async()=>({data:{user:{id:'${ids[0]}'}}})},functions:{invoke:async(name,{body})=>({data:await fixtureApi(body)})}};`});
   if(url.origin!==base)return route.abort();return route.fallback();
  });
  const titles=()=>page.locator('.finance-group-head h4').allTextContents();
  const anonymousCard=name=>page.locator('.finance-group').filter({has:page.getByRole('heading',{name,exact:true})});
  const confirm=async()=>{for(const input of await page.locator('.finance-bag-confirm').all())await input.check();};
  const save=async()=>{await page.locator('#save-draft').click();await page.locator('#finance-status').filter({hasText:'草稿已儲存'}).waitFor();};
  await page.goto(base+'/finance-cash.html');await page.locator('#finance-app:not([hidden])').waitFor();await page.locator('#new-batch').click();
  await page.locator('.finance-group-head button').click();await page.locator('#counter-one').selectOption(ids[0]);await page.locator('#counter-two').selectOption(ids[1]);
  await page.getByRole('button',{name:'＋ 主知名',exact:true}).click();await page.locator('#add-anonymous').click();
  assert.deepEqual(await titles(),['主知名一','主知名二']);
  await anonymousCard('主知名一').locator('[data-offering-category]').fill('16800');await anonymousCard('主知名二').locator('[data-offering-category]').fill('400');
  await page.locator('#add-online').click();await page.locator('.finance-group:last-child .finance-member-query').fill('合成線上奉獻人');await page.locator('.finance-group:last-child [data-offering-category]').first().fill('1000');
  await page.locator('#add-anonymous').click();await anonymousCard('主知名三').locator('[data-offering-category]').fill('600');
  assert.equal(await page.locator('#counted-cash').inputValue(),'17800');assert.equal(await page.locator('#entered-total').textContent(),'18,800');
  assert.equal(await anonymousCard('主知名一').locator('select').first().locator('option[value=anonymous]').textContent(),'主知名');
  await confirm();failSave=true;await page.locator('#save-draft').click();await page.locator('#finance-status').filter({hasText:'服務暫時無法使用'}).waitFor();
  assert.equal(await anonymousCard('主知名一').locator('[data-offering-category]').inputValue(),'16800');assert.equal(bags.length,0);
  await save();assert.deepEqual(bags.filter(b=>b.anonymous).map(b=>b.bag_name),['主知名一','主知名二','主知名三']);assert.equal(bags.length,4);assert.equal(batch.counted_cash,17800);
  await page.reload();await page.locator('#batch-list button').click();await page.locator('#editor-panel:not([hidden])').waitFor();
  assert.equal((await titles()).filter(t=>t.startsWith('主知名')).length,3);
  await page.locator('#add-anonymous').click();await anonymousCard('主知名四').locator('[data-offering-category]').fill('700');
  await anonymousCard('主知名二').getByRole('button',{name:'移除奉獻者',exact:true}).click();assert((await titles()).includes('主知名三'));
  await page.locator('#add-anonymous').click();await anonymousCard('主知名五').locator('[data-offering-category]').fill('800');await confirm();await save();
  assert.deepEqual(bags.filter(b=>b.anonymous).map(b=>b.bag_name),['主知名一','主知名三','主知名四','主知名五']);assert.equal(batch.counted_cash,18900);
  await page.locator('#donor-groups').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,`cash-${engine.name()}-${width}.png`),fullPage:true});
  // A legacy record is displayed with the new label; viewing alone must not write.
  bags=[{...bags[0],bag_name:'匿名'}];batch.entered_total=16800;batch.counted_cash=16800;const writesBefore=calls.filter(c=>c.action==='save').length;
  await page.reload();await page.locator('#batch-list button').click();await page.locator('#editor-panel:not([hidden])').waitFor();assert.deepEqual(await titles(),['主知名一']);assert.equal(bags[0].bag_name,'匿名');assert.equal(calls.filter(c=>c.action==='save').length,writesBefore);
  await page.locator('#add-anonymous').click();await anonymousCard('主知名二').locator('[data-offering-category]').fill('100');await confirm();await save();assert.deepEqual(bags.map(b=>b.bag_name),['主知名一','主知名二']);assert.equal(bags[0].declared_total,16800);
  await page.locator('#confirm-counter-one').click();await page.locator('#finance-status').filter({hasText:'本人點收確認已儲存'}).waitFor();await page.locator('#submit-batch').click();await page.locator('#finance-status').filter({hasText:'狀態已更新'}).waitFor();assert.equal(batch.status,'spouse_review');
  await page.reload();await page.locator('#batch-list button').click();await page.locator('#editor-panel:not([hidden])').waitFor();assert(await page.locator('#add-anonymous').isDisabled());
  roles=['read'];await page.reload();await page.locator('#finance-app:not([hidden])').waitFor();assert(await page.locator('#new-batch').isHidden());
  assert.deepEqual(errors,[]);results.push({engine:engine.name(),width,passed:true,checks:['multiple entries','independent cash totals','mixed online method','failed save retains amounts','save and reload preserve names','append after reload','delete without renumbering survivors','legacy view no writes','legacy explicit save retains money','saved batch counter confirmation and submit','review lock','read-only permission','no overflow']});console.log('PASS',engine.name(),width);
  await context.close();
 }}finally{await browser.close();}
}}finally{await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(out,'browser-results.json'),JSON.stringify({results,physical_iphone_verified:false,real_authenticated_save_verified:false},null,2));
