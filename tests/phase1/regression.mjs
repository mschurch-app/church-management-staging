import puppeteer from 'puppeteer-core';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url).pathname,out=new URL('./results/regression/',import.meta.url).pathname,base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769';
const permissions=['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp'];
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const user={id:uid,email:'audit@example.invalid',app_metadata:{provider:'custom:line-web',providers:['email','custom:line-web']},user_metadata:{name:'測試同工'},identities:[{provider:'custom:line-web',user_id:uid,id:uid,identity_data:{sub:uid}}]};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},{signature:'audit'}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const session={access_token:jwt,refresh_token:'audit-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
const accounts=[{user_id:uid,email:user.email,is_active:true,display_name:'測試同工',job_title:'行政同工',is_owner:true,grants:[],roles:[],home_preferences:[],feature_permissions:[],invitation_state:'active'},{user_id:other,email:'second@example.invalid',is_active:true,display_name:'測試負責人',job_title:'服事同工',grants:[{church_id:'M+',permission:'schedules'}],roles:[{church_id:'M+',role_key:'custom'}],home_preferences:[],feature_permissions:[],invitation_state:'active'}];
let mode='owner',writes=[],intercepted=[],handoffCipher=null;
fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync'],userDataDir:out+'/chrome'});
const context=await browser.createBrowserContext();
async function setup(page,{signedIn=true}={}){
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await page.evaluateOnNewDocument((session,signedIn)=>{navigator.serviceWorker?.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));if(signedIn)localStorage.setItem('church-staging-admin-v1',JSON.stringify(session));else localStorage.removeItem('church-staging-admin-v1');},session,signedIn);
 await page.setBypassServiceWorker(true);await page.setRequestInterception(true);
 page.on('request',async req=>{
  const url=new URL(req.url());if(url.hostname.endsWith('supabase.co')){
   intercepted.push(url.pathname);let body={};try{body=JSON.parse(req.postData()||'{}')}catch{}
   let data=[],status=200;
   if(url.pathname==='/auth/v1/user')data=user;
   else if(url.pathname==='/auth/v1/token')data=session;
   else if(url.pathname.startsWith('/auth/'))data={};
   else if(url.pathname.includes('/rpc/')){
    const name=url.pathname.split('/').pop();
    if(name==='get_my_church_access')data=(mode==='leader'?['schedules']:permissions).map(permission=>({church_id:'M+',permission}));
    else if(name==='get_my_admin_profile')data=[{display_name:'測試同工',job_title:'行政同工'}];
    else if(name==='get_my_feature_permissions')data=permissions.map(feature_key=>({church_id:'M+',feature_key,view:true,create:true,edit:true,delete:true,export:true,approve:true,manage:true}));
    else if(name==='get_my_home_preferences')data={role_key:'custom',home_modules:mode==='leader'?['schedules']:['members','tree_reading_admin','school_students']};
    else if(name==='get_my_system_monitor_access')data=mode==='owner';
    else if(name==='get_my_app_capabilities')data={is_owner:mode==='owner'};
    else if(name==='list_admin_accounts_v3'||name==='list_admin_accounts_v4')data=accounts;
    else if(name==='get_review_workflow_settings')data={can_manage:mode==='owner',people:[{id:uid,name:'測試同工',email:user.email,has_line:true},{id:other,name:'測試負責人',email:'second@example.invalid',has_line:true}],workflows:[{key:'devotional',label:'每日靈修',initial_reviewer_id:uid,final_reviewer_id:other,notify_app:true,notify_line:true}]};
    else if(name==='get_service_signup_scopes')data=[];
    else if(name==='list_my_app_notifications')data=[{id:'1',title:'測試通知',body:'測試通知內容\n'.repeat(40),read_at:null,created_at:new Date().toISOString(),target_url:'members.html'}];
    else if(name.startsWith('set_')||name.startsWith('save_')||name.startsWith('remove_')||name.startsWith('mark_')){writes.push({name,body});data=['save_admin_account_bundle','save_review_workflow_setting'].includes(name)?{saved:true,version:'fixture-version'}:true;}
   }else if(url.pathname.endsWith('/church_customizations'))data={church_id:'M+',feature_modules:[],welcome_fields:[],catalogs:{},version:1,updated_at:new Date().toISOString()};
   else if(url.pathname.endsWith('/church_public_settings'))data={church_id:'M+',brand_color:'#AD3C2A',logo_url:'',service_info:'每週主日聚會',address:'測試地址',map_url:'',updated_at:new Date().toISOString()};
   else if(url.pathname.includes('/functions/'))data={ok:true,items:[],drafts:[],people:[],settings:{},connections:{},ministries:[]};
   await req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,HEAD,OPTIONS','access-control-allow-headers':'*','content-range':'0-0/1'},body:JSON.stringify(data)});return;
  }
  if(url.origin!==base&&url.protocol!=='data:'){await req.abort();return;}
  await req.continue();
 });
}
const page=await context.newPage();await setup(page);const errors=[];page.on('pageerror',e=>{errors.push({url:page.url(),error:e.message});console.log('PAGE_ERROR',e.message);});
await page.goto(base+'/admin-dashboard.html?church=M%2B',{waitUntil:'networkidle0'});
console.log('DASHBOARD_LOADED',await page.$eval('#status',n=>n.textContent),intercepted);await page.waitForSelector('#modules .dashboard-card',{timeout:10000}).catch(async e=>{console.log('STATUS',await page.$eval('#status',n=>n.textContent));console.log('REQUESTS',intercepted);await page.screenshot({path:out+'/failure.png',fullPage:true});throw e;});
let inventory=await page.evaluate(()=>({favorites:[...document.querySelectorAll('#quick-links [data-home-module]')].map(n=>n.dataset.homeModule),folder:[...document.querySelectorAll('#modules [data-folder-key]')].map(n=>n.dataset.folderKey)}));
assert(inventory.folder.includes('review_workflows'));assert(inventory.folder.includes('spaces'));assert(inventory.folder.includes('private_prayers')||inventory.folder.includes('prayers'));assert(!await page.$eval('#modules [data-folder-key="members"]',n=>!n.hidden));
await page.click('#edit-quick-links');await page.click('[data-home-module="school_students"] .quick-link-remove');await new Promise(r=>setTimeout(r,250));
assert(await page.$eval('#modules [data-folder-key="school_students"]',n=>!n.hidden));await page.click('#finish-quick-links');await page.$eval('#all-functions',n=>n.open=true);
await page.click('#modules [data-folder-key="school_students"] [data-add-quick]');await new Promise(r=>setTimeout(r,250));assert(await page.$('#quick-links [data-home-module="school_students"]'));
await page.type('#function-search','審核');assert.equal(await page.$eval('#all-functions',n=>n.open),true);assert((await page.$eval('#function-search-state',n=>n.textContent)).includes('找到'));assert(await page.$eval('#modules [data-folder-key="review_workflows"]',n=>!n.hidden));await page.$eval('#function-search',n=>{n.value='';n.dispatchEvent(new Event('input'));});
await page.$eval('#notification-history',n=>n.scrollIntoView({block:'center'}));await new Promise(r=>setTimeout(r,350));await page.click('#notification-history');await page.waitForSelector('.notification-history-dialog[open]');await page.click('.notification-history-item');await page.waitForSelector('.notification-detail-dialog[open]');const beforeScroll=await page.evaluate(()=>window.scrollY);await page.hover('.notification-detail-content');await page.mouse.wheel({deltaY:350});assert(await page.$('.notification-detail-dialog[open]'));assert.equal(await page.evaluate(()=>window.scrollY),beforeScroll);await page.click('.notification-detail-dialog .notification-detail-close');assert.equal(await page.$('.notification-detail-dialog[open]'),null);console.log('Notification dialog scroll passed');
await new Promise(r=>setTimeout(r,1300));assert(await page.$('#quick-links [data-home-module=school_students] [data-ios-symbol=student] svg'));await page.screenshot({path:out+'/dashboard-390.png',fullPage:true});
await page.goto(base+'/church-settings.html?church=M%2B',{waitUntil:'networkidle0'});assert(await page.$eval('#review-workflows',n=>!n.hidden));assert((await page.$eval('#review-workflows',n=>n.href)).includes('church=M%2B'));
await page.screenshot({path:out+'/settings-390.png',fullPage:true});
await page.goto(base+'/review-workflow-settings.html?church=M%2B',{waitUntil:'networkidle0'});await page.waitForSelector('.workflow-card');
await page.click('.workflow-card>button');await new Promise(r=>setTimeout(r,100));assert(writes.some(w=>w.name==='save_review_workflow_setting'));
await page.screenshot({path:out+'/review-390.png',fullPage:true});
await page.goto(base+'/admin-accounts.html?church=M%2B',{waitUntil:'networkidle0'});await page.waitForSelector('.admin-account-card button');await page.click('.admin-account-card button');await page.waitForSelector('.home-library-item');
assert.equal(await page.$eval('.home-library-item small',n=>getComputedStyle(n).color),'rgb(48, 40, 35)');assert.equal(await page.$eval('.home-library-item',n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');assert(await page.$('.home-library-item [data-ios-symbol]'));
await page.$eval('.home-library-item',n=>n.click());assert((await page.$$('.home-icon-tile')).length>0);
await page.screenshot({path:out+'/account-editor-390.png',fullPage:true});
await page.$eval('#editor form',form=>form.requestSubmit());await new Promise(r=>setTimeout(r,1200));assert(writes.some(w=>w.name==='save_admin_account_bundle'));
// Restricted service leader: exactly their service entries, no owner settings.
mode='leader';await page.goto(base+'/admin-dashboard.html?church=M%2B',{waitUntil:'networkidle0'});await page.waitForSelector('#modules .dashboard-card');
const restricted=await page.evaluate(()=>[...document.querySelectorAll('#modules [data-folder-key]')].map(n=>n.dataset.folderKey));assert.deepEqual(new Set(restricted),new Set(['schedules','service_signups']));
mode='owner';
const htmlFiles=fs.readdirSync(root).filter(f=>f.endsWith('.html')&&fs.readFileSync(path.join(root,f),'utf8').includes('class="member-page'));
const geometry=[];
for(const f of htmlFiles){await page.goto(base+'/'+f+'?church=M%2B',{waitUntil:'domcontentloaded'});await new Promise(r=>setTimeout(r,250));if(!page.url().includes(f))continue;const metrics=await page.evaluate(()=>{const h=document.querySelector('.member-page>.page-header');if(!h)return null;return {header:h.getBoundingClientRect().height,background:getComputedStyle(h).backgroundImage,overflow:document.documentElement.scrollWidth>innerWidth+2,title:document.querySelector('h1')?.textContent};});if(metrics)geometry.push({file:f,...metrics});}
// Repeat header/overflow checks at desktop width; preserve mobile fixtures.
await page.setViewport({width:1280,height:900,deviceScaleFactor:1});const desktop=[];
for(const f of htmlFiles){await page.goto(base+'/'+f+'?church=M%2B',{waitUntil:'domcontentloaded'});await new Promise(r=>setTimeout(r,300));const metrics=await page.evaluate(()=>{const h=document.querySelector('.member-page>.page-header');return h?{header:h.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+2}:null;});if(metrics)desktop.push({file:f,...metrics});}
for(const width of [375,430]){await page.setViewport({width,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await page.goto(base+'/admin-dashboard.html?church=M%2B',{waitUntil:'networkidle0'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);}
await page.setViewport({width:1280,height:900});await page.goto(base+'/admin-dashboard.html?church=M%2B',{waitUntil:'networkidle0'});await page.screenshot({path:out+'/dashboard-1280.png',fullPage:true});
fs.writeFileSync(out+'/geometry-diagnostics.json',JSON.stringify({geometry,desktop,errors},null,2));console.log('GEOMETRY_DIAGNOSTICS',JSON.stringify({mobile:geometry.filter(g=>g.header!==164||g.overflow),desktop:desktop.filter(g=>g.header!==164||g.overflow)}));
assert.equal(geometry.length,htmlFiles.length,'every mobile page must load');assert.equal(desktop.length,htmlFiles.length,'every desktop page must load');
assert(geometry.every(g=>g.header===164&&!g.overflow),'mobile geometry');assert(desktop.every(g=>g.header===164&&!g.overflow),'desktop geometry');assert.deepEqual(errors,[],'uncaught JavaScript errors');
const summary={status:'passed',catalogUI:inventory,restricted,geometry,desktop,pageErrors:errors,writes:writes.map(w=>w.name),htmlFiles:htmlFiles.length,intercepted:[...new Set(intercepted)]};fs.writeFileSync(out+'/browser-audit.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({headers:geometry.length,nonuniform:geometry.filter(g=>g.header!==164),overflows:geometry.filter(g=>g.overflow),desktopNonuniform:desktop.filter(g=>g.header!==164),desktopOverflows:desktop.filter(g=>g.overflow),errors:errors.length,mockedWrites:summary.writes}));
await browser.close();
