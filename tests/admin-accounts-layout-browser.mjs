import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-10-22-accounts-layout');
const id=n=>'50000000-0000-4000-8000-'+String(n).padStart(12,'0');
const record=(key,edit=false)=>({church_id:'M+',feature_key:key,view:true,create:false,edit,delete:false,export:false,approve:false,manage:false});
const accounts=[
 {user_id:id(1),display_name:'合成牧者',job_title:'牧師',is_owner:true,is_active:true,grants:[],roles:[],home_preferences:[],feature_permissions:[],version:'owner-v1'},
 {user_id:id(2),display_name:'合成行政',job_title:'行政同工',is_owner:false,is_active:true,grants:['members','inventory'].map(permission=>({church_id:'M+',permission})),roles:[{church_id:'M+',role_key:'custom'}],home_preferences:[{church_id:'M+',home_modules:['inventory','members'],notification_topics:['tasks']}],feature_permissions:[record('members'),record('inventory',true)],version:'worker-v1'},
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
  else if(name==='list_admin_accounts_v4')data=getAccounts();
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
 await context.addInitScript(({accounts,options})=>{Object.defineProperty(navigator,'serviceWorker',{value:undefined,configurable:true});if(!sessionStorage.getItem('fixture-ready')){localStorage.setItem('fixture-accounts',JSON.stringify(accounts));localStorage.setItem('fixture-options',JSON.stringify(options));sessionStorage.setItem('fixture-ready','yes');}},{accounts,options});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page};
}
const edit=async(page,name='合成行政')=>{await page.click('#accounts-tab');await page.getByRole('button',{name:'設定 '+name,exact:true}).click();await page.locator('#editor form').waitFor();await page.waitForFunction(()=>document.querySelector('#editor form')._workProfile.ready());};
const operations=(page,feature)=>page.locator('[data-permission-row="'+feature+'"] .account-operation-details');
const back=async page=>{await page.getByRole('button',{name:'返回名單',exact:true}).click();await page.locator('#accounts-directory').waitFor();};
try{
 await mkdir(out,{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
  try{for(const width of [390,1440]){
   const {context,page}=await setup(browser,width);const label=engine+' '+width;
   try{
    await page.goto(origin+'/admin-accounts.html?church=M%2B');await page.waitForFunction(()=>document.querySelector('#application-count').textContent==='1');
    check(await page.locator('#applications-tab').getAttribute('aria-selected')==='true'&&await page.locator('#applications-panel').isVisible(),label+': pending work is a separate default view');
    check(await page.locator('#add,input[type=email]').count()===0&&!(await page.locator('body').textContent()).includes('寄送邀請'),label+': obsolete Email invitation controls are removed');
    await page.click('#accounts-tab');check(await page.locator('#items .admin-account-card').count()===3,label+': directory starts in the selected church including its owner');
    check(await page.locator('#items').getByRole('button').count()===3&&!await page.locator('#items').textContent().then(s=>s.includes('未授權')),label+': each row has one setup action without duplicate ungranted church lines');
    await page.fill('#account-search','行政');check(await page.locator('#items .admin-account-card').count()===1,label+': name or title search filters without reloading');await page.fill('#account-search','');
    await page.selectOption('#account-state','inactive');check(await page.locator('#items .admin-account-card').count()===1,label+': inactive filter is available');await page.selectOption('#account-state','all');
    await page.selectOption('#account-church','SHiNE');check(await page.locator('#items .admin-account-card').count()===2,label+': church filter includes only assigned accounts and owners');await page.selectOption('#account-church','M+');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+': directory has no horizontal overflow');
    check(await page.locator('.os-action-toast').evaluate(n=>!n.classList.contains('show')&&getComputedStyle(n).visibility==='hidden'),label+': idle feedback does not paint an empty floating panel');
    check(await page.locator('#account-church').evaluate(n=>n.getBoundingClientRect().height>=44)&&await page.evaluate(()=>getComputedStyle(document.querySelector('#applications-tab')).backgroundColor!==getComputedStyle(document.querySelector('#accounts-tab')).backgroundColor),label+': filters meet touch size and the selected section has a distinct color');
    await page.waitForTimeout(300);
    await writeFile(path.join(out,'paint-'+engine+'-'+width+'.local.json'),JSON.stringify(await page.evaluate(()=>({pressed:[...document.querySelectorAll('.ios-pressed')].map(n=>({tag:n.tagName,text:n.textContent})),overlays:[...document.body.children].filter(n=>getComputedStyle(n).position==='fixed').map(n=>({cls:n.className,text:n.textContent,opacity:getComputedStyle(n).opacity,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility}))})),null,2));
    await page.screenshot({path:path.join(out,'directory-'+engine+'-'+width+'.local.png'),fullPage:true});
    await edit(page);
    check(!await page.locator('#accounts-directory').isVisible()&&await page.locator('#editor .account-step').count()===3,label+': editing shows one person in three ordered sections');
    check(await page.locator('#editor .work-profile-editor details[open]').count()===0&&(await page.locator('#editor .work-profile-editor summary').first().textContent()).includes('財務會計'),label+': assignments show their existing summary with optional groups collapsed');
    check(await page.locator('#editor .account-operation-details summary').first().textContent().then(s=>s.includes('操作權限'))&&await page.locator('#editor .account-operation-details').count()===2&&await page.locator('#editor .account-operation-details[open]').count()===0,label+': only granted functions offer collapsed operation details');
    check(!await page.locator('input[data-permission="heat_camp"]').isVisible()&&await page.locator('#editor details.account-advanced[open]').count()===0&&await page.locator('#editor').getByRole('button',{name:'移除教會 OS 權限',exact:true}).isHidden(),label+': homepage and removal tools are outside the normal editing path');
    await page.screenshot({path:path.join(out,'editor-'+engine+'-'+width+'.local.png'),fullPage:true});
    await operations(page,'members').locator('summary').click();await page.check('input[data-feature="members"][data-action="edit"]');
    await page.locator('.account-function-library>summary').click();await page.check('input[data-permission="heat_camp"]');check(await page.locator('input[data-feature="members"][data-action="edit"]').isChecked(),label+': choosing another function preserves edited operation rights');
    check(await page.locator('input[data-feature="heat_camp"][data-action="view"]').isChecked()&&!await page.locator('input[data-feature="heat_camp"][data-action="edit"]').isChecked(),label+': newly granted functions start with view only');
    await page.uncheck('input[data-permission="inventory"]');await page.check('input[data-permission="inventory"]');check(await page.locator('input[data-feature="inventory"][data-action="edit"]').isChecked(),label+': temporarily unchecking a function preserves its prior operation selection');
    // Declining cancellation retains the same form and edited choices.
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'取消',exact:true}).click();check(await page.locator('#editor').isVisible()&&await page.locator('input[data-permission="heat_camp"]').isChecked(),label+': cancelling a discard prompt retains the edited form');
    await page.getByRole('button',{name:'儲存同工設定',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#editor').hidden);
    const payload=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture-writes'))[0].p_input);
    assert.deepEqual(payload.home_modules,['inventory','members']);assert.deepEqual(payload.notification_topics,['tasks']);
    check(payload.work_profile.assignments[0].key==='accounting'&&payload.work_profile.expected_version===7,label+': collapsed homepage and work assignments retain their original values');
    check(payload.roles[0].role_key==='custom'&&payload.grants.length===3&&payload.features.find(f=>f.feature_key==='members').edit===true,label+': one save submits exactly selected grants and edited operations');
    await edit(page,'合成牧者');check(await page.locator('#editor input[data-permission]').count()===0&&await page.locator('#editor .check-panel input').isDisabled(),label+': owners are clearly fixed rather than presented as editable grants');await back(page);
    await page.click('#applications-tab');await page.click('#applications summary');await page.locator('#applications form select').first().selectOption('approve');await page.check('[data-application-permission="members"]');check(await page.locator('#applications .application-operation-details:not([hidden])').count()===1&&await page.locator('#applications .application-operation-details[open]').count()===0,label+': new application approval uses the same compact operation disclosure');
    await page.click('#accounts-tab');await page.locator('#accounts-tab').focus();await page.keyboard.press('ArrowLeft');check(await page.locator('#applications-tab').getAttribute('aria-selected')==='true',label+': directory sections support keyboard tab navigation');
   }finally{await context.close();}
  }
  const a=await setup(browser,390,{emptyApplications:true,saveError:true});try{
   await a.page.goto(origin+'/admin-accounts.html?church=M%2B');await a.page.waitForFunction(()=>document.querySelector('#application-count').textContent==='0');check(await a.page.locator('#accounts-panel').isVisible(),engine+': empty approval queue defaults to staff directory');
   await edit(a.page);await a.page.locator('#editor .edit-grid input').first().fill('保留合成姓名');await a.page.getByRole('button',{name:'儲存同工設定',exact:true}).click();await a.page.locator('#editor .form-message').filter({hasText:'其他管理員已更新'}).waitFor();
   check(await a.page.locator('#editor .edit-grid input').first().inputValue()==='保留合成姓名'&&await a.page.getByRole('button',{name:'儲存同工設定',exact:true}).isEnabled(),engine+': failed save preserves input and restores the save control');
  }finally{await a.context.close();}
  }finally{await browser.close();}
 }
 check(errors.length===0,'no uncaught browser errors: '+errors.join('; '));await writeFile(path.join(out,'browser-results.json'),JSON.stringify({synthetic:true,external_requests_blocked:true,physical_iPhone:false,checks},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
