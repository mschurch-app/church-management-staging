import puppeteer from 'puppeteer-core';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url).pathname,out=new URL('./results/contrast/',import.meta.url).pathname,base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769';
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
const page=await context.newPage();await setup(page);const results=[];
const files=fs.readdirSync(root).filter(f=>f.endsWith('.html')&&fs.readFileSync(path.join(root,f),'utf8').includes('class="member-page'));
for(const file of files){
 await page.goto(base+'/'+file+'?church=M%2B',{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,350));
 if(!page.url().includes(file))continue;
 if(file==='admin-accounts.html'){try{await page.click('.admin-account-card button');await new Promise(r=>setTimeout(r,250));}catch{}}
 const metrics=await page.evaluate(()=>{
  document.querySelectorAll('details').forEach(n=>n.open=true);
  const parse=c=>{const m=c?.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').map(Number):null;};
  const blend=(c,b)=>{const a=c[3]??1;return c.slice(0,3).map((v,i)=>v*a+b[i]*(1-a));};
  const lum=c=>c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
  const bg=node=>{for(let n=node;n;n=n.parentElement){const s=getComputedStyle(n),colors=[...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m=>parse(m[0]));const c=parse(s.backgroundColor);if(colors.length){const base=c&&c[3]!==0?blend(c,[255,255,255]):[255,255,255];return colors.map(v=>blend(v,base));}if(c&&(c[3]??1)>.1)return[blend(c,[255,255,255])];}return[[255,255,255]];};
  let checked=0;const failures=[];const seen=new Set();const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let text;
  while(text=walker.nextNode()){
   const value=text.textContent.trim(),n=text.parentElement;if(!value||!n||n.closest('script,style,svg,[aria-hidden=true],button:disabled')||!n.getClientRects().length)continue;
   const s=getComputedStyle(n);if(s.visibility==='hidden'||s.display==='none')continue;
   const color=parse(s.color);if(!color)continue;const backgrounds=bg(n),ratio=Math.min(...backgrounds.map(background=>{const a=lum(blend(color,background)),b=lum(background);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));
   const size=parseFloat(s.fontSize),minimum=size>=24||size>=18.66&&Number(s.fontWeight)>=700?3:4.5;checked++;
   const selector=n.tagName.toLowerCase()+'.'+n.className,key=selector+s.color+backgrounds.toString();if(ratio+.01<minimum&&!seen.has(key)){seen.add(key);failures.push({selector,text:value.slice(0,45),color:s.color,backgrounds,ratio:Math.round(ratio*100)/100,minimum});}
  }
  const h=document.querySelector('.member-page>.page-header');return{checked,failures,header:h?.getBoundingClientRect().height,headerClipped:h?[...h.querySelectorAll('h1,.admin-identity,.header-tools')].some(n=>n.getBoundingClientRect().bottom>h.getBoundingClientRect().bottom):false};
 });results.push({file,...metrics});
}
fs.writeFileSync(out+'/contrast-audit.json',JSON.stringify(results,null,2));await browser.close();assert(results.length===files.length);assert(results.every(r=>r.failures.length===0&&!r.headerClipped));console.log(JSON.stringify({pages:results.length,textChecks:results.reduce((n,r)=>n+r.checked,0),failures:results.filter(r=>r.failures.length||r.headerClipped)}));
