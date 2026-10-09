import puppeteer from 'puppeteer-core';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const out=new URL('./results/',import.meta.url).pathname,base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769';
const permissions=['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp'];
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const user={id:uid,email:'audit@example.invalid',app_metadata:{provider:'custom:line-web',providers:['email','custom:line-web']},user_metadata:{name:'測試同工'},identities:[{provider:'custom:line-web',user_id:uid,id:uid,identity_data:{sub:uid}}]};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},{signature:'audit'}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const session={access_token:jwt,refresh_token:'audit-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
const accounts=[{user_id:uid,email:user.email,is_active:true,display_name:'測試同工',job_title:'行政同工',is_owner:true,grants:[],roles:[],home_preferences:[],feature_permissions:[],invitation_state:'active'},{user_id:other,email:'second@example.invalid',is_active:true,display_name:'測試負責人',job_title:'服事同工',grants:[{church_id:'M+',permission:'schedules'}],roles:[{church_id:'M+',role_key:'custom'}],home_preferences:[],feature_permissions:[],invitation_state:'active'}];
let mode='owner',writes=[],intercepted=[],handoffCipher=null;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync'],userDataDir:out+'/auth-chrome'});
fs.mkdirSync(out,{recursive:true});
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
    else if(name==='list_admin_accounts_v3')data=accounts;
    else if(name==='get_review_workflow_settings')data={can_manage:mode==='owner',people:[{id:uid,name:'測試同工',email:user.email,has_line:true},{id:other,name:'測試負責人',email:'second@example.invalid',has_line:true}],workflows:[{key:'devotional',label:'每日靈修',initial_reviewer_id:uid,final_reviewer_id:other,notify_app:true,notify_line:true}]};
    else if(name==='get_service_signup_scopes')data=[];
    else if(name==='list_app_notifications')data=[{id:'1',title:'測試通知',body:'測試通知內容\n'.repeat(40),read_at:null,created_at:new Date().toISOString(),target_url:'members.html'}];
    else if(name.startsWith('set_')||name.startsWith('save_')||name.startsWith('remove_')||name.startsWith('mark_')){writes.push({name,body});data=name==='save_review_workflow_setting'?{saved:true}:true;}
   }else if(url.pathname.endsWith('/church_customizations'))data={church_id:'M+',feature_modules:[],welcome_fields:[],catalogs:{},version:1,updated_at:new Date().toISOString()};
   else if(url.pathname.endsWith('/church_public_settings'))data={church_id:'M+',brand_color:'#AD3C2A',logo_url:'',service_info:'每週主日聚會',address:'測試地址',map_url:'',updated_at:new Date().toISOString()};
   else if(url.pathname.includes('/functions/'))data={ok:true,items:[],drafts:[],people:[],settings:{},connections:{},ministries:[]};
   await req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,HEAD,OPTIONS','access-control-allow-headers':'*','content-range':'0-0/1'},body:JSON.stringify(data)});return;
  }
  if(url.origin!==base&&url.protocol!=='data:'){await req.abort();return;}
  await req.continue();
 });
}
const page=await context.newPage();await setup(page,{signedIn:false});
await page.goto(base+'/admin-line-launch.html?source=app-v2');
page.removeAllListeners('request');
let cipher=null,relayReady=false,reads=0,finishes=0;
page.on('request',async req=>{
 const url=new URL(req.url());if(url.pathname.endsWith('/app-auth-handoff')){const body=JSON.parse(req.postData()||'{}');if(body.action==='finish')finishes++;else reads++;await req.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'*'},body:JSON.stringify(body.action==='finish'?{finished:true}:cipher&&relayReady?{ready:true,cipher}:{ready:false})});}else if(url.origin===base)await req.continue();else await req.abort();
});
async function wire(){await page.evaluate(async(uid)=>{
 const auth=await import('./app-line-auth.mjs?v=20261009-stage1');window.auditAuth=auth;window.auditSaved=0;window.auditResumed=0;
 const button=document.createElement('button'),status=document.createElement('p');button.id='audit-login';status.id='audit-status';document.body.append(button,status);button.textContent='LINE 登入';
 const db={auth:{getUser:async()=>{if(window.auditDelayVerification){window.auditVerifying=true;await new Promise(resolve=>setTimeout(resolve,300));}return {data:{user:{id:uid,identities:[{provider:'custom:line-web'}]}}};},setSession:async()=>{window.auditSaved++;return{};},signInWithOAuth:async()=>({data:{url:location.origin+'/admin-line-launch.html?oauth=fixture'}})}};
 auth.wireLineAuth(db,button,status,{next:'admin-dashboard.html',onResume:()=>window.auditResumed++});
},uid);}
await wire();await page.click('#audit-login');await new Promise(r=>setTimeout(r,200));
const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('church-os-line-handoff-v1')));assert(pending?.secret);assert.equal(await page.evaluate(()=>document.querySelector('#audit-login').disabled),true);
// Separate browser context has no App storage/opener, like LINE returning to Safari.
const externalContext=await browser.createBrowserContext(),external=await externalContext.newPage();await external.goto(base+'/admin-line-launch.html');
cipher=await external.evaluate(async(secret)=>{const {encryptHandoff}=await import('./app-line-auth.mjs?v=20261009-stage1');return encryptHandoff(secret,{access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token'});},pending.secret);
assert(!cipher.data.includes('synthetic-access-token'));
const roundTrip=await external.evaluate(async({secret,cipher})=>{const {decryptHandoff}=await import('./app-line-auth.mjs?v=20261009-stage1');return decryptHandoff(secret,cipher);},{secret:pending.secret,cipher});assert.equal(roundTrip.access_token,'synthetic-access-token');
let tamperRejected=await external.evaluate(async({cipher})=>{const {decryptHandoff}=await import('./app-line-auth.mjs?v=20261009-stage1');try{await decryptHandoff('b'.repeat(64),cipher);return false;}catch{return true;}},{cipher});assert(tamperRejected);
// Reopen the original App page: the pending handoff survives reload.
await page.bringToFront();await page.reload();await wire();relayReady=true;await page.waitForFunction(()=>window.auditResumed===1,{timeout:8000}).catch(async e=>{console.log('AUTH_STATUS',await page.$eval('#audit-status',n=>n.textContent),'VISIBILITY',await page.evaluate(()=>document.visibilityState),'READS',reads);throw e;});assert.equal(await page.evaluate(()=>window.auditSaved),1);assert.equal(await page.evaluate(()=>localStorage.getItem('church-os-line-handoff-v1')),null);
// Account mismatch must be rejected BEFORE persisting any session.
await page.evaluate(pending=>{localStorage.setItem('church-os-line-handoff-v1',JSON.stringify({...pending,expected_user:'00000000-0000-4000-8000-000000000002'}));document.querySelector('#audit-login').remove();document.querySelector('#audit-status').remove();},pending);
await wire();await page.waitForFunction(()=>document.querySelector('#audit-status').textContent.includes('不符'));assert.equal(await page.evaluate(()=>window.auditSaved),0);assert.equal(await page.evaluate(()=>document.querySelector('#audit-login').disabled),false);
// Cancel during delayed identity verification in a fresh page lifecycle.
await page.reload();
await page.evaluate(pending=>{localStorage.setItem('church-os-line-handoff-v1',JSON.stringify({...pending,expected_user:null,expires:Date.now()+300000}));window.auditDelayVerification=true;},pending);
await wire();await page.waitForFunction(()=>window.auditVerifying===true);await page.$eval('.line-auth-cancel:not([hidden])',n=>n.click());await new Promise(r=>setTimeout(r,500));assert.equal(await page.evaluate(()=>window.auditSaved),0);assert.equal(await page.evaluate(()=>localStorage.getItem('church-os-line-handoff-v1')),null);assert.equal(await page.evaluate(()=>document.querySelector('#audit-login').disabled),false);
// Popup blocked: preserve the App, give a usable retry message.
await page.evaluate(()=>{window.auditDelayVerification=false;window.open=()=>null;document.querySelector('#audit-login').click();});assert((await page.$eval('#audit-status',n=>n.textContent)).includes('允許'));assert(page.url().includes('admin-line-launch.html'));
// Expired state is removed; no blank/loading screen is retained.
await page.evaluate(pending=>{localStorage.setItem('church-os-line-handoff-v1',JSON.stringify({...pending,expires:Date.now()-1}));},pending);assert.equal(await page.evaluate(()=>window.auditAuth.pendingHandoff()),null);
const result={status:'passed',checks:11,cancelledLoginNotPersisted:true,crossContext:true,reopen:true,wrongAccountRejected:true,popupBlockedPreservesApp:true,tamperRejected,reads,finishes};fs.writeFileSync(out+'/auth-browser-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
