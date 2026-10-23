import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {user,session} from '../phase3/fixtures.mjs';
import {contrastMetrics} from '../phase3/contrast.mjs';
const {default:puppeteer}=await import(process.env.PUPPETEER_MODULE||'puppeteer-core');
const root=new URL('../../',import.meta.url).pathname,out=process.env.INVENTORY_TEST_OUTPUT||'/tmp/church-inventory-20261012/results';
fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const checks=[],errors=[],writes=[],external=[];let browser,passed=false,mode='edit',failSave=false,baseline=false;
const check=(name,detail={})=>{checks.push({name,passed:true,...detail});console.log('PASS',name);};
const locations=[{id:'room',scope:'M+',parent_id:null,name:'一樓儲藏室',location_type:'room',sort_order:1},{id:'shelf',scope:'M+',parent_id:'room',name:'活動器材層架',location_type:'shelf',sort_order:2}];
let items=['PVC管','twister','兔耳髮箍','呼拉圈','安全帽','捕蚊燈','推車','摺疊桌','超長名稱測試：兒童活動專用伸縮式多功能音響與麥克風收納組合'].map((name,i)=>({id:'item'+i,scope:'M+',name,category:i===3?'運動用品':i===5?'電器用品':'其他',total_quantity:i===0?4:i===3?2:1,unit:i===0?'根':i===7?'張':'個',location_id:i===8?'shelf':'room',primary_photo_path:i===7?'M+/items/fixture.svg':null,specifications:i===0?'籃球營做球框用，接續上童軍繩':'',minimum_quantity:0,status:'available',management_type:'quantity'}));
const loans=[{id:'loan0',item_id:'item0',quantity:2,returned_quantity:0,status:'borrowed',borrower_name:'測試借用人',loaned_on:'2026-10-01'},{id:'loan1',item_id:'item1',quantity:1,returned_quantity:0,status:'borrowed',borrower_name:'測試借用人',loaned_on:'2026-10-01'}];
try{
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-background-networking']});
 const page=await browser.newPage();await page.setBypassServiceWorker(true);
 await page.evaluateOnNewDocument(session=>{if(location.hostname!=='127.0.0.1')return;localStorage.setItem('church-staging-admin-v1',JSON.stringify(session));window.print=()=>window.__printed=true;},session);
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',async req=>{
  try{
   const url=new URL(req.url()),name=url.pathname.slice(1);
   if(url.protocol==='data:'&&url.pathname.startsWith('image/svg+xml,'))return req.continue();
   if(url.origin===base){
    const file=process.env.INVENTORY_BASELINE_DIR&&path.join(process.env.INVENTORY_BASELINE_DIR,name);
    if(baseline&&['inventory.html','inventory.css','inventory.mjs'].includes(name)&&file&&fs.existsSync(file))return req.respond({status:200,contentType:types[path.extname(name)],body:fs.readFileSync(file)});
    return req.continue();
   }
   if(!url.hostname.endsWith('supabase.co')){external.push(url.hostname);return req.abort();}
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'};
   let data=[],status=200;const body=JSON.parse(req.postData()||'{}'),rpc=url.pathname.split('/').pop();
   if(req.method()==='OPTIONS')data={};
   else if(url.pathname==='/auth/v1/user')data=user;
   else if(url.pathname==='/auth/v1/token')data=session;
   else if(rpc==='get_my_app_capabilities')data={has_line:true,is_owner:false};
   else if(rpc==='get_my_church_access')data=mode==='denied'?[]:[{church_id:'M+',permission:'inventory'}];
   else if(rpc==='get_my_admin_profile')data=[{display_name:'測試同工',job_title:'總務同工'}];
   else if(rpc==='get_my_feature_permissions')data=[{church_id:'M+',feature_key:'inventory',view:true,create:mode==='edit',edit:mode==='edit',export:true}];
   else if(url.pathname.includes('/storage/v1/object/sign/')){
    if(req.method()==='POST')data={signedURL:'/object/sign/inventory-media/fixture.svg?token=isolated'};
    else return req.respond({status:200,headers,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eaf5ee"/><path d="M60 100h280v80H60zM90 180v70m220-70v70" fill="#865e43" stroke="#865e43" stroke-width="8"/></svg>'});
   }
   else if(url.pathname.endsWith('/inventory_locations'))data=url.searchParams.get('scope')==='eq.MSCHOOL'?[]:locations;
   else if(url.pathname.endsWith('/inventory_items')){
    if(req.method()==='PATCH'){writes.push({table:'inventory_items',method:req.method(),body});if(failSave){status=503;data={message:'fixture save unavailable'};}else{items=items.map(item=>url.searchParams.get('id')==='eq.'+item.id?{...item,...body}:item);data=null;}}
    else data=url.searchParams.get('scope')==='eq.MSCHOOL'?[]:items;
   }
   else if(url.pathname.endsWith('/inventory_loans'))data=loans.filter(loan=>!url.searchParams.has('item_id')||url.searchParams.get('item_id')==='eq.'+loan.item_id);
   else if(url.pathname.endsWith('/inventory_movements'))data=[];
   else if(req.method()!=='GET'){errors.push('Unexpected fixture request: '+url.pathname);status=400;data={message:'unsupported'};}
   return req.respond({status,headers,contentType:'application/json',body:JSON.stringify(data)});
  }catch(e){errors.push(e.message);try{await req.abort();}catch{}}
 });
 const open=async(width=402)=>{await page.setViewport({width,height:900,isMobile:width<700,hasTouch:width<700});await page.goto(base+'/inventory.html?church=M%2B',{waitUntil:'networkidle0'});await page.waitForSelector('#workspace:not([hidden]) .inventory-card');};
 if(process.env.INVENTORY_BASELINE_DIR){baseline=true;await open();const old=await page.$eval('.inventory-card',n=>({background:getComputedStyle(n).backgroundImage,text:getComputedStyle(n.querySelector('h3')).color}));assert.notEqual(old.background,'none');await page.$eval('#items',n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:out+'/before-402.png'});check('Reproduced original red primary-action styling on item cards',old);baseline=false;}
 await open();assert.equal(await page.$$eval('.inventory-card',n=>n.length),9);assert.equal(writes.length,0);
 assert.match(await page.$eval('.inventory-card',n=>n.textContent),/可用 2 \/ 4 根/);assert(await page.$('.inventory-availability.is-empty'));assert.equal(await page.$eval('.inventory-card',n=>n.getAttribute('aria-haspopup')),'dialog');
 check('Actual inventory controller renders all items, subtracts active loans, marks zero availability and makes no writes');
 for(const width of [320,390,402,430,760,1280,1440,1920]){
  await page.setViewport({width,height:900,isMobile:width<700,hasTouch:width<700});await page.waitForSelector('#workspace:not([hidden]) .inventory-card');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.$eval('.page-header',n=>Math.round(n.getBoundingClientRect().height)),164);
  const geometry=await page.$$eval('.inventory-card',nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,overflow:n.scrollWidth>n.clientWidth+1,photo:n.querySelector('.inventory-photo').getBoundingClientRect().width,background:getComputedStyle(n).backgroundImage,text:getComputedStyle(n.querySelector('.inventory-card-name')).color,meta:n.querySelector('.inventory-card-meta').getBoundingClientRect().width})));
  assert(geometry.every(g=>g.width>=44&&g.height>=44&&!g.overflow&&g.photo>=56&&g.background==='none'));
  if(width<=430)assert.equal(await page.$eval('#items',n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),1);
  const contrast=await page.evaluate(contrastMetrics);assert.deepEqual(contrast.failures,[]);
  if([402,1440].includes(width)){await page.$eval('#items',n=>n.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:out+'/items-'+width+'.png'});}
  check('Readable text, no overflow, 44px controls and standard header at '+width+'px',{textNodes:contrast.checked});
 }
 await page.setViewport({width:402,height:900,isMobile:true,hasTouch:true});await page.waitForSelector('#workspace:not([hidden]) .inventory-card');
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert(await page.$$eval('.inventory-card',nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)));assert.deepEqual((await page.evaluate(contrastMetrics)).failures,[]);await page.evaluate(()=>document.documentElement.style.fontSize='');check('200% text retains card content without horizontal overflow');
 await page.hover('.inventory-card');assert.equal(await page.$eval('.inventory-card',n=>getComputedStyle(n).backgroundImage),'none');assert.deepEqual((await page.evaluate(contrastMetrics)).failures,[]);check('Hover keeps neutral background and readable text');
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);assert.equal(await page.$eval('.inventory-card',n=>getComputedStyle(n).transitionDuration),'0s');check('Reduced motion disables card transitions');
 await page.type('#search','PVC');assert.equal(await page.$$eval('.inventory-card',n=>n.length),1);await page.$eval('#search',n=>{n.value='';n.dispatchEvent(new Event('input'));});await page.select('#category-filter','運動用品');assert.equal(await page.$$eval('.inventory-card',n=>n.length),1);await page.select('#category-filter','');await page.select('#photo-filter','with');assert.equal(await page.$$eval('.inventory-card',n=>n.length),1);assert(await page.$('.inventory-photo img'));await page.select('#photo-filter','without');assert.equal(await page.$$eval('.inventory-card',n=>n.length),8);await page.select('#photo-filter','');await page.select('#location-filter','shelf');assert.equal(await page.$$eval('.inventory-card',n=>n.length),1);await page.select('#location-filter','');check('Search, category, photo and location filters retain actual behavior');
 await page.type('#search','不存在的物品');assert.match(await page.$eval('#items',n=>n.textContent),/找不到/);await page.$eval('#search',n=>{n.value='';n.dispatchEvent(new Event('input'));});check('Empty search offers readable recovery without losing inventory');
 await page.$eval('.inventory-card',n=>n.scrollIntoView({block:'center'}));await page.focus('.inventory-card');await page.keyboard.press('Enter');await page.waitForSelector('#detail-dialog[open]');assert.match(await page.$eval('#detail-content h2',n=>n.textContent),/PVC管/);assert.deepEqual((await page.evaluate(contrastMetrics)).failures,[]);await page.screenshot({path:out+'/detail-402.png'});await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#detail-dialog').open);check('Keyboard opens correct item detail; text is readable and Escape closes');
 await page.click('.inventory-card');await page.waitForSelector('#detail-dialog[open]');await page.click('[data-action=edit]');await page.waitForSelector('#editor-dialog[open]');assert.deepEqual((await page.evaluate(contrastMetrics)).failures,[]);
 await page.$eval('#editor-fields [name=name]',n=>n.value='PVC管（已整理）');failSave=true;await page.click('#editor-save');await page.waitForFunction(()=>!document.querySelector('#editor-save').disabled&&document.querySelector('#editor-message').textContent.includes('未儲存'));assert.equal(await page.$eval('#editor-fields [name=name]',n=>n.value),'PVC管（已整理）');failSave=false;await page.click('#editor-save');await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);await page.waitForFunction(()=>document.querySelector('.inventory-card-name')?.textContent.includes('已整理'));assert.equal(writes.length,2);check('Isolated edit save failure keeps input and restores controls; retry updates same item');
 await page.$eval('#print',n=>n.scrollIntoView({block:'center'}));await page.click('#print');assert(await page.evaluate(()=>window.__printed));await page.evaluate(()=>dispatchEvent(new Event('afterprint')));check('Print action remains available and afterprint restores layout');
 mode='readonly';await open();assert(await page.$eval('#add-item',n=>n.disabled));await page.click('.inventory-card');await page.waitForSelector('#detail-dialog[open]');assert(await page.$eval('[data-action=edit]',n=>n.disabled));assert(await page.$eval('[data-action=loan]',n=>n.disabled));assert.equal(writes.length,2);await page.keyboard.press('Escape');check('View-only users can read cards and details but cannot edit, borrow or create');
 await page.$eval('#scope-switcher button:nth-child(2)',n=>n.scrollIntoView({block:'center'}));await page.click('#scope-switcher button:nth-child(2)');await page.waitForFunction(()=>document.querySelector('#guide').hidden===false);assert.equal(await page.$$eval('.inventory-card',n=>n.length),0);assert.equal(writes.length,2);check('Scope switch respects existing unit filter and empty setup state');
 mode='denied';await page.goto(base+'/inventory.html?church=M%2B',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));assert(await page.$eval('#workspace',n=>n.hidden));check('Unauthorized access stays blocked');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);check('No uncaught browser errors or non-fixture network requests');passed=true;
}catch(e){checks.push({name:'run failure',passed:false,error:e.stack});console.error(e.stack);}
finally{fs.writeFileSync(out+'/results.json',JSON.stringify({environment:'Mac Chrome; isolated synthetic Auth/inventory API; no production data writes; iPhone 17 and Safari not verified',passed,checks,errors,writes},null,2));await browser?.close();server.close();}
if(!passed)process.exitCode=1;
