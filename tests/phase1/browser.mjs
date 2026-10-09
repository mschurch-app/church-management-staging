import puppeteer from 'puppeteer-core';import assert from 'node:assert/strict';import fs from 'node:fs';import {database} from './bootstrap.mjs';
const base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769',out=new URL('./results/',import.meta.url).pathname;
const owner='30000000-0000-4000-8000-000000000001',email='30000000-0000-4000-8000-000000000002',line='30000000-0000-4000-8000-000000000003';
const perms=['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp'];
const user={id:owner,email:'owner@example.invalid',identities:[{provider:'custom:line-web'}],app_metadata:{providers:['email','custom:line-web']}};
const session={access_token:[{alg:'HS256'}, {sub:owner,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'fixture'].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.'),refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,user};
const db=await database(),q=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
await db.query('insert into auth.users values($1,$2),($3,$4),($5,null)',[owner,'owner@example.invalid',email,'worker@example.invalid',line]);
await db.query("insert into church_auth.accounts(user_id,is_active,display_name,job_title) values($1,true,'測試擁有者','牧者'),($2,true,'測試同工','影音負責人')",[owner,email]);await db.query('insert into church_auth.owners(user_id) values($1)',[owner]);
await db.query("insert into church_auth.grants values($1,'M+','schedules')",[email]);await db.query("insert into church_auth.account_roles values($1,'M+','custom')",[email]);await db.query("insert into church_auth.service_ministry_scopes(user_id,church_id,ministry_key) values($1,'M+','media')",[email]);
await db.query("insert into auth.identities values($1,'custom:line-web','U30000000000000000000000000000003','{}')",[line]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await q('select public.approve_line_admin_access_review($1,$2)',[line,email]);await db.exec('set role authenticated');
let loseResponse=true,saveRequests=[],memberMode='devotional',memberRequests=[],errors=[],checks=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--disable-background-networking','--disable-sync'],userDataDir:out+'/chrome'});
fs.mkdirSync(out,{recursive:true});
const context=await browser.createBrowserContext();
const page=await context.newPage();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.setBypassServiceWorker(true);
await page.evaluateOnNewDocument(session=>{localStorage.setItem('church-staging-admin-v1',JSON.stringify(session));},session);
await page.setRequestInterception(true);page.on('pageerror',e=>errors.push(e.message));
page.on('request',async req=>{
 try{
 const url=new URL(req.url());const respond=(data,status=200)=>req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*'},body:JSON.stringify(data)});
 if(req.method()==='OPTIONS')return await respond({});
 if(url.hostname.endsWith('supabase.co')){
  const body=JSON.parse(req.postData()||'{}');let data=[];
  if(url.pathname==='/auth/v1/user')data=user;
  else if(url.pathname.includes('/rpc/')){
   const name=url.pathname.split('/').pop();
   if(name==='get_my_church_access')data=perms.map(permission=>({church_id:'M+',permission}));
   else if(name==='get_my_feature_permissions')data=perms.map(feature_key=>({church_id:'M+',feature_key,view:true,create:true,edit:true,manage:true}));
   else if(name==='get_my_app_capabilities')data={is_owner:true};
   else if(name==='list_admin_accounts_v4')data=await q('select public.list_admin_accounts_v4()');
   else if(name==='get_service_signup_scopes')data=body.p_church==='M+'?['media']:['welcome'];
   else if(name==='save_admin_account_bundle'){
    saveRequests.push(body);
    try{data=await q('select public.save_admin_account_bundle($1,$2,$3::jsonb,$4,$5)',[body.p_user,body.p_church,JSON.stringify(body.p_input),body.p_expected_version,body.p_request_id]);}catch(e){return await respond({message:e.message,code:e.code},400);}
    if(loseResponse){loseResponse=false;return await respond({message:'connection interrupted'},503);}
   }else if(name==='remove_admin_account')data=await q('select public.remove_admin_account($1)',[body.p_user]);
   else if(name==='get_my_admin_profile')data=[{display_name:'測試擁有者',job_title:'牧者'}];
  }else if(url.pathname.includes('/functions/v1/line-member')){
   memberRequests.push(body);
   if(memberMode==='offline')return await respond({ok:false,error:'unavailable'},503);
   if(memberMode==='launchPending')data={ok:true,launchPending:true};
   else if(memberMode==='signup')data={ok:true,member:{name:'合成會友'},seasons:[],registrations:[]};
   else data={ok:true,item:{devotional_title:'合成靈修標題',key_points:'測試',reflection_questions:'測試'},progress:[]};
  }else if(url.pathname.includes('/church_customizations'))data={church_id:'M+',catalogs:{},feature_modules:[]};
  else if(url.pathname.includes('/church_public_settings'))data={church_id:'M+',brand_color:'#a83929'};
  return await respond(data);
 }
 if(url.origin===base||url.protocol==='data:')return await req.continue();
 await req.abort();
 }catch(e){errors.push('interceptor:'+e.message);if(!req.isInterceptResolutionHandled())await req.abort();}
});
async function check(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS',name);}
try{
 await page.goto(base+'/admin-accounts.html?church=M%2B',{waitUntil:'networkidle0'});
 await check('verified Email/LINE accounts appear as one editable row',async()=>assert.equal(await page.$$eval('#items .admin-account-card',ns=>ns.length),2));
 await page.$$eval('#items button',ns=>ns.find(n=>n.textContent==='編輯資料與權限').click());await page.waitForSelector('#editor form');
 await page.$eval('#editor input:not([type])',n=>{n.value='保留輸入';});
 await page.$eval('#editor form',f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('.form-message')?.textContent.includes('尚未確認'));
 await page.screenshot({path:out+'/account-retry-390.png',fullPage:false});
 await check('lost server response restores save button and preserves input',async()=>{assert.equal(await page.$eval('#editor input:not([type])',n=>n.value),'保留輸入');assert.equal(await page.$eval('#editor button[type=submit]',n=>n.disabled),false);assert.equal(saveRequests.length,1);});
 await page.$eval('#editor form',f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已儲存'));
 await check('retry reuses request ID and succeeds without a second change',async()=>{assert.equal(saveRequests.length,2);assert.equal(saveRequests[0].p_request_id,saveRequests[1].p_request_id);await db.exec('reset role');assert.equal(await q("select count(*)::int from church_auth.account_change_audit where action='save'"),1);await db.exec('set role authenticated');});
 await page.waitForFunction(()=>document.querySelector('#editor').hidden);
 await page.$$eval('#items button',ns=>ns.find(n=>n.textContent==='編輯資料與權限').click());await page.waitForSelector('#editor form');
 await check('administrative coordinator scope remains selectable and exclusive',async()=>{assert(await page.$('input[data-scope=all]'));await page.click('input[data-scope=all]');assert.equal(await page.$$eval('input[data-scope]:checked',ns=>ns.map(n=>n.value).join(',')),'all');});
 await page.$eval('#editor button[type=submit]',n=>n.click());await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已儲存'));
 await page.waitForFunction(()=>document.querySelector('#editor').hidden);
 page.on('dialog',async dialog=>dialog.accept());await page.$$eval('#items button',ns=>ns.find(n=>n.textContent==='移除教會 OS 權限').click());await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已移除'));
 await check('revocation removes the one combined card and both principals',async()=>{assert.equal(await page.$$eval('#items .admin-account-card',ns=>ns.length),1);assert.equal((await q('select public.list_admin_accounts_v4()')).length,1);});
}catch(e){console.error('UI FAIL',e.message);process.exitCode=1;}
// Public LINE member pages use isolated synthetic credentials and API content only.
try{
 await page.goto(base+'/admin-line-launch.html');await page.evaluate(()=>{sessionStorage.setItem('line-member-access-token:M+','synthetic-line-access');sessionStorage.removeItem('line-member-token:M+');});
 memberMode='devotional';await page.goto(base+'/daily-devotional.html?church=M%2B&date=2026-10-09',{waitUntil:'networkidle0'});
 await check('daily devotional accepts access-token-only LINE session',async()=>{assert((await page.$eval('#content',n=>n.textContent)).includes('合成靈修標題'));assert.equal(memberRequests.at(-1).accessToken,'synthetic-line-access');assert.equal(memberRequests.at(-1).date,'2026-10-09');});
 memberMode='offline';await page.reload({waitUntil:'networkidle0'});
 await check('devotional network failure keeps credentials and offers retry',async()=>{assert.equal(await page.evaluate(()=>sessionStorage.getItem('line-member-access-token:M+')),'synthetic-line-access');assert(await page.$('#status button'));assert(page.url().includes('daily-devotional'));});
 memberMode='devotional';await page.click('#status button');await page.waitForFunction(()=>!document.querySelector('#content').hidden);
 await check('devotional retry recovers in same page',async()=>assert((await page.$eval('#content',n=>n.textContent)).includes('合成靈修標題')));
 memberMode='offline';await page.goto(base+'/service-signup.html',{waitUntil:'networkidle0'});
 await check('service signup network failure avoids LINE redirect loop',async()=>{assert(page.url().includes('service-signup.html'));assert(await page.$('#status button'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('line-member-access-token:M+')),'synthetic-line-access');});
 memberMode='signup';await page.click('#status button');await page.waitForFunction(()=>!document.querySelector('#app').hidden);
 await check('service signup retry loads a recoverable empty-season state',async()=>assert((await page.$eval('#app',n=>n.textContent)).includes('尚未')));
 await check('no uncaught browser JavaScript errors',async()=>assert.deepEqual(errors,[]));
}catch(e){console.error('PUBLIC UI FAIL',e.message);process.exitCode=1;}
finally{fs.writeFileSync(out+'/browser-results.json',JSON.stringify({checks,errors,serverResponseLoss:true,syntheticCredentials:true},null,2));await browser.close();await db.close();}
