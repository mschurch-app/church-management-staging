import assert from 'node:assert/strict';
import fs from 'node:fs';
import {session,user,permissions,weekly} from './phase3/fixtures.mjs';
import {contrastMetrics} from './phase3/contrast.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769';
const out=new URL('./phase3/results/feedback/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const checks=[];function check(value,label){assert(value,label);checks.push(label);console.log('PASS',label);}
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch(name==='chromium'?{executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}:{headless:true});
 try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(session=>localStorage.setItem('church-staging-admin-v1',JSON.stringify(session)),session);
  let eligibility=true,promoFailure=false,bulletinFailure=false,writes=0;const errors=[];
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();if(!url.hostname.endsWith('supabase.co'))return route.abort();let body={};try{body=request.postDataJSON()||{};}catch{}let data=[],status=200;
   if(url.pathname==='/auth/v1/user')data=user;else if(url.pathname==='/auth/v1/token')data=session;
   else if(url.pathname.endsWith('/get_my_church_access'))data=permissions.map(permission=>({church_id:'M+',permission}));
   else if(url.pathname.endsWith('/get_my_feature_permissions'))data=permissions.map(feature_key=>({church_id:'M+',feature_key,view:true,approve:true,edit:true}));
   else if(url.pathname.endsWith('/get_my_app_capabilities'))data={is_owner:true,has_line:true};
   else if(url.pathname.endsWith('/weekly-promo-review')){if(promoFailure){status=503;data={error:'unavailable'};}else data={ok:true,items:[]};}
   else if(url.pathname.endsWith('/weekly-bulletin-review')){const rows=weekly().map(r=>({...r,status:'pending_review'}));if(body.action==='list'){if(bulletinFailure){status=503;data={error:'unavailable'};}else data={ok:true,items:rows};}else if(body.action==='get')data={ok:true,bulletin:rows.find(r=>r.id===body.bulletinId),...(eligibility===null?{}:{canDecide:eligibility})};else{writes++;data={ok:true};}}
   await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  });
  const visit=async()=>{await page.goto(origin+'/weekly-bulletin-review.html?church=M%2B');await page.waitForFunction(()=>!document.querySelector('#review-reload').disabled);};
  const prefix=name+' '+width+': ';
  await visit();check(await page.locator('#approve').isVisible(),prefix+'eligible reviewer sees decisions');
  await page.locator('#approve').click();await page.locator('.workflow-dialog[open]').waitFor();await page.keyboard.press('Escape');check(writes===0,prefix+'cancel does not write');
  for(const decision of [false,null]){eligibility=decision;await visit();check(!await page.locator('#review-actions').isVisible()&&await page.locator('#review-access-note').isVisible(),prefix+'explicit readonly feedback '+decision);await page.locator('#approve').evaluate(n=>n.click());await page.locator('#request-changes').evaluate(n=>n.click());check(writes===0&&!await page.locator('.workflow-dialog[open]').count(),prefix+'readonly handlers block decisions '+decision);}
  promoFailure=true;await visit();check((await page.locator('#review-load-note').textContent()).includes('主日社群預告'),prefix+'partial failure names missing list');check((await page.locator('#status').textContent()).includes('尚未載入'),prefix+'partial status remains accurate');
  const metrics=await page.evaluate(contrastMetrics);check(metrics.failures.length===0,prefix+'visible text contrast');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+'no page overflow');await page.screenshot({path:new URL(name+'-'+width+'.png',out).pathname,fullPage:true});
  promoFailure=false;await page.locator('#review-reload').click();await page.waitForFunction(()=>!document.querySelector('#review-reload').disabled);check(!await page.locator('#review-load-note').isVisible(),prefix+'recovery removes missing-list warning');
  bulletinFailure=true;await visit();check((await page.locator('#preview').textContent()).includes('其餘清單尚未載入')&&(await page.locator('#status').textContent()).includes('尚未載入'),prefix+'incomplete empty list never claims complete');check(writes===0&&errors.length===0,prefix+'no writes or uncaught errors');await context.close();
 }}finally{await browser.close();}
}
fs.writeFileSync(new URL('checks.json',out),JSON.stringify({checks,synthetic:true,realIphone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
