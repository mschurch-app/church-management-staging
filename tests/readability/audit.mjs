import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {fixture as treeFixture} from '../life-tree/backend-fixture.mjs';
import {FUNCTION_CATALOG,LEGACY_FEATURE_FILES} from '../../app-function-definitions.mjs';
import {GROUPS as WELCOME_GROUPS} from '../../welcome-options.mjs';
import {daily,weekly,service} from '../phase3/fixtures.mjs';
import {readableTextMetrics as contrastMetrics} from './contrast.mjs';
const {default:puppeteer}=await import(process.env.PUPPETEER_MODULE||'puppeteer-core');
const root=process.env.READABILITY_ROOT||new URL('../../',import.meta.url).pathname,out=process.env.READABILITY_OUTPUT||'/tmp/church-readability-20261012/baseline';
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root)){res.writeHead(403).end();return;}try{const types={'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const permissions=['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory','heat_camp'];
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const user={id:uid,email:'audit@example.invalid',app_metadata:{provider:'custom:line-web',providers:['email','custom:line-web']},user_metadata:{name:'測試同工'},identities:[{provider:'custom:line-web',user_id:uid,id:uid,identity_data:{sub:uid}}]};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},{signature:'audit'}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const session={access_token:jwt,refresh_token:'audit-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
const accounts=[{user_id:uid,email:user.email,is_active:true,display_name:'測試同工',job_title:'行政同工',is_owner:true,grants:[],roles:[],home_preferences:[],feature_permissions:[],invitation_state:'active'},{user_id:other,email:'second@example.invalid',is_active:true,display_name:'測試負責人',job_title:'服事同工',grants:[{church_id:'M+',permission:'schedules'}],roles:[{church_id:'M+',role_key:'custom'}],home_preferences:[],feature_permissions:[],invitation_state:'active'}];
let mode='owner',fixtureChurch='M+',failCapabilities=false,failSave=false,writes=[],intercepted=[];
const featureModules=Object.keys(LEGACY_FEATURE_FILES).map(key=>({key,permission:FUNCTION_CATALOG[key]?.permission||key,label:(FUNCTION_CATALOG[key]||Object.values(FUNCTION_CATALOG).find(item=>item.file===LEGACY_FEATURE_FILES[key]))?.title||key,icon:(FUNCTION_CATALOG[key]||Object.values(FUNCTION_CATALOG).find(item=>item.file===LEGACY_FEATURE_FILES[key]))?.icon||'○',description:'隔離測試功能',enabled:true,dashboard:false,navigation:false,dashboard_order:10,navigation_order:10}));
const welcomeOptions=Object.fromEntries(Object.keys(WELCOME_GROUPS).map(key=>[key,[{label:'測試選項一',value:'fixture-one',selected:true},{label:'測試選項二',value:'fixture-two',selected:false}]]));
const assigned=['members','tree_reading_admin','school_students'];let publicSettings={brand_color:'#AD3C2A',logo_url:'',service_info:'每週主日聚會',address:'測試地址',map_url:'',updated_at:new Date().toISOString()};
const rolePermissions=()=>mode==='leader'?['schedules']:mode==='notification'?['members','notification_settings']:mode==='facilities'?['spaces','inventory']:permissions;
fs.mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync'],userDataDir:out+'/chrome'});
const context=await browser.createBrowserContext();
async function setup(page,{signedIn=true}={}){
 await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await page.evaluateOnNewDocument((session,signedIn)=>{delete Navigator.prototype.serviceWorker;if(location.hostname!=='127.0.0.1')return;sessionStorage.setItem('line-member-access-token:M+','isolated-access');if(signedIn&&!/admin-login|login-recovery/.test(location.pathname))localStorage.setItem('church-staging-admin-v1',JSON.stringify(session));else localStorage.removeItem('church-staging-admin-v1');},session,signedIn);
 await page.setBypassServiceWorker(true);await page.setRequestInterception(true);
 page.on('request',async req=>{
  const url=new URL(req.url());if(url.hostname==='static.line-scdn.net'){await req.respond({status:200,contentType:'application/javascript',body:`window.liff={init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>"isolated-id",getAccessToken:()=>"isolated-access",getProfile:async()=>({displayName:"測試會友",userId:"U00000000000000000000000000000000"}),getDecodedIDToken:()=>({name:"測試會友",sub:"U00000000000000000000000000000000"}),isApiAvailable:()=>false,login:()=>{},closeWindow:()=>{}};`});return;}
  if(url.hostname.endsWith('supabase.co')){
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
    else if(name==='get_my_app_capabilities'){data=failCapabilities?{message:'fixture denied'}:{is_owner:mode==='owner',has_line:true};if(failCapabilities)status=503;}
    else if(name==='get_service_signup_admin')data=service();
    else if(name==='list_admin_accounts_v3'||name==='list_admin_accounts_v4')data=accounts;
    else if(name==='get_review_workflow_settings')data={can_manage:mode==='owner',people:[{id:uid,name:'測試同工',email:user.email,has_line:true},{id:other,name:'測試負責人',email:'second@example.invalid',has_line:true}],workflows:[{key:'devotional',label:'每日靈修',initial_reviewer_id:uid,final_reviewer_id:other,notify_app:true,notify_line:true}]};
    else if(name==='get_service_signup_scopes')data=[];
    else if(name==='list_my_app_notifications')data=[{id:'1',title:'測試通知',body:'測試通知內容\n'.repeat(40),read_at:null,created_at:new Date().toISOString(),target_url:'members.html'}];
    else if(name.startsWith('set_')||name.startsWith('save_')||name.startsWith('remove_')||name.startsWith('mark_')){writes.push({name,body});data=['save_admin_account_bundle','save_review_workflow_setting'].includes(name)?{saved:true,version:'fixture-version'}:true;}
   }else if(url.pathname.endsWith('/website_weekly_bulletins'))data=weekly();
   else if(url.pathname.endsWith('/website_content_posts'))data=[1,2].map(n=>({id:n,church_id:'M+',title:'一起成長的教材 '+n,published_on:'2026-10-12',content_html:'<p>這是隔離測試內容</p>',excerpt:'以愛陪伴每一位家人',status:'published'}));
   else if(url.pathname.endsWith('/inventory_items'))data=[{id:1,church_id:'M+',name:'測試長名稱物品',category:'其他',scope:'M+',total_quantity:4,minimum_quantity:0,status:'available',management_type:'quantity',unit:'根',location_id:'room',specifications:'這是物品說明',is_active:true}];
   else if(url.pathname.endsWith('/members'))data=[{id:1,church_id:'M+',name:'測試會友',phone:'',group_name:'測試小組',gender:'弟兄',faith_status:'新朋友（初次聚會）',growth_progress:'穩定聚會',ministry:'敬拜',archived_at:null}];
   else if(url.pathname.endsWith('/groups'))data=[{id:1,church_id:'M+',name:'測試小組',group_type:'小組',leader:'測試同工',meeting_time:'每週五',location:'教會',memo:'一起成長',archived_at:null}];
   else if(url.pathname.endsWith('/room_amenities'))data=[{id:1,church_id:'M+',name:'測試投影機',quantity:2,is_active:true}];
   else if(url.pathname.endsWith('/rooms'))data=[{id:1,church_id:'M+',name:'測試會議室',floor:'一樓',capacity:10,equipment:'桌椅',hourly_rate:0,cleaning_fee:0,is_active:true,is_available_for_rent:true}];
   else if(url.pathname.endsWith('/room_bookings'))data=[{id:1,church_id:'M+',room_id:1,applicant_name:'測試同工',booking_date:'2026-10-12',start_time:'10:00',end_time:'12:00',purpose:'小組',booking_type:'內部使用',total_fee:0,status:'待審核'}];
   else if(url.pathname.endsWith('/attendance_records'))data=[{id:1,church_id:'M+',meeting_date:'2026-10-11',meeting_type:'主日',group_name:'測試小組',leader_name:'測試同工',total_expected:2,total_present:1,present_list:'測試會友',absent_list:'測試家人',memo:'隔離資料'}];
   else if(url.pathname.endsWith('/prayers'))data=[{id:1,church_id:'M+',name:'測試會友',title:'平安與盼望',content:'求主帶領家人',category:'生活',status:'new',is_public:true,is_answered:false,created_at:'2026-10-12T00:00:00Z'}];
   else if(url.pathname.endsWith('/welcome_form_options'))data={options:welcomeOptions,version:1};
   else if(url.pathname.endsWith('/member_ministry_options'))data={options:['敬拜主領','關懷代禱']};
   else if(url.pathname.endsWith('/inventory_locations'))data=[{id:'room',scope:'M+',name:'一樓儲藏室',parent_id:null,location_type:'room',sort_order:1}];
   else if(url.pathname.endsWith('/church_customizations'))data={church_id:url.searchParams.get('church_id')?.slice(3)||fixtureChurch,feature_modules:featureModules,welcome_fields:[{key:'name',label:'姓名',visible:true,required:true,sort_order:10,audience:'all'}],catalogs:{faith_status:['慕道友','委身家人']},version:1,updated_at:new Date().toISOString()};
   else if(url.pathname.endsWith('/church_public_settings')){if(req.method()==='PATCH'){writes.push({name:'church_public_settings',body});if(failSave){status=503;data={message:'fixture unavailable'};}else{publicSettings={...publicSettings,...body};data=[{church_id:fixtureChurch}];}}else data={church_id:fixtureChurch,...publicSettings};}
   else if(url.pathname.endsWith('/functions/v1/line-member')){data={ok:true,profile:{name:'測試會友'},item:{...daily()[0],scripture:'主是我的牧者',scripture_ref:'詩篇 23:1',prayer_text:'願主賜你平安'},progress:[],items:[{title:'主日聚會',day_name:'日',time:'10:00',location:'教會',category:'平安',scripture:'主是我的牧者',scripture_ref:'詩篇 23:1',prayer_text:'願主賜你平安'}],settings:{address:'測試地址'},binding_status:'approved',member:{name:'測試會友'},seasons:[],registrations:[]};}
   else if(url.pathname.endsWith('/functions/v1/member-access'))data={state:'unbound'};
   else if(url.pathname.endsWith('/functions/v1/prayer-wall'))data={ok:true,prayers:[{id:1,author_name:'測試家人',title:'平安與盼望',content:'願主帶領我們',hands_count:2,halo_level:1,comments:[],created_at:new Date().toISOString()}]};
   else if(url.pathname.endsWith('/functions/v1/tree-reading-october-test')){const result=await treeFixture().call(body.action||'me');data=result;delete data.status;}
   else if(url.pathname.includes('/functions/')){data={ok:true,items:[],drafts:[],people:[],settings:{},connections:{},ministries:[]};if(url.pathname.endsWith('/daily-devotional-admin'))data={ok:true,items:daily(),reviewerStage:'initial'};if(url.pathname.endsWith('/weekly-bulletin-review'))data={ok:true,items:weekly()};}
   await req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,HEAD,OPTIONS','access-control-allow-headers':'*','content-range':'0-0/1'},body:JSON.stringify(data)});return;
  }
  if(url.hostname==='cdn.tailwindcss.com'&&process.env.READABILITY_TAILWIND){await req.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(process.env.READABILITY_TAILWIND,'utf8')});return;}
  if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('supabase')){await req.respond({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(root,'vendor/supabase-2.102.0.js'),'utf8')});return;}
  if(url.origin!==base&&url.protocol!=='data:'){await req.abort();return;}
  await req.continue();
 });
}

const files=fs.readdirSync(root).filter(f=>f.endsWith('.html')).sort().concat(['pastoral/index.html','pastoral/workspace.html','pastoral/coworker-tools.html']);
const selectedFiles=process.env.READABILITY_FILES?.split(',');
const results=[];
for(const width of [390,1440]){
 const page=await context.newPage();await setup(page);await page.setViewport({width,height:900,deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500});
 for(const file of files.filter(file=>!selectedFiles||selectedFiles.includes(file))){
  console.log('CHECK',width,file);
  const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);
  try{await page.evaluate(()=>localStorage.removeItem('church-staging-admin-v1')).catch(()=>{});await page.goto(base+'/'+file+'?church=M%2B',{waitUntil:'domcontentloaded',timeout:10000});await new Promise(r=>setTimeout(r,650));await page.waitForNetworkIdle({idleTime:150,timeout:1500}).catch(()=>{});if(!page.url().startsWith(base)){results.push({file,width,url:page.url(),kind:'external-redirect',errors});continue;}

   const capture=async(state='initial')=>{
    const result={file,width,state,url:page.url(),errors:[...errors],...await page.evaluate(contrastMetrics)};
    result.status=await page.evaluate(()=>document.querySelector('#status')?.textContent||'');
    if(/Cannot read properties|is not a function/.test(result.status))result.error='Rendered runtime error: '+result.status;
    result.controls=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>{const s=getComputedStyle(n);return{class:n.className,role:n.dataset.appControl,text:n.textContent.trim().slice(0,55),background:s.backgroundImage==='none'?s.backgroundColor:s.backgroundImage,color:s.color}}));
    results.push(result);fs.writeFileSync(out+'/audit.partial.json',JSON.stringify(results,null,2));if(result.failures.length)console.log(JSON.stringify({file,width,state,failures:result.failures}));
    if(process.env.READABILITY_SCREENSHOTS==='1'&&['inventory.html','admin-login.html','customization-settings.html','group-resources-management.html','mplus-about.html','website-maintenance.html','line-preview.html','pastoral/workspace.html'].includes(file))await page.screenshot({path:out+'/'+file.replaceAll('/','-')+'-'+width+'-'+state.replaceAll(/[^a-z0-9-]/gi,'-')+'.png',fullPage:true});
   };
   try{await capture();}catch(error){if(!/Execution context was destroyed/.test(error.message))throw error;await new Promise(r=>setTimeout(r,600));await capture();}
   const click=async(selector,state)=>{const n=await page.$(selector);if(!n)return;await n.click();await new Promise(r=>setTimeout(r,180));await page.waitForNetworkIdle({idleTime:100,timeout:1000}).catch(()=>{});await capture(state);};
   if(['newcomer.html','shine-newcomer.html'].includes(file)){await click('#memberIdentityPanel button:last-child','newcomer-form');await click('#groupFeelings button:nth-child(2)','newcomer-selected');}
   if(file==='customization-settings.html')for(const tab of ['form','catalogs','features'])await click('.custom-tabs [data-tab="'+tab+'"]','tab-'+tab);
   if(file==='group-resources-management.html'){await click('#items .item:nth-child(2)','second-material');await click('#new','new-material');}
   if(file==='admin-accounts.html')await click('.admin-account-card button','account-editor');
   if(file==='inventory.html')await click('.inventory-card','item-detail');
   if(file==='prayer-wall.html')await click('#create-open','prayer-form');
   if(file==='pastoral-content.html')await click('[data-tab="journey"]','journey');
   if(file==='line-preview.html'){
    for(const church of ['SHiNE','M+']){await click('[data-church="'+church+'"]','church-'+church);for(const nav of ['today','help','prayer','newcomer','weekly','love'])await click('[data-nav="'+nav+'"]',church+'-'+nav);}
   }
   if(file==='life-tree-festivals.html'){
    const ids=await page.$$eval('[data-festival]',nodes=>nodes.map(n=>n.dataset.festival));for(const id of ids)await click('[data-festival="'+id+'"]','festival-'+id);
   }

  }catch(error){results.push({file,width,error:error.message,errors});}
  page.off('pageerror',listener);
 }
 await page.close();
}
fs.writeFileSync(out+'/audit.json',JSON.stringify(results,null,2));
if(process.env.READABILITY_ENFORCE==='1'&&results.some(r=>r.error||r.errors?.length||r.failures?.length))process.exitCode=1;
await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({entries:files.filter(file=>!selectedFiles||selectedFiles.includes(file)).length,views:results.length,failures:results.filter(r=>r.error||r.errors?.length||r.failures?.length).length}));
