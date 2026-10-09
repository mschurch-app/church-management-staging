import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {contrastMetrics} from '../phase3/contrast.mjs';
import {uid,user,session,permissions,daily,weekly,service} from '../phase3/fixtures.mjs';
const base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769',out=new URL('./results/',import.meta.url).pathname;
fs.mkdirSync(out,{recursive:true});
let items=daily(),bulletins=weekly(),services=service(),writes=[],requests=[],mode='owner',stage='initial',failWrite=false,failRead=false,afterWriteFail=false,delayWrite=0,delayId='',delaySchedule='',alerts=[],changes=[],afterWriteAction='',abortWrite=false,malformedWrite=false;
const errors=[],checks=[];let passed=false;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync'],userDataDir:fs.mkdtempSync(path.join(os.tmpdir(),'church-phase4-chrome-'))});
const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.setBypassServiceWorker(true);
await page.evaluateOnNewDocument(session=>{localStorage.setItem('church-staging-admin-v1',JSON.stringify(session));Object.defineProperty(navigator,'standalone',{value:true});window.sharedStyleRemovals=0;new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node.nodeType===1&&node.matches?.('link[data-app-consistency]'))window.sharedStyleRemovals++;}).observe(document,{childList:true,subtree:true});},session);
page.on('pageerror',error=>errors.push(error.message));let answers=[];page.on('dialog',async dialog=>{if(dialog.type()==='beforeunload'){await dialog.accept();return;}if(dialog.type()==='alert'){alerts.push(dialog.message());await dialog.accept();return;}const answer=answers.shift();if(answer===undefined){errors.push('Unexpected dialog: '+dialog.message());await dialog.dismiss();return;}if(answer)await dialog.accept();else await dialog.dismiss();});
await page.setRequestInterception(true);
page.on('request',async req=>{
 const url=new URL(req.url());if(url.hostname.endsWith('supabase.co')){
  let body={};try{body=JSON.parse(req.postData()||'{}');}catch{}requests.push({path:url.pathname,method:req.method(),body});let data=[],code=200;
  const write=async()=>{writes.push({path:url.pathname,method:req.method(),body,url:url.href});if(delayWrite)await new Promise(resolve=>setTimeout(resolve,delayWrite));if(failWrite){code=503;data={error:'unavailable',message:'fixture unavailable'};return false;}if(afterWriteFail&&(!afterWriteAction||body.action===afterWriteAction))failRead=true;return true;};
  if(abortWrite&&req.method()!=='OPTIONS'&&((url.pathname.includes('/functions/')&&!['content_list','list','get'].includes(body.action))||url.pathname.endsWith('/website_weekly_bulletins')&&['POST','PATCH'].includes(req.method())||url.pathname.includes('/rpc/update_service'))){writes.push({path:url.pathname,body});await req.abort('failed');return;}
  if(malformedWrite&&req.method()!=='OPTIONS'&&url.pathname.includes('/functions/')&&!['content_list','list','get'].includes(body.action)){writes.push({path:url.pathname,body});await req.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'});return;}
  if(req.method()==='OPTIONS')data={};
  else if(url.pathname==='/auth/v1/user')data=user;
  else if(url.pathname==='/auth/v1/token')data=session;
  else if(url.pathname.includes('/rpc/')){
   const name=url.pathname.split('/').pop();
   if(name==='get_my_church_access')data=(mode==='denied'?[]:permissions).map(permission=>({church_id:'M+',permission}));
   else if(name==='get_my_admin_profile')data=[{display_name:'測試同工',job_title:'行政同工'}];
   else if(name==='get_my_feature_permissions')data=permissions.map(feature_key=>({church_id:'M+',feature_key,view:true,create:mode!=='readonly',edit:mode!=='readonly',delete:mode!=='readonly',approve:mode!=='readonly',manage:mode!=='readonly',export:true}));
   else if(name==='get_my_app_capabilities')data={is_owner:mode==='owner',has_line:true};
   else if(name==='get_my_home_preferences')data={home_modules:['members','newcomer_care','tree_reading_admin']};
   else if(name==='get_my_system_monitor_access')data=mode==='owner';
   else if(name==='list_my_app_notifications')data=[1,2].map(n=>({id:String(n),title:'通知 '+n,body:'可閱讀的測試通知內容',created_at:new Date().toISOString(),read_at:null,target_url:'members.html?church=M%2B'}));
   else if(name==='mark_app_notification_read')data=true;
   else if(name==='get_service_signup_scopes')data=[];
   else if(name==='get_service_signup_admin'){if(failRead||mode==='denied'){code=503;data={message:mode==='denied'?'forbidden':'unavailable'};}else data=services;}
   else if(name==='get_service_signup_change_requests')data={requests:changes,is_final_reviewer:true};
   else if(name==='get_website_weekly_data'){if(body.p_service_date===delaySchedule)await new Promise(resolve=>setTimeout(resolve,550));data={schedule:{tech_sound:'排班 '+body.p_service_date},next_schedule:null,schedule_roles:[]};}
   else if(name==='update_service_signup_slot'){if(await write()){const slot=services.slots.find(row=>row.id===body.p_slot);slot.capacity=body.p_capacity;slot.is_open=body.p_open;data=true;}}
   else if(name==='update_service_signup_season'){if(await write()){services.seasons.find(row=>row.id===body.p_season).status=body.p_status;data=true;}}
   else if(name==='create_service_signup_quarter'){if(await write())data=true;}
   else if(name==='service_signup_apply_smart_match'){if(await write()){for(const slot of services.slots)for(const person of slot.registrations)if(body.p_registrations.includes(person.id))person.status='confirmed';data={applied:body.p_registrations.length,skipped:0};}}
   else if(name==='list_church_schedules')data=[];
  }
  else if(url.pathname.includes('/functions/v1/daily-devotional-admin')){
   if(body.action==='content_list'){if(failRead){code=503;data={ok:false,error:'unavailable'};}else data={ok:true,items,reviewerStage:stage};}
   else if(await write()){const row=items.find(item=>item.id===body.id);if(body.action==='content_update'){Object.assign(row,body.values);row.review_status='initial_review';}else row.review_status=body.toStatus;data={ok:true};}
  }
  else if(url.pathname.includes('/functions/v1/weekly-bulletin-review')){
   if(body.action==='list'){if(failRead){code=503;data={error:'unavailable'};}else data={ok:true,items:bulletins};}
   else if(body.action==='get'){const row=structuredClone(bulletins.find(row=>row.id===body.bulletinId));if(body.bulletinId===delayId)await new Promise(resolve=>setTimeout(resolve,550));data={ok:true,bulletin:row};}
   else if(await write()){const row=bulletins.find(row=>row.id===body.bulletinId);row.status=body.action==='approve'?'published':body.action==='request_changes'?'changes_requested':'pending_review';row.version++;data={ok:true,recipientCount:2};}
  }
  else if(url.pathname.includes('/functions/v1/service-signup-admin')){if(await write()){for(const slot of services.slots)for(const row of slot.registrations)if(row.id===body.registrationId)row.status=body.status;data={ok:true};if(body.action==='change_review'){changes=changes.filter(row=>row.id!==body.requestId);data.status=body.decision==='approve'?'admin_review':'rejected';}}}
  else if(url.pathname.endsWith('/website_weekly_bulletins')){
   if(['POST','PATCH'].includes(req.method())){if(await write()){const row=bulletins.find(row=>row.id===body.id);if(row)Object.assign(row,body);else bulletins.unshift(body);data={...body};}}
   else if(failRead){code=503;data={message:'fixture unavailable'};}else data=bulletins;
  }
  else if(url.pathname.endsWith('/church_customizations'))data={church_id:'M+',feature_modules:[],welcome_fields:[],catalogs:{},version:1};
  else if(url.pathname.endsWith('/church_public_settings'))data={church_id:'M+',brand_color:'#AD3C2A',logo_url:'',service_info:'每週主日聚會'};
  else if(url.pathname.endsWith('/service_schedules'))data=[];
  else if(url.pathname.endsWith('/instagram_reel_music'))data=[];
  else if(url.pathname.startsWith('/storage/v1/object/')&&req.method()==='POST'){if(await write())data={Key:'fixture',Id:'fixture'};}
  else if(url.pathname.startsWith('/storage/')){code=404;data={message:'fixture media unavailable'};}
  else if(url.pathname.includes('/functions/'))data={ok:true,items:[],settings:{},people:[]};
  await req.respond({status:code,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'*','content-range':'0-0/1'},body:JSON.stringify(data)});return;
 }
 if(url.origin!==base&&url.protocol!=='data:'){await req.abort();return;}await req.continue();
});

const pause=ms=>new Promise(r=>setTimeout(r,ms));
const metrics=[];
function ok(name,value=true){assert.ok(value,name);checks.push(name);console.log('PASS '+name);}
async function goto(file){await page.goto(base+'/'+file+'?church=M%2B',{waitUntil:'networkidle0'});await pause(150);}
async function runtime(code){return page.evaluate(async code=>{const module=await import('/app-runtime.mjs?v=20261009-stage4');return new Function('module',code)(module);},code);}
const active=()=>page.$eval('.notification-ticker-item.is-active',n=>n.dataset.notificationId);
try{
 for(const file of ['admin-dashboard.html','church-settings.html','daily-devotional-admin.html','weekly-bulletin-review.html','website-maintenance.html','service-signup-admin.html']){
  await goto(file);
  const normal=await page.evaluate(()=>({header:document.querySelector('.page-header').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+2,resources:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.decodedBodySize,0)}));
  ok(file+' normal header and width',normal.header===164&&!normal.overflow);ok(file+' transfer budget',normal.bytes<800000);
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');await pause(350);
  const large=await page.evaluate(()=>({header:document.querySelector('.page-header').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+2,titleSize:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),mode:document.documentElement.classList.contains('app-large-text')}));metrics.push({file,normal,large});
  ok(file+' 200% text mode and no horizontal overflow',large.mode&&large.titleSize>=40&&!large.overflow);
  if(file==='admin-dashboard.html')ok('large favorite labels scale with text',await page.$eval('#quick-links .function-open strong',n=>parseFloat(getComputedStyle(n).fontSize)>=27));
  ok(file+' large text contrast',(await page.evaluate(contrastMetrics)).failures.length===0);
  await page.screenshot({path:out+file.replace('.html','')+'-large.png',fullPage:true});
 }
 await goto('website-maintenance.html');
 ok('closed website preview defers iframe',await page.$eval('#website-preview',n=>!n.hasAttribute('src')));
 await page.$eval('.website-preview-disclosure',n=>n.open=true);await pause(100);
 ok('open website preview loads expected source',await page.$eval('#website-preview',n=>n.src===n.dataset.src));
 await goto('admin-dashboard.html');
 await page.waitForSelector('.notification-ticker-item.is-active');
 ok('only active notification can receive focus',await page.$$eval('.notification-ticker-item',ns=>ns.filter(n=>n.tabIndex===0&&!n.inert).length===1&&ns.filter(n=>n.inert&&n.getAttribute('aria-hidden')==='true').length===ns.length-1));
 ok('ticker is not an automatic screen reader announcement',await page.$eval('#notification-list',n=>n.getAttribute('aria-live')==='off'));
 let initial=await active();await page.focus('.notification-ticker-item.is-active');await pause(3200);ok('notification pauses while keyboard focus reads it',await active()===initial);
 await page.focus('#function-search');await pause(3200);ok('notification rotates after reading ends',await active()!==initial);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});initial=await active();await pause(3200);ok('notification pauses in background',await active()===initial);await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);initial=await active();await pause(3200);ok('notification pauses for reduced motion',await active()===initial);
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
 await page.click('#notification-history');await page.waitForSelector('.notification-history-dialog[open]');initial=await active();await pause(3200);ok('notification pauses with history modal open',await active()===initial);
 ok('history modal locks background',await page.$eval('body',n=>n.classList.contains('notification-modal-open')));await page.keyboard.press('Escape');await pause(100);
 await page.focus('.app-skip-link');await page.keyboard.press('Enter');ok('keyboard skip link focuses main heading',await page.evaluate(()=>document.activeElement.tagName==='H2'));
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});window.dispatchEvent(new Event('offline'));});
 ok('offline status visible without reloading',await page.$eval('.app-system-banner',n=>!n.hidden&&n.textContent.includes('沒有網路')));
 ok('offline refresh blocked',await runtime('return module.refreshApp()===false'));
 ok('offline status contrast',(await page.evaluate(contrastMetrics)).failures.length===0);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});window.dispatchEvent(new Event('online'));});
 ok('online announces retry without resubmitting',await page.$eval('.app-system-banner',n=>n.textContent.includes('重新連線')));
 await page.evaluate(()=>{const form=document.createElement('form');form.id='runtime-test-form';form.innerHTML='<input name="test"><div id="test-scroll" style="height:80px;overflow-y:auto"><p style="height:300px">scroll</p></div>';document.body.append(form);form.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));});
 ok('editing marks draft',await page.$eval('#runtime-test-form',n=>n.dataset.unsavedChanges==='true'));
 answers.push(false);ok('cancel refresh keeps draft and session',await runtime('return module.refreshApp()===false')&&await page.$eval('#runtime-test-form',n=>n.dataset.unsavedChanges==='true'));
 await page.$eval('#runtime-test-form',n=>n.reset());ok('reset clears draft',await page.$eval('#runtime-test-form',n=>n.dataset.unsavedChanges==='false'));
 await page.$eval('#runtime-test-form',n=>n.setAttribute('aria-busy','true'));ok('refresh blocked during an active operation',await runtime('return module.refreshApp()===false'));
 await page.$eval('#runtime-test-form',n=>n.removeAttribute('aria-busy'));
 await page.evaluate(async()=>{const module=await import('/app-runtime.mjs?v=20261009-stage4'),reg=new EventTarget();window.updateMessages=[];reg.waiting={postMessage:m=>window.updateMessages.push(m)};module.watchAppRegistration(reg);module.watchAppRegistration(reg);});
 ok('new version offers explicit update',await page.$eval('.app-system-banner button',n=>!n.hidden&&n.textContent==='更新'));
 ok('update action touch target',await page.$eval('.app-system-banner button',n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;}));
 await page.$eval('#runtime-test-form input',n=>n.dispatchEvent(new Event('input',{bubbles:true})));answers.push(false);await page.click('.app-system-banner button');ok('cancel update preserves draft and does not activate',await page.evaluate(()=>updateMessages.length===0));
 answers.push(true);await page.click('.app-system-banner button');ok('accepted update activates exactly once',await page.evaluate(()=>updateMessages.length===1&&updateMessages[0].type==='CHURCH_ACTIVATE_UPDATE'));
 await page.$eval('#runtime-test-form input',n=>n.dispatchEvent(new Event('input',{bubbles:true})));await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));await pause(100);
 ok('typing while update activates prevents reload',await page.$eval('.app-system-banner',n=>n.textContent.includes('完成目前操作')));
 await page.$eval('#runtime-test-form',n=>n.reset());
 const touch=async(selector,kind='cancel')=>page.evaluate((selector,kind)=>{window.scrollTo({top:0,behavior:'instant'});const node=document.querySelector(selector);const emit=(type,x,y)=>node.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'||type==='touchcancel'?[]:[new Touch({identifier:1,target:node,clientX:x,clientY:y})]}));emit('touchstart',100,100);emit('touchmove',kind==='horizontal'?300:100,kind==='horizontal'?120:250);const shown=document.querySelector('.app-pull-refresh').classList.contains('visible');emit(kind==='end'?'touchend':'touchcancel',100,250);return shown;},selector,kind);
 ok('standalone pull indicator is installed',!!await page.$('.app-pull-refresh'));
 ok('pull does not hijack input',!await touch('#runtime-test-form input'));ok('pull does not hijack nested scroller',!await touch('#test-scroll'));ok('horizontal gesture does not refresh',!await touch('.page-header','horizontal'));
 ok('pull shows feedback and cancel hides it',await touch('.page-header')&&await page.$eval('.app-pull-refresh',n=>!n.classList.contains('visible')));
 await page.$eval('#runtime-test-form input',n=>n.dispatchEvent(new Event('input',{bubbles:true})));answers.push(false);ok('cancel pull refresh preserves draft',await touch('.page-header','end')&&await page.$eval('#runtime-test-form',n=>n.dataset.unsavedChanges==='true'));
 await page.$eval('#runtime-test-form',n=>n.reset());
 await page.evaluate(()=>{window.edgeBacks=0;history.back=()=>window.edgeBacks++;history.pushState({},'',location.href);});
 const edge=async(kind)=>page.evaluate(kind=>{const node=document.querySelector('.page-header'),emit=(type,x)=>node.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'||type==='touchcancel'?[]:[new Touch({identifier:1,target:node,clientX:x,clientY:100})],changedTouches:[new Touch({identifier:1,target:node,clientX:x,clientY:100})]}));emit('touchstart',4);emit('touchmove',130);emit(kind==='cancel'?'touchcancel':'touchend',130);return window.edgeBacks;},kind);
 ok('cancelled edge gesture never navigates',await edge('cancel')===0);
 await page.$eval('#runtime-test-form input',n=>n.dispatchEvent(new Event('input',{bubbles:true})));ok('edge gesture protects unsaved form',await edge('end')===0);
 await page.$eval('#runtime-test-form',n=>n.reset());await page.$eval('#runtime-test-form',n=>n.setAttribute('aria-busy','true'));ok('edge gesture protects active operation',await edge('end')===0);
 await page.$eval('#runtime-test-form',n=>n.removeAttribute('aria-busy'));ok('clean edge gesture can navigate back',await edge('end')===1);
 await page.$eval('#runtime-test-form',n=>n.remove());
 const authBefore=await page.evaluate(()=>localStorage.getItem('church-staging-admin-v1'));
 await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),runtime('return module.refreshApp()')]);
 ok('explicit refresh reloads with session preserved',await page.evaluate(()=>localStorage.getItem('church-staging-admin-v1'))===authBefore);
 await page.setViewport({width:1440,height:900});await goto('admin-dashboard.html');await page.keyboard.press('Tab');ok('desktop first Tab reaches skip link',await page.evaluate(()=>document.activeElement.matches('.app-skip-link')));await page.keyboard.press('Enter');ok('desktop keyboard skip reaches heading',await page.evaluate(()=>document.activeElement.tagName==='H2'));
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await goto('admin-dashboard.html');await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));ok('dock leaves final content unobscured',await page.evaluate(()=>document.querySelector('.footnote').getBoundingClientRect().bottom<=document.querySelector('.mobile-app-nav').getBoundingClientRect().top));
 // Real browser service worker, isolated profile; no application APIs are involved.
 const swPage=await browser.newPage();await swPage.goto(base+'/app-offline.html',{waitUntil:'networkidle0'});
 await swPage.evaluate(async()=>{await navigator.serviceWorker.register('/church-os-sw.js?v=20261009-stage4',{scope:'/'});await navigator.serviceWorker.ready;});
 await swPage.waitForFunction(()=>navigator.serviceWorker.controller!==null);
 ok('real service worker installs and controls browser');
 const workerTarget=browser.targets().find(target=>target.type()==='service_worker'&&target.url().startsWith(base+'/church-os-sw.js'));
 const workerCDP=await workerTarget.createCDPSession();await workerCDP.send('Network.enable');await workerCDP.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await swPage.setOfflineMode(true);await swPage.goto(base+'/apple-ui.css?offline-probe=1',{waitUntil:'networkidle0'});
 ok('uncached offline navigation keeps requested URL and shows recovery',swPage.url().includes('apple-ui.css?offline-probe=1')&&await swPage.$('#retry'));
 await swPage.click('#retry');ok('offline retry stays recoverable',!!await swPage.$('#retry'));
 ok('offline recovery contrast',(await swPage.evaluate(contrastMetrics)).failures.length===0);await swPage.screenshot({path:out+'offline-recovery.png',fullPage:true});
 await swPage.goto(base+'/admin-line-callback.html?code=synthetic-offline-probe',{waitUntil:'networkidle0'});ok('offline auth return offers login without losing URL',swPage.url().includes('code=synthetic-offline-probe')&&await swPage.$eval('#home',n=>n.getAttribute('href')==='/admin-login-v2.html'));
 await swPage.goto(base+'/apple-ui.css?offline-probe=1',{waitUntil:'networkidle0'});
 await workerCDP.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await swPage.setOfflineMode(false);await pause(100);
 await Promise.all([swPage.waitForNavigation({waitUntil:'networkidle0'}),swPage.click('#retry')]);
 ok('retry opens original resource after network returns',!await swPage.$('#retry')&&swPage.url().includes('apple-ui.css?offline-probe=1'));
 await swPage.goto(base+'/app-offline.html',{waitUntil:'networkidle0'});
 await swPage.evaluate(async()=>{await import('/app-runtime.mjs?v=20261009-stage4');const module=await import('/app-runtime.mjs?v=20261009-stage4');const reg=await navigator.serviceWorker.register('/church-os-sw.js?v=20261009-stage4&update-probe=1',{scope:'/'});module.watchAppRegistration(reg);});
 await swPage.waitForSelector('.app-system-banner:not([hidden]) button:not([hidden])');
 ok('real updated worker waits for explicit consent',await swPage.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting));
 await Promise.all([swPage.waitForNavigation({waitUntil:'networkidle0'}),swPage.click('.app-system-banner button')]);
 ok('explicit update activates and reloads',await swPage.evaluate(()=>navigator.serviceWorker.controller.scriptURL.includes('update-probe')));
 await swPage.close();
 ok('no business mutations sent',writes.length===0);ok('no unexpected browser errors',errors.length===0);
 passed=true;
}finally{fs.writeFileSync(out+'browser.json',JSON.stringify({origin:base,api_mode:'isolated_synthetic',passed,checks,metrics,errors,writes},null,2));await browser.close();}
console.log('TOTAL',checks.length);
process.exit(0);
