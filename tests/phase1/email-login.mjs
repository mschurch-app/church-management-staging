import puppeteer from 'puppeteer-core';import assert from 'node:assert/strict';import fs from 'node:fs';
import {hasVerifiedLine,readAccess} from '../../admin-access.mjs';
const out=new URL('./results/',import.meta.url);fs.mkdirSync(out,{recursive:true});const checks=[],errors=[];
async function check(name,run){await run();checks.push({name,status:'passed'});console.log('PASS',name);}
const uid='40000000-0000-4000-8000-000000000001',user={id:uid,email:'synthetic@example.invalid',identities:[{provider:'email'}],user_metadata:{has_line:true,providers:['custom:line-web']}};
await check('personal metadata cannot impersonate a verified LINE link',async()=>assert.equal(await hasVerifiedLine({rpc:async()=>({data:{has_line:false}})},user),false));
await check('Email identity accepts a server-verified canonical LINE link',async()=>assert.equal(await hasVerifiedLine({rpc:async()=>({data:{has_line:true}})},user),true));
await check('capability service failure is recoverable and fails closed',async()=>await assert.rejects(()=>hasVerifiedLine({rpc:async()=>({error:{message:'offline'}})},user),/稍後重試/));
await check('verified LINE link does not grant unauthorized church access',async()=>await assert.rejects(()=>readAccess({rpc:async name=>({data:name==='get_my_app_capabilities'?{has_line:true}:[]})},{user,fresh:true,retry:false}),/尚未獲授權/));
const base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769',expires=Math.floor(Date.now()/1000)+3600;
const session={access_token:[{alg:'HS256'},{sub:uid,exp:expires,role:'authenticated'},'fixture'].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.'),refresh_token:'synthetic-refresh',expires_at:expires,user};
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--disable-background-networking'],userDataDir:new URL('email-chrome/',out).pathname});
async function scenario({linked=true,grants=[{church_id:'M+',permission:'schedules'}],resume=false,offline=false,linkPage=false}={}){
 const context=await browser.createBrowserContext(),page=await context.newPage();await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.setBypassServiceWorker(true);
 await page.evaluateOnNewDocument((session,resume)=>{if(resume)localStorage.setItem('church-staging-admin-v1',JSON.stringify(session));},session,resume);
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',async req=>{
  const url=new URL(req.url()),respond=(body,status=200)=>req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*'},body:JSON.stringify(body)});
  if(req.method()==='OPTIONS')return await respond({});
  if(url.hostname.endsWith('supabase.co')){
   if(url.pathname==='/auth/v1/user')return await respond(user);
   if(url.pathname==='/auth/v1/token')return await respond(session);
   if(url.pathname.endsWith('/get_my_app_capabilities'))return await respond(offline?{message:'offline'}:{has_line:linked,is_owner:false,canonical_user_id:uid},offline?503:200);
   if(url.pathname.endsWith('/get_my_church_access'))return await respond(grants);
   if(url.pathname.endsWith('/get_my_admin_profile'))return await respond([{display_name:'合成同工',job_title:'測試'}]);
   if(url.pathname.endsWith('/get_my_feature_permissions'))return await respond([{church_id:'M+',feature_key:'schedules',view:true}]);
   return await respond([]);
  }
  if(url.origin!==base&&url.protocol!=='data:')return await req.abort();
  if(url.origin===base&&(url.pathname.endsWith('/admin-dashboard.html')||(!linkPage&&url.pathname.endsWith('/admin-line-link.html'))))return await req.respond({status:200,contentType:'text/html',body:'<!doctype html><p>隔離導覽目標</p>'});
  await req.continue();
 });
 await page.goto(base+(linkPage?'/admin-line-link.html':'/admin-login-v2.html'),{waitUntil:'networkidle0'});
 if(!resume&&!linkPage){await page.type('#email',user.email);await page.type('#password','synthetic-password');await page.click('#submit');}return {page,context};
}
try{
 await check('Email password login with approved LINE alias reaches dashboard',async()=>{const {page,context}=await scenario();await page.waitForFunction(()=>location.pathname.endsWith('/admin-dashboard.html'));await context.close();});
 await check('Email login without approved LINE alias opens binding page',async()=>{const {page,context}=await scenario({linked:false});await page.waitForFunction(()=>location.pathname.endsWith('/admin-line-link.html'));await context.close();});
 await check('reopened Email session with approved alias resumes dashboard',async()=>{const {page,context}=await scenario({resume:true});await page.waitForFunction(()=>location.pathname.endsWith('/admin-dashboard.html'));await context.close();});
 await check('Email login without grants stays recoverable and unlocks button',async()=>{const {page,context}=await scenario({grants:[]});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('D05'));assert.equal(await page.$eval('#submit',n=>n.disabled),false);await context.close();});
 await check('Email login capability outage keeps page usable',async()=>{const {page,context}=await scenario({offline:true});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('稍後重試'));assert.equal(await page.$eval('#submit',n=>n.disabled),false);await context.close();});
 await check('binding page recognizes an existing approved canonical alias',async()=>{const {page,context}=await scenario({linkPage:true,resume:true});await page.waitForFunction(()=>location.pathname.endsWith('/admin-dashboard.html'));await context.close();});
 await check('binding page capability outage offers explicit retry',async()=>{const {page,context}=await scenario({linkPage:true,resume:true,offline:true});assert.equal(await page.$eval('#status button',n=>n.textContent),'重新確認');assert.equal(await page.$eval('#link-line',n=>n.disabled),true);await context.close();});
 await check('Email and binding scenarios have no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
}finally{fs.writeFileSync(new URL('email-login-results.json',out),JSON.stringify({syntheticCredentials:true,checks,errors},null,2));await browser.close();}
