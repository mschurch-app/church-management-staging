import {chromium,webkit} from '/Volumes/MPLUS-DATA/mplus-ai/tools/mini-devkit/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
const mock=`export const db={auth:{getSession:async()=>({data:{session:{user:{id:'synthetic'}}}}),onAuthStateChange:()=>{}},functions:{invoke:async(_,{body:b})=>{
const f=window.fixture;f.calls.push(b);let data={ok:true};
if(b.action==='profile')Object.assign(data,{owner:true,canEdit:true,canIssue:true,canCamp:false,canExport:true,issuer:{name:'合成協會',tax_number:'12345678',address:'合成地址'},permissions:Object.fromEntries(['money','goods'].flatMap(k=>['view','draft','issue','reprint','void'].map(p=>[k+'.'+p,true])))});
if(b.action==='projects')Object.assign(data,{projects:[{id:'p1',name:'合成專案',active:true}],ministries:[{id:'m1',project_id:'p1',name:'合成事工',active:true}]});
if(b.action==='list')data.receipts=f.rows.filter(r=>r.kind===b.kind);
if(b.action==='get')Object.assign(data,{receipt:f.rows.find(r=>r.id===b.id),events:[]});
if(b.action==='save'){
 await new Promise(r=>setTimeout(r,250));
 if(f.fail){f.fail=false;return {error:{context:{json:async()=>({ok:false,code:'invalid_request'})}}};}
 const d=b.data;const row={id:b.id,version:1,state:'draft',kind:d.kind,donation_date:d.donationDate,project:d.project,donor_name:d.donorName,recipient_name:d.recipientName,recipient_address:d.recipientAddress,source_ref:d.sourceRef,amount:d.amount,items:d.items,income_method:d.incomeMethod,ministry_item_id:'m1',classification_snapshot:{projectId:'p1',projectName:'合成專案',ministryName:'合成事工'}};
 f.rows.push(row);data.receipt=row;
}
if(b.action==='issue'){const r=f.rows.find(r=>r.id===b.id);Object.assign(r,{state:'issued',receipt_number:'SYN-2026-000001',version:2});data.receipt=r;}
return {data,error:null};}}};`;
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true,...(engine===webkit?{executablePath:'/Volumes/MPLUS-DATA/mplus-ai/tools/mobile-testing/playwright-browsers/webkit-2370/pw_run.sh'}:{})});
 try{for(const width of [393,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>{window.fixture={calls:[],rows:[],fail:false,prints:0};window.print=()=>fixture.prints++;});
  await context.route('**/admin-db.mjs*',r=>r.fulfill({contentType:'text/javascript',body:mock}));
  await context.route('https://**',r=>r.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8768/finance-receipts.html');
  await page.locator('#new-receipt').click();await page.locator('#save-receipt').click();
  await page.locator('#receipt-editor-feedback').filter({hasText:'尚未儲存：'}).waitFor();
  assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.action==='save').length),0);
  for(const label of ['專案名稱','事工項目','收入方式','實際捐贈人','收據抬頭','原始收入／物品接收紀錄編號','金額'])assert.match(await page.locator('#receipt-editor-feedback').innerText(),new RegExp(label));
  await page.selectOption('[name=projectId]','p1');await page.selectOption('[name=ministryItemId]','m1');await page.selectOption('[name=incomeMethod]','cash');
  for(const [k,v]of Object.entries({donorName:'合成捐贈人',recipientName:'合成抬頭',sourceRef:'SYN-SOURCE',amount:'100'}))await page.fill('[name='+k+']',v);
  await page.evaluate(()=>fixture.fail=true);await page.locator('#save-receipt').click();
  await page.locator('#receipt-editor-feedback').filter({hasText:'正在儲存'}).waitFor();
  await page.locator('#receipt-editor-feedback').filter({hasText:'欄位不完整'}).waitFor();
  assert.equal(await page.locator('[name=donorName]').inputValue(),'合成捐贈人');
  await page.locator('#save-receipt').click();await page.locator('#receipt-editor-feedback').filter({hasText:'收據草稿已儲存'}).waitFor();
  await page.locator('#receipt-list').getByRole('button',{name:'預覽草稿',exact:true}).click();
  await page.locator('#receipt-paper').getByText('草稿預覽 · 非正式收據',{exact:true}).waitFor();await page.locator('#close-preview').click();
  await page.locator('#receipt-verified').check();await page.locator('#issue-receipt').click();
  await page.locator('.workflow-dialog').getByRole('button',{name:'確認開立',exact:true}).click();
  await page.locator('#receipt-editor-feedback').filter({hasText:'收據已開立：SYN-2026-000001'}).waitFor();
  await page.locator('#receipt-list').getByRole('button',{name:'預覽／列印',exact:true}).click();
  await page.locator('#receipt-paper').getByText('SYN-2026-000001',{exact:true}).waitFor();
  await page.locator('#print-receipt').click();assert.equal(await page.evaluate(()=>fixture.prints),1);await page.locator('#close-preview').click();
  await page.locator('#goods-tab').click();await page.locator('#new-receipt').click();await page.locator('#save-receipt').click();
  await page.locator('#receipt-editor-feedback').filter({hasText:'物品名稱'}).waitFor();
  assert.doesNotMatch(await page.locator('#receipt-editor-feedback').innerText(),/收入方式/);
  await page.selectOption('[name=projectId]','p1');await page.selectOption('[name=ministryItemId]','m1');
  for(const [k,v]of Object.entries({donorName:'合成捐物人',recipientName:'合成抬頭',sourceRef:'SYN-GOODS'}))await page.fill('[name='+k+']',v);
  await page.fill('[data-item-field=name]','合成物品');await page.fill('[data-item-field=unit]','件');
  await page.locator('#save-receipt').click();await page.locator('#receipt-editor-feedback').filter({hasText:'收據草稿已儲存'}).waitFor();
  await page.locator('#receipt-list').getByRole('button',{name:'預覽草稿',exact:true}).click();await page.locator('#receipt-paper').getByText('合成物品',{exact:true}).waitFor();
  await page.screenshot({path:'/tmp/receipts-fixed-'+engine.name()+'-'+width+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log('PASS',engine.name(),width,'invalid fields, failure retention, retry save, draft preview, issue, print, goods save');await context.close();
 }}finally{await browser.close();}
}
