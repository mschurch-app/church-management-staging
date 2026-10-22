import assert from 'node:assert/strict';import fs from 'node:fs';
import {session,user,permissions,weekly} from './phase3/fixtures.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769',out=new URL('./phase4/results/header/',import.meta.url);fs.mkdirSync(out,{recursive:true});const checks=[];
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch(engine==='chromium'?{headless:true,executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{headless:true});
 try{for(const church of ['M+','SHiNE'])for(const file of ['church-settings.html','weekly-bulletin-review.html','website-maintenance.html']){
  const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});await context.addInitScript(s=>localStorage.setItem('church-staging-admin-v1',JSON.stringify(s)),session);
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();if(!url.hostname.endsWith('supabase.co'))return route.abort();let body={};try{body=request.postDataJSON()||{};}catch{}let data=[];
   if(url.pathname==='/auth/v1/user')data=user;else if(url.pathname==='/auth/v1/token')data=session;
   else if(url.pathname.endsWith('/get_my_church_access'))data=permissions.map(permission=>({church_id:church,permission}));
   else if(url.pathname.endsWith('/get_my_feature_permissions'))data=permissions.map(feature_key=>({church_id:church,feature_key,view:true,edit:true,create:true,manage:true,approve:true}));
   else if(url.pathname.endsWith('/get_my_app_capabilities'))data={is_owner:true,has_line:true};
   else if(url.pathname.endsWith('/get_my_admin_profile'))data=[{display_name:'合成測試同工',job_title:'測試管理人員'}];
   else if(url.pathname.endsWith('/get_my_home_preferences'))data={home_modules:[]};
   else if(url.pathname.endsWith('/church_customizations'))data={church_id:church,feature_modules:[],welcome_fields:[],catalogs:{},version:1};
   else if(url.pathname.endsWith('/church_public_settings'))data={church_id:church,brand_color:'#AD3C2A',logo_url:'',service_info:'合成測試'};
   else if(url.pathname.endsWith('/website_weekly_bulletins'))data=weekly().map(r=>({...r,church_id:church}));
   else if(url.pathname.includes('/functions/'))data={ok:true,items:[],promo:null,settings:{},people:[],jobs:[]};
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  });
  const page=await context.newPage();await page.goto(origin+'/'+file+'?church='+encodeURIComponent(church));await page.waitForFunction(()=>document.querySelector('link[data-app-consistency]')?.sheet);
  for(const width of [375,390,430,1280,1440,1920]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.documentElement.style.fontSize='16px');await page.waitForFunction(()=>!document.documentElement.classList.contains('app-large-text'));
   const measure=()=>page.evaluate(()=>{const h=document.querySelector('.page-header'),r=h.getBoundingClientRect(),visible=[...h.querySelectorAll('h1,.admin-identity,button,a.secondary')].filter(n=>n.getClientRects().length);return{height:r.height,overflow:document.documentElement.scrollWidth>innerWidth+1,short:visible.filter(n=>n.matches('button,a.secondary')&&(n.getBoundingClientRect().height<43.5||n.getBoundingClientRect().width<43.5)).length,clipped:visible.filter(n=>n.getBoundingClientRect().bottom>r.bottom+1).length,controls:visible.filter(n=>n.matches('button,a.secondary')).map(n=>({id:n.id,rect:n.getBoundingClientRect().toJSON(),minHeight:getComputedStyle(n).minHeight,minWidth:getComputedStyle(n).minWidth})),titleSize:parseFloat(getComputedStyle(h.querySelector('h1')).fontSize)};});
   const normal=await measure();assert.equal(normal.height,164,JSON.stringify({engine,church,file,width,normal}));assert(!normal.overflow&&normal.short===0&&normal.clipped===0,JSON.stringify({engine,church,file,width,normal}));checks.push({engine,church,file,width,mode:'normal',...normal});
   if([390,1440].includes(width)){await page.evaluate(()=>document.documentElement.style.fontSize='32px');await page.waitForFunction(()=>document.documentElement.classList.contains('app-large-text'));const large=await measure();assert(large.height>=164&&!large.overflow&&large.short===0&&large.clipped===0&&large.titleSize>=40,JSON.stringify({engine,church,file,width,large}));checks.push({engine,church,file,width,mode:'200-percent',...large});await page.screenshot({path:new URL(engine+'-'+encodeURIComponent(church)+'-'+file+'-'+width+'.png',out).pathname});}
  }
  await context.close();console.log('PASS',engine,church,file,'normal and large text');
 }}finally{await browser.close();}
}
fs.writeFileSync(new URL('checks.json',out),JSON.stringify({checks,realIphone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
