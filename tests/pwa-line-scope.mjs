import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-10-22-pwa-line');
const identity='00000000-0000-4000-8000-000000000001',otherIdentity='00000000-0000-4000-8000-000000000002';
const authKey='church-staging-admin-v1',pendingKey='church-os-line-handoff-v1';
const checks=[],failures=[];
await mkdir(out,{recursive:true});
const check=(value,name)=>{assert(value,name);checks.push(name);console.log('PASS',name);};

// All credentials and users are synthetic. Every nonlocal request is blocked.
// persistSession:false is intentionally different from persistent client writes.
const factory=`(()=>{
 const key='${authKey}',user={id:'${identity}',identities:[{provider:'custom:line-web'}]};
 const options=()=>JSON.parse(localStorage.getItem('fixture-options')||'{}');
 const event=(type,detail={})=>{const all=JSON.parse(localStorage.getItem('fixture-events')||'[]');all.push({type,...detail});localStorage.setItem('fixture-events',JSON.stringify(all));};
 window.supabase={createClient:(_url,_key,config={})=>{
  const persistent=config.auth?.persistSession!==false;
  let session=persistent&&!options().skipStoredSession?JSON.parse(localStorage.getItem(key)||'null'):null;
  return {auth:{
   getSession:async()=>{event('getSession',{persistent});return {data:{session}};},
   getUser:async token=>{event('getUser',{fresh:token==='synthetic-access'});localStorage.setItem('fixture-verifying','yes');const o=options();if(o.verificationDelay)await new Promise(r=>setTimeout(r,o.verificationDelay));return o.verificationError?{data:{user:null},error:{message:'Synthetic verification failed'}}:{data:{user:{id:o.wrongUser?'${otherIdentity}':user.id,identities:o.missingLine?[]:user.identities}},error:null};},
   setSession:async s=>{event('setSession',{persistent});session={...s,user};if(persistent)localStorage.setItem(key,JSON.stringify(session));return {data:{session,user},error:null};},
   signInWithOAuth:async p=>{event('oauth');localStorage.setItem('fixture-oauth-options',JSON.stringify(p));const o=options();if(o.oauthDelay)await new Promise(r=>setTimeout(r,o.oauthDelay));if(o.oauthError)return {data:{url:null},error:{message:'Synthetic OAuth unavailable'}};return {data:{url:location.origin+(o.holdProvider?'/fixture-hold':'/fixture-provider')+'?to='+encodeURIComponent(p.options.redirectTo)}};},
   signOut:async()=>{session=null;localStorage.removeItem(key);return {error:null};}
  },rpc:async name=>({data:name==='get_my_coworker_application'?null:name==='get_my_app_capabilities'?{has_line:true}:options().noGrants?[]:[{church_id:'M+',permission:'members'}],error:null}),functions:{invoke:async()=>({data:{ok:true},error:null})}};
 }};
})();`;

const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local'),file=url.pathname;
  if(file==='/fixture-provider'){res.writeHead(302,{location:url.searchParams.get('to')+'#access_token=synthetic-access&refresh_token=synthetic-refresh'}).end();return;}
  if(file==='/fixture-hold'){res.setHeader('content-type','text/html; charset=utf-8');res.end('<main id="fixture-held-provider">Synthetic provider held for deterministic callback testing.</main>');return;}
  if(file==='/admin-dashboard.html'){res.setHeader('content-type','text/html; charset=utf-8');res.end('<main id="destination">教會 OS 合成工作台</main>');return;}
  const target=path.resolve(root,'.'+file);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
  let data=await readFile(target);if(file.startsWith('/vendor/supabase-'))data=factory;
  res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;

async function setup(browser,{standalone=true,options={},staleSession=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'});
 await context.addInitScript(({origin,standalone,options,staleSession,authKey})=>{
  Object.defineProperty(navigator,'standalone',{value:standalone,configurable:true});
  Object.defineProperty(navigator,'serviceWorker',{value:undefined,configurable:true});
  if(location.origin!==origin)return;
  if(!sessionStorage.getItem('fixture-seeded')){
   localStorage.setItem('fixture-options',JSON.stringify(options));localStorage.setItem('fixture-events','[]');
   if(staleSession)localStorage.setItem(authKey,JSON.stringify({access_token:'stale-synthetic-access',refresh_token:'stale-synthetic-refresh',user:{id:'00000000-0000-4000-8000-000000000001',identities:[{provider:'custom:line-web'}]}}));
   sessionStorage.setItem('fixture-seeded','yes');
  }
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(this===localStorage&&key===authKey){const events=JSON.parse(localStorage.getItem('fixture-events')||'[]');events.push({type:'persist'});original.call(localStorage,'fixture-events',JSON.stringify(events));}
   return original.call(this,key,value);
  };
  window.open=()=>{const events=JSON.parse(localStorage.getItem('fixture-events')||'[]');events.push({type:'window.open'});localStorage.setItem('fixture-events',JSON.stringify(events));return null;};
 },{origin,standalone,options,staleSession,authKey});
 const requests=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());requests.push(url.pathname);
  if(url.origin!==origin){await route.abort();return;}
  await route.continue();
 });
 const page=await context.newPage();let popups=0;page.on('popup',()=>popups++);
 return {context,page,requests,popupCount:()=>popups};
}
async function login(app){await app.page.goto(origin+'/admin-login-v2.html'+(await app.page.evaluate(()=>navigator.standalone)?'?source=app-v2':''));await app.page.locator('#line-login').waitFor();}
async function beginHeld(app){await login(app);await app.page.click('#line-login');await app.page.locator('#fixture-held-provider').waitFor();return app.page.evaluate(()=>({pending:JSON.parse(localStorage.getItem('church-os-line-handoff-v1')||'null'),oauth:JSON.parse(localStorage.getItem('fixture-oauth-options')||'null')}));}
function callbackURL(started,{fresh=true}={}){const url=new URL(started.oauth.options.redirectTo);if(fresh)url.hash='access_token=synthetic-access&refresh_token=synthetic-refresh';return url.href;}
async function events(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-events')||'[]'));}
async function rejectsWithoutPersist(page,name){await page.waitForFunction(()=>document.querySelector('.login-panel h1')?.textContent==='請重新登入',{timeout:6000});check(!(await events(page)).some(e=>e.type==='persist'),name);check(!page.url().includes('admin-dashboard')&&await page.locator('main').isVisible(),name+' keeps a visible retry page');}
async function scenario(engine,browser,name,run){try{await run();}catch(error){failures.push({engine,scenario:name,error:error.message});console.error('FAIL',engine,name,error.message);}}

try{
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
  try{
   await scenario(engine,browser,'installed account application',async()=>{
    const app=await setup(browser,{options:{noGrants:true}});try{
     await app.page.goto(origin+'/admin-login-v2.html?source=app-v2&next=coworker-apply.html');
     await app.page.click('#line-login');await app.page.locator('#application-form:not([hidden])').waitFor();
     check(new URL(app.page.url()).pathname==='/coworker-apply.html',engine+': original installed App reaches application after fresh LINE callback');
     check(await app.page.locator('#full-name').isVisible()&&await app.page.locator('#status').textContent().then(s=>s.includes('身分已確認')),engine+': verified applicant without admin grants can fill request');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'same-window success',async()=>{
    const app=await setup(browser);try{
     await login(app);check(await app.page.locator('button#line-login').count()===1,engine+': installed LINE control remains a button');
     check(await app.page.locator('.line-auth-resume').count()===0,engine+': installed login offers no manual continue action');
     await app.page.click('#line-login');await app.page.locator('#destination').waitFor();
     const details=await app.page.evaluate(()=>({oauth:JSON.parse(localStorage.getItem('fixture-oauth-options')),pending:localStorage.getItem('church-os-line-handoff-v1'),events:JSON.parse(localStorage.getItem('fixture-events'))}));
     const callback=new URL(details.oauth.options.redirectTo);
     check(details.oauth.options.queryParams?.disable_auto_login==='true',engine+': iOS request disables native LINE auto login');
     check(details.oauth.options.queryParams?.prompt==='login',engine+': default credential entry explicitly requests LINE authentication');
     check(callback.searchParams.get('return')==='standalone'&&/^[0-9a-f]{64}$/.test(callback.searchParams.get('handoff_state')||'')&&!callback.searchParams.has('handoff_key'),engine+': callback carries one-time hash state rather than raw App secret');
     check(!details.events.some(e=>e.type==='window.open')&&app.popupCount()===0&&!app.requests.includes('/admin-line-launch.html'),engine+': same-page scope round trip creates no popup or launcher');
     const verify=details.events.findIndex(e=>e.type==='getUser'&&e.fresh),persist=details.events.findIndex(e=>e.type==='persist');
     check(verify>=0&&persist>verify,engine+': fresh server identity verification precedes persistent session write');
     check(details.events.filter(e=>e.type==='persist').length===1&&details.pending===null,engine+': original storage receives one session and removes pending flow');
     if(engine==='webkit')await app.page.screenshot({path:path.join(out,'scope-complete-webkit.local.png'),fullPage:true});
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'pending state',async()=>{
    const app=await setup(browser,{options:{holdProvider:true}});try{
     const started=await beginHeld(app),url=new URL(started.oauth.options.redirectTo);
     const hash=await app.page.evaluate(async secret=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))).map(b=>b.toString(16).padStart(2,'0')).join(''),started.pending.secret);
     check(started.pending.mode==='standalone-web'&&started.pending.id===url.searchParams.get('handoff')&&hash===url.searchParams.get('handoff_state'),engine+': local pending capability is bound to the callback hash');
     check(started.pending.expires>Date.now()&&started.pending.expires<=Date.now()+310000,engine+': pending login expires within five minutes');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'separate storage',async()=>{
    const app=await setup(browser,{options:{holdProvider:true}});let foreign;
    try{const started=await beginHeld(app);foreign=await setup(browser,{standalone:false});await foreign.page.goto(callbackURL(started));await rejectsWithoutPersist(foreign.page,engine+': unrelated Safari storage cannot claim installed login');check(!(await events(app.page)).some(e=>e.type==='persist'),engine+': unrelated callback cannot write original App storage');}
    finally{await foreign?.context.close();await app.context.close();}
   });
   await scenario(engine,browser,'no fresh token',async()=>{
    const app=await setup(browser,{options:{holdProvider:true}});try{
     const started=await beginHeld(app);await app.page.evaluate(key=>localStorage.setItem(key,JSON.stringify({access_token:'old-synthetic-access',refresh_token:'old-synthetic-refresh'})),authKey);await app.page.evaluate(()=>localStorage.setItem('fixture-events','[]'));
     await app.page.goto(callbackURL(started,{fresh:false}));await rejectsWithoutPersist(app.page,engine+': callback without fresh tokens never reuses an old stored session');
    }finally{await app.context.close();}
   });
   for(const mutation of ['wrong state','expired pending','wrong expected user','missing LINE identity','invalid server token']){
    await scenario(engine,browser,mutation,async()=>{
     const options={holdProvider:true,...(mutation==='missing LINE identity'?{missingLine:true}:{}),...(mutation==='invalid server token'?{verificationError:true}:{})};
     const app=await setup(browser,{options});try{
      const started=await beginHeld(app),url=new URL(callbackURL(started));
      if(mutation==='wrong state')url.searchParams.set('handoff_state','0'.repeat(64));
      if(mutation==='expired pending')await app.page.evaluate(key=>{const p=JSON.parse(localStorage.getItem(key));p.expires=Date.now()-1;localStorage.setItem(key,JSON.stringify(p));},pendingKey);
      if(mutation==='wrong expected user')await app.page.evaluate(({key,id})=>{const p=JSON.parse(localStorage.getItem(key));p.expected_user=id;localStorage.setItem(key,JSON.stringify(p));},{key:pendingKey,id:otherIdentity});
      await app.page.goto(url.href);await rejectsWithoutPersist(app.page,engine+': '+mutation+' is rejected before persistence');
      if(engine==='webkit'&&mutation==='wrong state')await app.page.screenshot({path:path.join(out,'scope-rejected-webkit.local.png'),fullPage:true});
     }finally{await app.context.close();}
    });
   }
   await scenario(engine,browser,'cancel during verification',async()=>{
    const app=await setup(browser,{options:{holdProvider:true,verificationDelay:700}});try{
     const started=await beginHeld(app);await app.page.goto(callbackURL(started));await app.page.waitForFunction(()=>localStorage.getItem('fixture-verifying')==='yes');await app.page.evaluate(key=>localStorage.removeItem(key),pendingKey);
     await rejectsWithoutPersist(app.page,engine+': cancellation during server verification prevents late persistence');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'OAuth operation failure',async()=>{
    const app=await setup(browser,{options:{oauthError:true}});try{
     await login(app);await app.page.click('#line-login');await app.page.waitForFunction(()=>!document.querySelector('#line-login').disabled&&localStorage.getItem('church-os-line-handoff-v1')===null);
     check(app.page.url().includes('/admin-login-v2')&&await app.page.locator('#line-login').isVisible(),engine+': OAuth preparation failure clears pending and preserves a usable login');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'cancel before URL ready',async()=>{
    const app=await setup(browser,{options:{oauthDelay:800}});try{
     await login(app);await app.page.click('#line-login');await app.page.locator('.line-auth-cancel:not([hidden])').click();await app.page.waitForTimeout(1100);
     check(app.page.url().includes('/admin-login-v2')&&await app.page.evaluate(key=>localStorage.getItem(key)===null,pendingKey)&&await app.page.locator('#line-login').isEnabled(),engine+': cancel before OAuth URL resolves prevents late navigation and permits retry');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'optional LINE App automatic browser entry',async()=>{
    const app=await setup(browser,{standalone:false});try{
     await login(app);await app.page.click('#line-auto-login');await app.page.locator('#destination').waitFor();
     const options=await app.page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-oauth-options')));
     check(!options.options.queryParams?.disable_auto_login&&!options.options.queryParams?.prompt,engine+': optional LINE App entry permits LINE auto login');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'installed automatic popup blocked',async()=>{
    const app=await setup(browser);try{
     await login(app);await app.page.click('#line-auto-login');
     check(await app.page.locator('#line-login').isEnabled()&&await app.page.locator('#line-auto-login').isEnabled()&&await app.page.evaluate(key=>!localStorage.getItem(key),pendingKey),engine+': blocked automatic login keeps credential entry usable and does not leave pending state');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'optional automatic flow cancellation',async()=>{
    const app=await setup(browser,{options:{oauthDelay:700}});try{
     await login(app);
     await app.page.evaluate(()=>{window.open=()=>({close:()=>{},location:{replace:url=>localStorage.setItem('fixture-popup-navigation',url)}});});
     await app.page.click('#line-auto-login');await app.page.locator('.line-auth-cancel:not([hidden])').waitFor();
     check(await app.page.locator('#line-login').isDisabled()&&await app.page.locator('#line-auto-login').isDisabled(),engine+': both login entries share one pending attempt');
     await app.page.locator('.line-auth-cancel').click();await app.page.waitForTimeout(1000);
     check(await app.page.evaluate(()=>!localStorage.getItem('fixture-popup-navigation')&&!localStorage.getItem('church-os-line-handoff-v1'))&&await app.page.locator('#line-login').isEnabled(),engine+': cancelling automatic login prevents a late popup redirect');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'ordinary Safari',async()=>{
    const app=await setup(browser,{standalone:false});try{
     await login(app);await app.page.click('#line-login');await app.page.locator('#destination').waitFor();
     const detail=await app.page.evaluate(key=>({pending:localStorage.getItem(key),oauth:JSON.parse(localStorage.getItem('fixture-oauth-options'))}),pendingKey);
     check(detail.pending===null&&new URL(detail.oauth.options.redirectTo).searchParams.get('return')!=='standalone',engine+': ordinary Safari login retains its existing browser flow');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'retired pending migration',async()=>{
    const app=await setup(browser,{options:{skipStoredSession:true}});try{
     await app.page.goto(origin+'/fixture-hold');
     const sentinel=JSON.stringify({access_token:'existing-synthetic-session',refresh_token:'existing-synthetic-refresh',user:{id:identity}});
     await app.page.evaluate(({authKey,pendingKey,sentinel})=>{localStorage.setItem(authKey,sentinel);localStorage.setItem(pendingKey,JSON.stringify({id:crypto.randomUUID(),secret:'b'.repeat(64),expires:Date.now()+300000,next:'/admin-dashboard.html',expected_user:null}));localStorage.setItem('fixture-events','[]');},{authKey,pendingKey,sentinel});
     await login(app);await app.page.waitForFunction(key=>localStorage.getItem(key)===null,pendingKey);
     check(await app.page.locator('#line-login').isEnabled()&&await app.page.evaluate(key=>localStorage.getItem(key)===null,pendingKey),engine+': upgrade retires old pending metadata and enables LINE login');
     check(await app.page.evaluate(key=>localStorage.getItem(key),authKey)===sentinel&&!(await events(app.page)).some(e=>e.type==='persist'),engine+': pending migration preserves existing authentication storage');
    }finally{await app.context.close();}
   });
   await scenario(engine,browser,'retired launcher recovery',async()=>{
    const app=await setup(browser);try{
     await app.page.goto(origin+'/admin-line-launch.html');await app.page.waitForURL(url=>url.pathname==='/admin-login-v2.html');await app.page.locator('#line-login').waitFor();
     check(await app.page.locator('#line-login').isEnabled()&&new URL(app.page.url()).searchParams.get('source')==='app-v2',engine+': old standalone launcher automatically recovers to usable App login');
     check(!(await events(app.page)).some(e=>e.type==='oauth'||e.type==='window.open')&&app.popupCount()===0,engine+': retired launcher recovery starts no external LINE flow');
    }finally{await app.context.close();}
   });
  }finally{await browser.close();}
 }
}finally{
 await writeFile(path.join(out,'scope-tests.json'),JSON.stringify({status:failures.length?'failed':'passed',checks,failures,engines:['Chrome','WebKit'],synthetic_provider:true,same_page_scope_roundtrip_simulated:true,separate_storage_context_tested:true,real_iphone:false,real_line:false,production_requests:false,production_writes:false},null,2));
 await new Promise(resolve=>server.close(resolve));
}
console.log('TOTAL',checks.length,'FAILURES',failures.length);
if(failures.length)process.exitCode=1;
