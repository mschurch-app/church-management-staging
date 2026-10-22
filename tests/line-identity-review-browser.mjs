import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-10-22-line-identity');
const id=n=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');
const record=(key,edit=false)=>({church_id:'M+',feature_key:key,view:true,create:false,edit,delete:false,export:false,approve:false,manage:false});
const accounts=[
 {user_id:id(1),display_name:'合成牧者',job_title:'牧師',is_owner:true,is_active:true,grants:[],roles:[],home_preferences:[],feature_permissions:[],version:'owner-v1'},
 {user_id:id(2),line_user_id:id(2),identity_review_required:true,display_name:'合成行政',job_title:'行政同工',is_owner:false,is_active:true,grants:['members','inventory'].map(permission=>({church_id:'M+',permission})),roles:[{church_id:'M+',role_key:'custom'}],home_preferences:[{church_id:'M+',home_modules:['inventory','members'],notification_topics:['tasks']}],feature_permissions:[record('members'),record('inventory',true)],version:'worker-v1'},
 {user_id:id(3),display_name:'合成火樂',job_title:'火樂同工',is_owner:false,is_active:true,grants:[{church_id:'SHiNE',permission:'members'}],roles:[{church_id:'SHiNE',role_key:'custom'}],home_preferences:[],feature_permissions:[],version:'shine-v1'},
 {user_id:id(4),display_name:'合成停用',job_title:'待確認',is_owner:false,is_active:false,grants:[{church_id:'M+',permission:'members'}],roles:[{church_id:'M+',role_key:'custom'}],home_preferences:[],feature_permissions:[],version:'inactive-v1'}
];
const factory=`(()=>{
 const owner={id:'${id(1)}',identities:[{provider:'custom:line-web'}]},session={user:owner,expires_at:Math.floor(Date.now()/1000)+3600};
 const option=()=>JSON.parse(localStorage.getItem('fixture-options')||'{}');
 const getAccounts=()=>JSON.parse(localStorage.getItem('fixture-accounts'));
 const rpc=async(name,args={})=>{
  const calls=JSON.parse(localStorage.getItem('fixture-calls')||'[]');calls.push({name,args});localStorage.setItem('fixture-calls',JSON.stringify(calls));
  let data=[];
  if(name==='get_my_church_access')data=['members','schedules','notification_settings'].map(permission=>({church_id:'M+',permission}));
  else if(name==='get_my_admin_profile')data=[{display_name:'合成牧者',job_title:'牧師'}];
  else if(name==='get_my_feature_permissions')data=['members','schedules','notification_settings'].map(feature_key=>({church_id:'M+',feature_key,view:true,edit:true,manage:true}));
  else if(name==='get_my_app_capabilities')data={is_owner:true,has_line:true};
  else if(name==='list_admin_accounts_v4'){
   if(option().refreshError&&localStorage.getItem('identity-confirmed'))return {data:null,error:{message:'network_error'}};
   data=getAccounts();
  }
  else if(name==='get_line_admin_access_review'){
   if(option().identityDelay)await new Promise(resolve=>setTimeout(resolve,400));
   if(option().identityLoadError)return {data:null,error:{message:'network_error'}};
   data={user_id:args.p_user,line_name:'合成暱稱 Star',application_name:'合成申請姓名',account_name:'合成行政',can_confirm_current:true,review_version:'identity-v1',identity_confirmed:!!localStorage.getItem('identity-confirmed'),candidates:[{user_id:'${id(3)}',display_name:'合成火樂',job_title:'同工'}]};
  }
  else if(name==='confirm_line_account_identity'||name==='approve_line_admin_access_review'){
   await new Promise(resolve=>setTimeout(resolve,100));
   if(option().identityError)return {data:null,error:{message:option().identityError}};
   const list=getAccounts();list.find(r=>r.user_id==='${id(2)}').identity_review_required=false;localStorage.setItem('fixture-accounts',JSON.stringify(list));localStorage.setItem('identity-confirmed','yes');data=true;
  }
  else if(name==='list_coworker_applications')data=option().emptyApplications?[]:[{user_id:'${id(5)}',full_name:'合成新同工',church_id:'M+',ministry:'影音',line_name:'合成 LINE',status:'pending',updated_at:'2026-10-22T06:00:00Z'}];
  else if(name==='get_service_signup_scopes')data=[];
  else if(name==='get_work_profile')data={can_edit:true,profile:{church_role:'事工領袖',assignments:[{domain:'church',key:'accounting',type:'primary'}],oversight_domains:[],reminder_route:'personal',version:7}};
  else if(name==='save_admin_account_bundle'){
   const writes=JSON.parse(localStorage.getItem('fixture-writes')||'[]');writes.push(args);localStorage.setItem('fixture-writes',JSON.stringify(writes));
   if(option().saveError)return {data:null,error:{message:'account_changed'}};
   const list=getAccounts(),r=list.find(r=>r.user_id===args.p_user);Object.assign(r,{display_name:args.p_input.display_name,job_title:args.p_input.job_title,grants:args.p_input.grants,roles:args.p_input.roles,is_active:args.p_input.active,feature_permissions:args.p_input.features.map(f=>({...f,church_id:args.p_church})),version:'saved-v2'});localStorage.setItem('fixture-accounts',JSON.stringify(list));data={saved:true,version:'saved-v2'};
  }else if(name==='review_coworker_application')data={status:args.p_decision==='reject'?'rejected':'approved'};
  return {data,error:null};
 };
 const db={auth:{getUser:async()=>({data:{user:owner},error:null}),getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),refreshSession:async()=>({data:{session},error:null})},rpc};window.supabase={createClient:()=>db};
})();`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local'),file=path.resolve(root,'.'+url.pathname);assert(file.startsWith(root+path.sep));
 let body=await readFile(file);if(url.pathname.startsWith('/vendor/supabase-'))body=factory;
 res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(body);
}catch{res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const checks=[],errors=[];const check=(truth,name)=>{assert(truth,name);checks.push(name);console.log('PASS',name);};
async function setup(browser,width,options={}){
 const context=await browser.newContext({viewport:{width,height:900}});
 await context.addInitScript(({accounts,options})=>{Object.defineProperty(navigator,'serviceWorker',{value:undefined,configurable:true});localStorage.setItem('fixture-accounts',JSON.stringify(accounts));localStorage.setItem('fixture-options',JSON.stringify(options));},{accounts,options});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page};
}
const options=async(page,values)=>page.evaluate(values=>localStorage.setItem('fixture-options',JSON.stringify(values)),values);
const writes=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-calls')||'[]').filter(c=>['confirm_line_account_identity','approve_line_admin_access_review','save_admin_account_bundle','review_coworker_application'].includes(c.name)));
const open=async page=>{await page.goto(origin+'/admin-accounts.html?church=M%2B&review_user='+id(2));await page.getByRole('button',{name:'確認為這位同工本人',exact:true}).waitFor();};
try{
 await mkdir(out,{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
  try{
   for(const width of [390,1440]){
    const {context,page}=await setup(browser,width,{emptyApplications:true,identityError:'account_changed'}),label=engine+' '+width;
    try{
     await open(page);const button=page.getByRole('button',{name:'確認為這位同工本人',exact:true});
     check(await page.locator('.line-identity-facts dd').allTextContents().then(values=>JSON.stringify(values)===JSON.stringify(['合成行政','合成申請姓名','合成暱稱 Star'])),label+': real name, application name and different nickname are all visible');
     check(await button.isDisabled()&&await writes(page).then(v=>v.length===0),label+': opening the page makes no identity or permission writes');
     check(!await page.locator('#editor select').isVisible()&&!await page.locator('#editor details').getAttribute('open'),label+': independent-account confirmation does not require selecting another account');
     check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+': review fits the viewport');
     await page.screenshot({path:path.join(out,'review-'+engine+'-'+width+'.local.png'),fullPage:true});
     await page.check('[data-identity-current]');await button.click();await page.locator('#editor .form-message').filter({hasText:'資料已變更'}).waitFor();
     check(await page.locator('[data-identity-current]').isChecked()&&await button.isEnabled()&&await page.getByRole('button',{name:'重新載入核對資料'}).isVisible(),label+': stale data retains the check and exposes a reload action without reporting success');
     await options(page,{emptyApplications:true});await page.getByRole('button',{name:'重新載入核對資料'}).click();await page.locator('[data-identity-current]').waitFor();
     check(!await page.locator('[data-identity-current]').isChecked(),label+': reloading requires confirmation of the newly loaded information');
     await page.check('[data-identity-current]');await button.click();await page.locator('#editor .form-message').filter({hasText:'原有權限保留'}).waitFor();
     const calls=await writes(page);check(calls.length===2&&calls.every(c=>c.name==='confirm_line_account_identity'&&c.args.p_user===id(2)&&c.args.p_version==='identity-v1'),label+': current-account confirmation never calls account linking or permission saving');
     check(await page.locator('[data-identity-current]').count()===0&&await page.locator('#editor select').count()===0,label+': success removes write controls to prevent another accidental confirmation');
     await page.getByRole('button',{name:'返回名單',exact:true}).click();await page.locator('#accounts-directory').waitFor();
     check(!new URL(page.url()).searchParams.has('review_user')&&!await page.locator('#items').textContent().then(s=>s.includes('LINE 身分待核對')),label+': returning clears the review URL and refreshed pending label');
    }finally{await context.close();}
   }
   const a=await setup(browser,390,{emptyApplications:true});try{
    await open(a.page);await a.page.locator('#editor details>summary').click();await a.page.selectOption('#editor select',id(3));
    check(await a.page.getByRole('button',{name:'連結並套用既有權限',exact:true}).isDisabled(),engine+': selecting another account still needs the separate same-person checkbox');
    await a.page.locator('#editor details input[type=checkbox]').check();a.page.once('dialog',dialog=>dialog.dismiss());await a.page.getByRole('button',{name:'連結並套用既有權限',exact:true}).click();check(await writes(a.page).then(v=>v.length===0),engine+': cancelling the linking prompt makes no write');
    a.page.once('dialog',dialog=>dialog.accept());await a.page.getByRole('button',{name:'連結並套用既有權限',exact:true}).click();await a.page.locator('#editor .form-message').filter({hasText:'已完成連結'}).waitFor();
    check(await writes(a.page).then(c=>c.length===1&&c[0].name==='approve_line_admin_access_review'&&c[0].args.p_source_user===id(3)),engine+': explicit duplicate-account path still links exactly the selected source');
   }finally{await a.context.close();}
   const b=await setup(browser,390,{emptyApplications:true,refreshError:true});try{
    await open(b.page);await b.page.check('[data-identity-current]');await b.page.getByRole('button',{name:'確認為這位同工本人',exact:true}).click();await b.page.locator('#editor .form-message').filter({hasText:'本次核對已儲存'}).waitFor();
    check(await b.page.getByRole('button',{name:'返回名單',exact:true}).isEnabled()&&await writes(b.page).then(c=>c.length===1),engine+': a list refresh failure preserves confirmed success and does not retry the write');
   }finally{await b.context.close();}
   const c=await setup(browser,390,{emptyApplications:true,identityLoadError:true});try{
    await c.page.goto(origin+'/admin-accounts.html?church=M%2B&review_user='+id(2));await c.page.getByRole('button',{name:'重新載入核對資料'}).waitFor();await options(c.page,{emptyApplications:true});await c.page.getByRole('button',{name:'重新載入核對資料'}).click();await c.page.locator('[data-identity-current]').waitFor();
    check(await writes(c.page).then(v=>v.length===0),engine+': initial load errors offer recovery without a write');
   }finally{await c.context.close();}
   const d=await setup(browser,390,{emptyApplications:true,identityDelay:true});try{
    await d.page.goto(origin+'/admin-accounts.html?church=M%2B&review_user='+id(2));await d.page.getByRole('button',{name:'返回名單',exact:true}).click();await d.page.waitForTimeout(600);
    check(await d.page.locator('#accounts-directory').isVisible()&&await d.page.locator('#editor').isHidden()&&!new URL(d.page.url()).searchParams.has('review_user'),engine+': leaving during a slow identity load is not undone by its late response');
   }finally{await d.context.close();}
  }finally{await browser.close();}
 }
 check(errors.length===0,'no uncaught browser errors: '+errors.join('; '));await writeFile(path.join(out,'browser-results.json'),JSON.stringify({synthetic:true,external_requests_blocked:true,physical_iPhone:false,checks},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
