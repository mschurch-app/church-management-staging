import {chromium,webkit} from '/Volumes/MPLUS-DATA/mplus-ai/tools/mini-devkit/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('.'),fallback=resolve('../church-os-line-newcomer-fix');const results=[];await mkdir(root+'/verification',{recursive:true});
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('content-type',({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');let body;try{body=await readFile(path);}catch{body=await readFile(fallback+path.slice(root.length));}if(extname(path)==='.html')body=body.toString().replace(/<script[^>]*src="https:\/\/static\.line-scdn\.net[^"]*"[^>]*><\/script>/g,'');res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(8771,'127.0.0.1',r));
const base='http://127.0.0.1:8771';
const tailwind=await readFile(root+'/verification/tailwind-runtime.js','utf8').catch(()=> 'window.tailwind={};');
const options=Object.fromEntries(['gender','age','district','source','faith','feelings','interests'].map(k=>[k,[{value:k,label:'合成'+k,selected:k==='gender'}]]));
const fields=['identity','phone','birthday','age','district','source','faith','feelings','interests','photo'].map((key,i)=>({key,label:{identity:'姓名與性別',phone:'手機'}[key]||key,visible:true,required:['identity','phone'].includes(key),sort_order:i}));
const liff=`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>localStorage.getItem('fixture-access-only')?'':'synthetic-id-token',getAccessToken:()=> 'synthetic-access',login:()=>{},getProfile:async()=>({displayName:'合成新朋友'})};`;
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true,...(engine===webkit?{executablePath:'/Volumes/MPLUS-DATA/mplus-ai/tools/mobile-testing/playwright-browsers/webkit-2370/pw_run.sh'}:{})});
 try{for(const width of [393,1440]){
  let registered=false,memberState=null,menuUnauthorized=false,claimScenario=null;const writes=[],checks=[];
  const context=await browser.newContext({viewport:{width,height:1000}});await context.addInitScript('window.tailwind={};'+liff);
  await context.route('**/church-brand.mjs*',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await context.route('**/welcome-options.mjs',r=>r.fulfill({contentType:'text/javascript',body:'export async function getOptions(){return '+JSON.stringify({options})+'}'}));
  await context.route('**/church-customizations.mjs*',r=>r.fulfill({contentType:'text/javascript',body:'export async function loadChurchCustomizations(){return '+JSON.stringify({welcome_fields:fields})+'}'}));
  await context.route('**/vendor/supabase-2.102.0.js',r=>r.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:localStorage.getItem('fixture-web')?{access_token:'synthetic-session'}:null}})},rpc:async()=>({data:[{church_id:'SHiNE'}],error:null})})};`}));
  await context.route('**/*',async route=>{
   if(!route.request().url().startsWith('https://'))return route.fallback();
   const url=route.request().url();
   if(url.includes('/member-access')){const b=route.request().postDataJSON();checks.push(b);if(b.action==='lookup')return route.fulfill({json:{state:'candidates',candidates:claimScenario&&'合成家人'.startsWith(b.query)?[{name:'合成家人',token:'00000000-0000-4000-8000-000000000099'}]:[]}});if(b.action==='claim_select')return route.fulfill({json:claimScenario==='review'?{state:'review_required'}:{state:'challenge',method:claimScenario}});if(b.action==='claim_verify')return route.fulfill({json:b.answer===(claimScenario==='phone'?'0912345678':'1980-02-03')?{state:'verified',claimToken:b.candidate,member:{name:'合成家人',phone:claimScenario==='phone'?'0912345678':'',birthday:claimScenario==='birthday'?'1980-02-03':'',gender:'gender',district:'district',age_group:'age'}}:{state:'mismatch'}});return route.fulfill({json:b.action==='onboarding'?{state:registered?'approved':'unbound',registered}:memberState?{state:memberState}:registered?{state:'approved',member:{name:'合成新朋友'}}:{state:'unbound'}});}
   if(url.includes('/newcomer-register')){const b=route.request().postDataJSON();writes.push(b);registered=!b.claimReview;return route.fulfill({json:b.claimReview?{accepted:true,pendingReview:true}:{accepted:true,lineBound:true,existingMember:!!b.claimToken},status:b.claimReview?202:201});}
   if(url.includes('/functions/v1/line-member'))return route.fulfill(menuUnauthorized?{status:401,json:{ok:false,error:'login_required'}}:{json:{ok:true,profile:{name:'合成新朋友'}}});
   if(url.includes('/liff/edge'))return route.fulfill({contentType:'text/javascript',body:liff});
   if(url.includes('tailwindcss'))return route.fulfill({contentType:'text/javascript',body:tailwind});
   return route.abort();
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/line-member.html?church=M%2B&feature=menu');
  await page.waitForURL('**/newcomer.html?**');
  await page.addStyleTag({content:'.hidden{display:none!important}'});
  await page.locator('#btnSubmit:not([disabled])').waitFor();assert.equal(await page.locator('#formSection').isVisible(),true);
  await page.getByRole('button',{name:'稍後填寫，繼續使用',exact:true}).click();
  await page.waitForURL('**/line-member.html?**');await page.locator('.menu-welcome').waitFor();assert.equal(writes.length,0);
  // A later login / entry asks again: the dismissal is consumed, never permanent.
  await page.reload();await page.waitForURL('**/newcomer.html?**');await page.addStyleTag({content:'.hidden{display:none!important}'});
  await page.locator('#btnSubmit:not([disabled])').waitFor();await page.locator('#guestName').fill('合成新朋友');await page.locator('#guestPhone').fill('0900000000');await page.locator('#btnSubmit').click();
  await page.locator('#successMessage').filter({hasText:'LINE 也已完成綁定'}).waitFor();assert.equal(await page.locator('#onboarding-later').isVisible(),false);assert.equal(writes.length,1);assert.equal(writes[0].idToken,'synthetic-id-token');assert.equal(writes[0].subject,undefined);
  await page.locator('#btnClosePage').click();await page.waitForURL('**/line-member.html?**');await page.locator('.menu-welcome').waitFor();await page.reload();await page.locator('.menu-welcome').waitFor();assert(!page.url().includes('newcomer.html'));
  // A member-free direct route must ask too, not just the menu.
  registered=false;await page.goto(base+'/today-verse-liff.html?church=M%2B');await page.waitForURL('**/newcomer.html?**');
  await page.evaluate(()=>localStorage.setItem('fixture-access-only','yes'));
  await page.goto(base+'/line-member.html?church=SHiNE&feature=menu');await page.waitForURL('**/newcomer.html?**');await page.addStyleTag({content:'.hidden{display:none!important}'});await page.locator('#btnSubmit:not([disabled])').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('church'),'SHiNE');await page.getByRole('button',{name:'稍後填寫，繼續使用',exact:true}).click();await page.waitForURL('**/line-member.html?**');await page.locator('.menu-welcome').waitFor();
  await page.evaluate(()=>localStorage.setItem('fixture-web','yes'));await page.goto(base+'/admin-line-callback.html?next=admin-dashboard.html');await page.waitForURL('**/newcomer.html?**');await page.addStyleTag({content:'.hidden{display:none!important}'});await page.locator('#btnSubmit:not([disabled])').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('church'),'SHiNE');assert.equal(new URL(page.url()).searchParams.get('identitySource'),'web');
  await page.locator('#guestName').fill('合成網頁新朋友');await page.locator('#guestPhone').fill('0900000001');await page.locator('#btnSubmit').click();await page.locator('#successMessage').filter({hasText:'LINE 也已完成綁定'}).waitFor();
  assert.equal(writes.at(-1).sessionToken,'synthetic-session');assert.equal(writes.at(-1).idToken,undefined);
  // Unbound, legacy pending and restricted identities all lead to the complete form.
  for(const state of ['unbound','pending','rejected','revoked']){
   memberState=state;registered=false;await page.goto(base+'/newcomer.html?church=M%2B');await page.addStyleTag({content:'.hidden{display:none!important}'});await page.locator('#btnSubmit:not([disabled])').waitFor();
   assert.equal(await page.getByRole('button',{name:'送出 LINE 綁定申請',exact:true}).count(),0);
   assert.equal(await page.locator('#memberIdentityPanel input').count(),0);
   await page.getByRole('button',{name:'填寫會友建檔更新表單',exact:true}).click();assert.equal(await page.locator('#formSection').isVisible(),true);assert.equal(await page.locator('#guestName').evaluate(n=>n===document.activeElement),true);
   await page.locator('#guestName').fill('合成待填朋友');await page.locator('#guestPhone').fill('0900000000');
   if(state==='pending'){
    await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});await page.screenshot({path:root+`/verification/pending-${engine.name()}-${width}.png`});const before=writes.length;await page.locator('#btnSubmit').click();await page.locator('#successMessage').filter({hasText:'LINE 也已完成綁定'}).waitFor();assert.equal(writes.length,before+1);assert.equal(writes.at(-1).kind,'newcomer');
   }
  }
  const writesBeforeRecovery=writes.length;
  // Screenshots: pending refresh owns its result, never enters a write watchdog.
  memberState='pending';await page.goto(base+'/newcomer.html?church=M%2B');await page.addStyleTag({content:'.hidden{display:none!important}'});await page.getByRole('button',{name:'重新查詢狀態',exact:true}).waitFor();
  assert.equal(await page.locator('#memberIdentityPanel').getAttribute('data-action-feedback'),'off');
  await page.addScriptTag({type:'module',url:base+'/action-feedback.mjs'});await page.waitForFunction(()=>window.__churchActionFeedbackInstalled===true);await page.clock.install();
  const statusBefore=checks.filter(c=>c.action==='status').length;await page.getByRole('button',{name:'重新查詢狀態',exact:true}).click();await page.waitForFunction(()=>!!document.querySelector('#memberIdentityPanel button'));assert(checks.filter(c=>c.action==='status').length>statusBefore);assert.equal(await page.locator('#formSection').isVisible(),true);
  await page.clock.fastForward(21000);assert.equal(await page.locator('.os-action-toast.warning.show').count(),0);await page.clock.resume();
  memberState=null;registered=true;menuUnauthorized=true;await page.goto(base+'/line-member.html?church=M%2B&feature=menu');await page.getByRole('heading',{name:'請重新確認 LINE 登入',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'重新開啟 LINE 入口',exact:true}).count(),1);assert((await page.locator('[data-error-detail]').textContent()).includes('L05'));assert.equal(writes.length,writesBeforeRecovery);
  menuUnauthorized=false;memberState=null;
  for(const scenario of ['phone','birthday','review']){
   claimScenario=scenario;registered=false;await page.goto(base+'/newcomer.html?church=M%2B');await page.addStyleTag({content:'.hidden{display:none!important}'});await page.locator('#btnSubmit:not([disabled])').waitFor();
   await page.locator('#guestName').fill('合');await page.getByRole('button',{name:'這是我：合成家人',exact:true}).waitFor();
   await page.locator('#guestName').fill('合成家人');await page.getByRole('button',{name:'這是我：合成家人',exact:true}).click();await page.getByRole('button',{name:'是，我是 合成家人',exact:true}).click();
   if(scenario==='review'){
    await page.locator('#memberClaimLookup').filter({hasText:'送出後由同工確認'}).waitFor();assert.equal(await page.locator('#guestPhone').inputValue(),'');await page.locator('#guestPhone').fill('0900000008');
   }else{
    await page.locator('#memberClaimAnswer').fill(scenario==='phone'?'0912345678':'1980-02-03');await page.getByRole('button',{name:'核對本人資料',exact:true}).click();await page.locator('#memberClaimLookup').filter({hasText:'身分核對通過'}).waitFor();
    assert.equal(await page.locator('#guestName').getAttribute('readonly'),'');if(scenario==='phone')assert.equal(await page.locator('#guestPhone').inputValue(),'0912345678');else await page.locator('#guestPhone').fill('0900000009');
   }
   if(scenario==='birthday'){
    await page.locator('#memberClaimLookup').getByRole('button',{name:'不是我，重新查詢',exact:true}).click();assert.equal(await page.locator('#guestPhone').inputValue(),'0900000009');await page.getByRole('button',{name:'這是我：合成家人',exact:true}).click();await page.getByRole('button',{name:'是，我是 合成家人',exact:true}).click();await page.locator('#memberClaimAnswer').fill('1980-02-03');await page.getByRole('button',{name:'核對本人資料',exact:true}).click();await page.locator('#memberClaimLookup').filter({hasText:'身分核對通過'}).waitFor();assert.equal(await page.locator('#guestPhone').inputValue(),'0900000009');
   }
   const before=writes.length;if(scenario==='phone')await page.evaluate(()=>{document.querySelector('#btnSubmit').click();document.querySelector('#btnSubmit').click();});else await page.locator('#btnSubmit').click();await page.locator('#successMessage').filter({hasText:scenario==='review'?'資料已送請同工確認':'既有會友資料已補齊'}).waitFor();assert.equal(writes.length,before+1);assert.equal(writes.at(-1).claimToken,'00000000-0000-4000-8000-000000000099');assert.equal(!!writes.at(-1).claimReview,scenario==='review');assert.equal(registered,scenario!=='review');
  }
  assert(checks.some(c=>c.action==='onboarding'));assert(!checks.some(c=>c.action==='request'));assert.deepEqual(errors,[]);results.push({engine:engine.name(),width,passed:true,legacy_short_requests:0});
  console.log('PASS',engine.name(),width,'unbound → form, skip → public menu, next entry prompts again, register+bind, bound entry, direct verse invitation, pending refresh without false 20s warning, 401 recovery, prefix lookup, phone/birthday verification, staff review');await context.close();
 }}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}

await writeFile(root+'/verification/browser-results.json',JSON.stringify({results,real_phone_verified:false},null,2));
