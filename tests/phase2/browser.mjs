import puppeteer from 'puppeteer-core';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url).pathname,out=new URL('./results/browser/',import.meta.url).pathname,base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769';
const permissions=['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp'];
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const user={id:uid,email:'audit@example.invalid',app_metadata:{provider:'custom:line-web',providers:['email','custom:line-web']},user_metadata:{name:'測試同工'},identities:[{provider:'custom:line-web',user_id:uid,id:uid,identity_data:{sub:uid}}]};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},{signature:'audit'}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const session={access_token:jwt,refresh_token:'audit-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
const accounts=[{user_id:uid,email:user.email,is_active:true,display_name:'測試同工',job_title:'行政同工',is_owner:true,grants:[],roles:[],home_preferences:[],feature_permissions:[],invitation_state:'active'},{user_id:other,email:'second@example.invalid',is_active:true,display_name:'測試負責人',job_title:'服事同工',grants:[{church_id:'M+',permission:'schedules'}],roles:[{church_id:'M+',role_key:'custom'}],home_preferences:[],feature_permissions:[],invitation_state:'active'}];
let mode='owner',fixtureChurch='M+',failCapabilities=false,failSave=false,writes=[],intercepted=[];
const assigned=['members','tree_reading_admin','school_students'];let publicSettings={brand_color:'#AD3C2A',logo_url:'',service_info:'每週主日聚會',address:'測試地址',map_url:'',updated_at:new Date().toISOString()};
const rolePermissions=()=>mode==='leader'?['schedules']:mode==='notification'?['members','notification_settings']:mode==='facilities'?['spaces','inventory']:permissions;
fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync'],userDataDir:out+'/chrome'});
const context=await browser.createBrowserContext();
async function setup(page,{signedIn=true}={}){
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await page.evaluateOnNewDocument((session,signedIn)=>{navigator.serviceWorker?.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});if(signedIn)localStorage.setItem('church-staging-admin-v1',JSON.stringify(session));else localStorage.removeItem('church-staging-admin-v1');},session,signedIn);
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
    if(name==='get_my_church_access')data=rolePermissions().map(permission=>({church_id:fixtureChurch,permission}));
    else if(name==='get_my_admin_profile')data=[{display_name:'測試同工',job_title:'行政同工'}];
    else if(name==='get_my_feature_permissions')data=rolePermissions().map(feature_key=>({church_id:fixtureChurch,feature_key,view:true,create:mode!=='readonly',edit:mode!=='readonly',delete:mode!=='readonly',export:true,approve:mode!=='readonly',manage:mode!=='readonly'}));
    else if(name==='get_my_home_preferences')data={role_key:'custom',home_modules:mode==='leader'?['schedules']:assigned};
    else if(name==='get_my_system_monitor_access')data=mode==='owner';
    else if(name==='get_my_app_capabilities'){data=failCapabilities?{message:'fixture denied'}:{is_owner:mode==='owner'};if(failCapabilities)status=503;}
    else if(name==='list_admin_accounts_v3'||name==='list_admin_accounts_v4')data=accounts;
    else if(name==='get_review_workflow_settings')data={can_manage:mode==='owner',people:[{id:uid,name:'測試同工',email:user.email,has_line:true},{id:other,name:'測試負責人',email:'second@example.invalid',has_line:true}],workflows:[{key:'devotional',label:'每日靈修',initial_reviewer_id:uid,final_reviewer_id:other,notify_app:true,notify_line:true}]};
    else if(name==='get_service_signup_scopes')data=[];
    else if(name==='list_my_app_notifications')data=[{id:'1',title:'測試通知',body:'測試通知內容\n'.repeat(40),read_at:null,created_at:new Date().toISOString(),target_url:'members.html'}];
    else if(name.startsWith('set_')||name.startsWith('save_')||name.startsWith('remove_')||name.startsWith('mark_')){writes.push({name,body});data=['save_admin_account_bundle','save_review_workflow_setting'].includes(name)?{saved:true,version:'fixture-version'}:true;}
   }else if(url.pathname.endsWith('/church_customizations'))data={church_id:fixtureChurch,feature_modules:[],welcome_fields:[],catalogs:{},version:1,updated_at:new Date().toISOString()};
   else if(url.pathname.endsWith('/church_public_settings')){if(req.method()==='PATCH'){writes.push({name:'church_public_settings',body});if(failSave){status=503;data={message:'fixture unavailable'};}else{publicSettings={...publicSettings,...body};data=[{church_id:fixtureChurch}];}}else data={church_id:fixtureChurch,...publicSettings};}
   else if(url.pathname.includes('/functions/'))data={ok:true,items:[],drafts:[],people:[],settings:{},connections:{},ministries:[]};
   await req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,HEAD,OPTIONS','access-control-allow-headers':'*','content-range':'0-0/1'},body:JSON.stringify(data)});return;
  }
  if(url.origin!==base&&url.protocol!=='data:'){await req.abort();return;}
  await req.continue();
 });
}
const checks=[],errors=[],page=await context.newPage();await setup(page);page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function test(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS',name);}
async function visit(file){await page.goto(base+'/'+file+'?church='+encodeURIComponent(fixtureChurch),{waitUntil:'networkidle0'});}
const groups=()=>page.evaluate(()=>[...document.querySelectorAll('.settings-group')].map(n=>n.dataset.settingsGroup));
const keys=()=>page.evaluate(()=>[...document.querySelectorAll('.settings-link-card')].map(n=>n.dataset.functionKey));
async function search(query){await page.$eval('#settings-search',(n,q)=>{n.value=q;n.dispatchEvent(new Event('input'));},query);}
const quickKeys=()=>page.evaluate(()=>[...document.querySelectorAll('#quick-links [data-home-module]')].map(n=>n.dataset.homeModule));
try{
 await visit('church-settings.html');
 await test('owner sees all four settings groups',async()=>assert.deepEqual(await groups(),['people','review','content','church']));
 await test('review and notification settings have explicit entries',async()=>{const k=await keys();assert(k.includes('review_workflows'));assert(k.includes('notification_settings'));});
 await test('settings links retain the selected church',async()=>assert(await page.evaluate(()=>[...document.querySelectorAll('.settings-link-card')].every(n=>new URL(n.href).searchParams.get('church')==='M+'))));
 await test('review search finds initial and final review settings',async()=>{await search('初審');assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.settings-link-card')].filter(n=>!n.hidden).map(n=>n.dataset.functionKey)),['review_workflows']);});
 await test('IG search finds publishing settings',async()=>{await search('IG');assert(await page.$eval('[data-function-key=media_publishing]',n=>!n.hidden));});
 await test('public address search remains visible and counts correctly',async()=>{await search('地址');assert(await page.$eval('#church-public-info',n=>!n.hidden));assert.match(await page.$eval('#settings-search-state',n=>n.textContent),/找到 1 項/);});
 await test('empty search state recovers by clearing input',async()=>{await search('不存在測試');assert(await page.$eval('#settings-search-state',n=>n.textContent.includes('找不到')));await search('');assert(await page.$eval('#settings-search-state',n=>n.hidden));assert.equal((await groups()).length,4);});
 await test('failed save preserves input and unlocks retry',async()=>{failSave=true;await page.$eval('#address',n=>n.value='保留尚未儲存的地址');await page.$eval('#form',n=>n.requestSubmit());await page.waitForFunction(()=>document.querySelector('#status').dataset.tone==='error');assert.equal(await page.$eval('#address',n=>n.value),'保留尚未儲存的地址');assert.equal(await page.$eval('#save',n=>n.disabled),false);});
 await test('retry reports actual save and reload success',async()=>{failSave=false;await page.$eval('#form',n=>n.requestSubmit());await page.waitForFunction(()=>document.querySelector('#status').dataset.tone==='success');assert.equal(await page.$eval('#address',n=>n.value),'保留尚未儲存的地址');});
 await test('owner settings have consistent 44px minimum control targets',async()=>assert(await page.evaluate(()=>[...document.querySelectorAll('.settings-directory a,.church-switcher a,#save,#reload')].every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;}))));
 await page.screenshot({path:out+'/settings-390.png',fullPage:true});
 for(const width of [375,430,1280,1440,1920]){
  await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});
  await test('settings geometry and header at '+width+'px',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.equal(await page.$eval('.page-header',n=>n.getBoundingClientRect().height),164);});
  if(width===1440)await page.screenshot({path:out+'/settings-1440.png',fullPage:true});
 }
 await test('desktop settings use sidebar and a two-column tool area',async()=>assert(await page.evaluate(()=>getComputedStyle(document.querySelector('.settings-layout')).gridTemplateColumns.split(' ').length===2&&getComputedStyle(document.querySelector('.settings-link-grid')).gridTemplateColumns.split(' ').length===2)));
 mode='notification';await visit('church-settings.html');
 await test('notification coworker sees only their review group',async()=>{assert.deepEqual(await groups(),['review']);assert.deepEqual(await keys(),['review_workflows','notification_settings']);});
 mode='facilities';await visit('church-settings.html');
 await test('facilities coworker sees only assigned facility settings',async()=>{assert.deepEqual(await groups(),['church']);assert.deepEqual(await keys(),['spaces','inventory']);assert.equal(await page.$('#church-public-info'),null);});
 mode='leader';await visit('church-settings.html');
 await test('service leader cannot see general settings tools',async()=>{assert.deepEqual(await keys(),[]);assert.match(await page.$eval('#hub-status',n=>n.textContent),/沒有可使用/);});
 mode='readonly';await visit('church-settings.html');
 await test('read-only access keeps public fields and save disabled',async()=>{assert(await page.$eval('#address',n=>n.disabled));assert(await page.$eval('#save',n=>n.disabled));const k=await keys();assert(!k.includes('admin_accounts'));assert(!k.includes('media_publishing'));});
 mode='owner';fixtureChurch='SHiNE';await visit('church-settings.html');
 await test('SHiNE tools exclude M+ subtitle library and preserve scope',async()=>{assert(!(await keys()).includes('subtitle_library'));assert(await page.evaluate(()=>[...document.querySelectorAll('.settings-link-card')].every(n=>new URL(n.href).searchParams.get('church')==='SHiNE')));});
 fixtureChurch='M+';failCapabilities=true;await visit('church-settings.html');
 await test('unavailable capabilities show a recoverable load error',async()=>{assert.match(await page.$eval('#hub-status',n=>n.textContent),/無法確認/);assert(await page.$('#hub-status button'));});
 await test('initialization retry safely rebuilds settings and form',async()=>{failCapabilities=false;await page.click('#hub-status button');await page.waitForSelector('.settings-link-card');await page.waitForFunction(()=>!document.querySelector('#address').disabled);assert.equal((await groups()).length,4);assert.equal(await page.$$eval('#church-public-info',ns=>ns.length),1);});
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await visit('admin-dashboard.html');
 await test('home starts with three assigned favorites',async()=>assert.deepEqual(await quickKeys(),assigned));
 await test('remove badges are hidden outside editing',async()=>assert(await page.$$eval('#quick-links .quick-link-remove',ns=>ns.every(n=>getComputedStyle(n).display==='none'))));
 await test('function links contain no nested interactive controls',async()=>assert.equal(await page.$$eval('#quick-links a button,#modules a button,#modules a [role=button]',ns=>ns.length),0));
 await test('mobile favorites preserve three columns and 62px icons',async()=>assert(await page.evaluate(()=>getComputedStyle(document.querySelector('#quick-links')).gridTemplateColumns.split(' ').length===3&&document.querySelector('#quick-links .function-icon').getBoundingClientRect().width===62)));
 await test('moving a long press cancels edit mode',async()=>{await page.$eval('[data-home-module=members]',n=>{n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:100,clientY:100,pointerId:5}));n.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'touch',clientX:100,clientY:125,pointerId:5}));});await pause(620);assert(!await page.$eval('#favorites-section',n=>n.classList.contains('is-editing')));});
 await test('stationary long press enters edit mode',async()=>{await page.$eval('[data-home-module=members]',n=>n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:100,clientY:100,pointerId:6})));await pause(620);assert(await page.$eval('#favorites-section',n=>n.classList.contains('is-editing')));await page.$eval('[data-home-module=members]',n=>n.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:6})));});
 await test('favorite removal returns student entry to folder without navigation',async()=>{const before=page.url();await page.click('[data-home-module=school_students] .quick-link-remove');await pause(250);assert.equal(page.url(),before);assert(!(await quickKeys()).includes('school_students'));assert(await page.$eval('#modules [data-folder-key=school_students]',n=>!n.hidden));});
 await page.click('#finish-quick-links');await page.$eval('#all-functions',n=>n.open=true);
 await test('folder add button has at least 44px hit area',async()=>assert(await page.$eval('#modules [data-folder-key=school_students] button',n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
 const folderAppearance=await page.$eval('#modules [data-folder-key=school_students] .function-icon',n=>({bg:getComputedStyle(n).backgroundImage,symbol:n.dataset.iosSymbol,svg:n.innerHTML}));
 await test('adding from folder restores exactly one favorite without navigating',async()=>{const before=page.url();await page.click('#modules [data-folder-key=school_students] button');await pause(250);assert.equal(page.url(),before);assert.equal((await quickKeys()).filter(k=>k==='school_students').length,1);assert(await page.$eval('#modules [data-folder-key=school_students]',n=>n.hidden));});
 await test('same function has identical SVG and palette in folder and favorites',async()=>assert.deepEqual(await page.$eval('#quick-links [data-home-module=school_students] .function-icon',n=>({bg:getComputedStyle(n).backgroundImage,symbol:n.dataset.iosSymbol,svg:n.innerHTML})),folderAppearance));
 await test('Mac keyboard can reorder a favorite and announce position',async()=>{await page.click('#edit-quick-links');await page.focus('[data-home-module=members] .function-open');await page.keyboard.down('Alt');await page.keyboard.press('ArrowRight');await page.keyboard.up('Alt');assert.equal((await quickKeys())[1],'members');assert.match(await page.$eval('#quick-edit-status',n=>n.textContent),/第 2/);});
 await test('editing does not navigate or show a navigation loader',async()=>{const before=page.url();await page.$eval('[data-home-module=members] .function-open',n=>n.click());assert.equal(page.url(),before);assert(!await page.$eval('.ios-page-transition',n=>n.classList.contains('is-loading')));});
 await test('cancelled touch drag clears dragging feedback',async()=>{await page.$eval('[data-home-module=members]',n=>n.scrollIntoView({block:'center'}));await pause(400);const rect=await page.$eval('[data-home-module=members] .function-icon',n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});const cdp=await page.createCDPSession();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...rect,id:11}]});await page.waitForFunction(()=>document.querySelector('[data-home-module=members]').classList.contains('is-dragging'));await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert(!await page.$eval('[data-home-module=members]',n=>n.classList.contains('is-dragging')));await cdp.detach();});
 await test('Escape finishes sorting and restores edit button focus',async()=>{await page.keyboard.press('Escape');assert(!await page.$eval('#favorites-section',n=>n.classList.contains('is-editing')));assert.equal(await page.evaluate(()=>document.activeElement.id),'edit-quick-links');});
 await test('favorite order persists after reloading the home',async()=>{const before=await quickKeys();await page.reload({waitUntil:'networkidle0'});assert.deepEqual(await quickKeys(),before);});
 await test('all allowed functions appear once in favorites or folder',async()=>{const {availableFunctionKeys,FUNCTION_CATALOG}=await import('../../app-function-catalog.mjs');const a={grants:permissions.map(permission=>({church_id:'M+',permission})),featurePermissions:[]};const allowed=availableFunctionKeys(a,'M+',{is_owner:true,system_monitor_access:true,home_modules:assigned});const shown=await page.evaluate(()=>[...document.querySelectorAll('#quick-links [data-home-module],#modules [data-folder-key]')].filter(n=>!n.hidden).map(n=>n.dataset.functionKey));assert.deepEqual(new Set(shown),new Set(allowed));assert.equal(new Set(shown).size,shown.length);assert(Object.keys(FUNCTION_CATALOG).length===41);});
 await test('every native folder icon uses its canonical palette',async()=>assert(await page.evaluate(()=>[...document.querySelectorAll('#modules .function-icon')].every(n=>{const expected=getComputedStyle(n).getPropertyValue('--app-icon-background').trim();const probe=document.createElement('span');probe.style.background=expected;document.body.append(probe);const actual=getComputedStyle(n).backgroundImage===getComputedStyle(probe).backgroundImage;probe.remove();return actual;}))));
 await test('old names are searchable across favorites and folder',async()=>{await page.$eval('#function-search',n=>{n.value='會友名冊';n.dispatchEvent(new Event('input'));});assert(await page.$eval('#quick-links [data-home-module=members]',n=>!n.hidden));assert.match(await page.$eval('#function-search-state',n=>n.textContent),/找到 1/);await page.$eval('#function-search',n=>{n.value='';n.dispatchEvent(new Event('input'));});});
 await test('removing all favorites preserves an empty saved preference',async()=>{await page.click('#edit-quick-links');for(const k of await quickKeys()){await page.$eval(`[data-home-module="${k}"] .quick-link-remove`,n=>n.click());await pause(200);}assert.deepEqual(await quickKeys(),[]);await page.reload({waitUntil:'networkidle0'});assert.deepEqual(await quickKeys(),[]);assert(await page.$eval('#restore-quick-links',n=>!n.hidden));});
 await test('empty favorites can restore assigned defaults',async()=>{await page.click('#restore-quick-links');assert.deepEqual(await quickKeys(),assigned);});
 await page.screenshot({path:out+'/dashboard-390.png',fullPage:true});
 for(const width of [375,430,1280,1440,1920]){await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});await visit('admin-dashboard.html');await page.waitForSelector('#quick-links [data-home-module]');await test('home geometry at '+width+'px',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false));if(width===1440)await page.screenshot({path:out+'/dashboard-1440.png',fullPage:true});}
 await test('no uncaught page errors in phase two workflows',async()=>assert.deepEqual(errors,[]));
 fs.writeFileSync(out+'/checks.json',JSON.stringify({status:'passed',checks,errors,mockedWrites:writes.map(w=>w.name),environment:{browser:await browser.version(),kind:'Chrome viewport simulation; real iPhone/Safari not covered'}},null,2));console.log('TOTAL',checks.length);
}catch(error){await page.screenshot({path:out+'/failure.png',fullPage:true});console.error('FAILED',error);throw error;}finally{await browser.close();}
