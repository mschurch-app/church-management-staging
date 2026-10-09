import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=process.env.CHURCH_TEST_ORIGIN||'http://127.0.0.1:8769';
const out=new URL('./results/service-signup/',import.meta.url).pathname;
fs.mkdirSync(out,{recursive:true});
const initial=()=>({ok:true,binding_status:'approved',member:{id:101,name:'測試同工'},profile:{name:'不可用作登記姓名的 LINE 名称'},seasons:[{id:1,title:'2027 年第 1 季主日服事',starts_on:'2027-01-01',ends_on:'2027-03-31',slots:[
  {id:11,service_date:'2027-01-03',ministry_key:'media',role_key:'sound',capacity:1,registered_count:0},
  {id:12,service_date:'2027-01-10',ministry_key:'media',role_key:'sound',capacity:1,registered_count:1},
  {id:13,service_date:'2027-01-17',ministry_key:'worship',role_key:'worship_leader',capacity:1,registered_count:1},
  {id:14,service_date:'2027-01-03',ministry_key:'worship',role_key:'worship_leader',capacity:1,registered_count:0},
]}],registrations:[{id:1,slot_id:12,service_date:'2027-01-10',status:'registered'},{id:2,slot_id:13,service_date:'2027-01-17',status:'registered'}],change_requests:[]});
function mockJourney(data){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
  const years=[...new Set([2026,2027,...data.registrations.map(r=>Number(r.service_date.slice(0,4)))])];
  return{as_of:today,counting_rule:'confirmed_and_date_passed',years:years.map(year=>{
    const rows=data.registrations.filter(r=>Number(r.service_date.slice(0,4))===year),total=predicate=>new Set(rows.filter(predicate).map(r=>r.service_date)).size;
    return{year,completed_count:total(r=>r.status==='confirmed'&&r.service_date<today),registered_count:total(r=>['registered','confirmed'].includes(r.status)&&r.service_date>=today),waitlisted_count:total(r=>['waitlisted','offered'].includes(r.status)&&r.service_date>=today)};
  }),registration_details:data.registrations.map(r=>({id:r.id,role_key:data.seasons[0]?.slots.find(s=>s.id===r.slot_id)?.role_key||'sound',season_starts_on:data.seasons[0]?.starts_on||'2020-01-01',completed:r.status==='confirmed'&&r.service_date<today}))};
}
let fixture=initial(),writes=[],answers=[],dialogs=[],alerts=[],failMutation=false,failContent=0,failAfterWrite=false,delay=0;
const checks=[],errors=[];
let passed=false;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync'],userDataDir:out+'chrome'});
const page=await browser.newPage();
await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
await page.setBypassServiceWorker(true);
await page.evaluateOnNewDocument(()=>{sessionStorage.setItem('line-member-token:M+','synthetic-signup-token');sessionStorage.setItem('line-member-access-token:M+','synthetic-signup-access');});
await page.setRequestInterception(true);
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',async dialog=>{
  if(dialog.type()==='alert'){alerts.push(dialog.message());await dialog.accept();return;}
  dialogs.push({type:dialog.type(),message:dialog.message()});
  const answer=answers.shift();
  if(answer===undefined){errors.push('Unexpected dialog: '+dialog.message());await dialog.dismiss();return;}
  if(answer===false)await dialog.dismiss();else await dialog.accept(typeof answer==='string'?answer:undefined);
});
page.on('request',async req=>{
  const url=new URL(req.url());
  if(url.hostname.endsWith('supabase.co')){
    if(req.method()==='OPTIONS'){await req.respond({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'*'}});return;}
    const body=JSON.parse(req.postData()||'{}');let response=fixture,status=200;
    if(body.action==='content'){
      fixture.service_journey=fixture.journeyUnavailable?null:mockJourney(fixture);
      if(failContent>0){failContent--;status=503;response={ok:false,error:'unavailable'};}
    }else{
      writes.push(body);
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      if(failMutation){status=503;response={ok:false,error:'unavailable'};}
      else if(body.action==='service_signup_cancel'){
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date());
        const direct=today<fixture.seasons[0].starts_on;
        if(direct)fixture.registrations=fixture.registrations.filter(r=>r.id!==body.registrationId);
        else fixture.change_requests.push({registration_id:body.registrationId,status:'leader_review'});
        response={ok:true,direct};
      }else if(body.action==='service_signup_change_request'){
        fixture.change_requests.push({registration_id:body.registrationId,status:'leader_review'});response={ok:true};
      }else if(body.action==='service_signup_offer'){
        fixture.registrations.find(r=>r.id===body.registrationId).status='registered';response={ok:true};
      }else if(body.action==='service_signup_register_batch'){
        const registrations=body.choices.map((choice,index)=>{
          const slot=fixture.seasons[0].slots.find(s=>s.service_date===choice.service_date&&s.role_key===choice.role_key);
          return {id:100+index,slot_id:slot.id,service_date:slot.service_date,status:slot.registered_count>=slot.capacity?'waitlisted':'registered',queue_number:1};
        });fixture.registrations.push(...registrations);response={ok:true,member_name:fixture.member.name,registrations};
      }else{errors.push('Unexpected API action: '+body.action);response={ok:false,error:'unexpected_action'};status=400;}
      if(failAfterWrite&&!failMutation)failContent=1;
    }
    await req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)});return;
  }
  if(url.origin!==base&&url.protocol!=='data:'){await req.abort();return;}
  await req.continue();
});
const pause=()=>new Promise(resolve=>setTimeout(resolve,80));
async function visit({empty=false,started=false}={}){
  fixture=initial();if(empty)fixture.registrations=[];if(started)fixture.seasons[0].starts_on='2020-01-01';
  writes=[];answers=[];dialogs=[];alerts=[];failMutation=false;failContent=0;failAfterWrite=false;delay=0;
  await page.goto(base+'/service-signup.html',{waitUntil:'networkidle0'});await page.waitForFunction(()=>!document.querySelector('#app').hidden);
}
async function click(selector,queue=[]){
  answers.push(...queue);
  await page.$eval(selector,n=>n.scrollIntoView({block:'center'}));await pause();
  assert(await page.$eval(selector,n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),selector+' is covered');
  await page.click(selector);await pause();
}
async function list(){await page.waitForSelector('#registration-heading');assert.equal(await page.$('#member-name'),null);assert.equal(await page.$('[data-ministry]'),null);assert.equal(await page.$('.stepbar'),null);}
async function form(){await page.waitForSelector('#member-name');assert.equal(await page.$('.registration-list'),null);}
async function waitWrite(){await page.waitForFunction(()=>document.querySelector('#registration-heading')||document.querySelector('#member-name'));await pause();}
async function compose({full=false,multiple=false}={}){
  await form();await page.$eval('#member-name',n=>{n.value='測試同工';n.dispatchEvent(new Event('input'));});
  await click('[data-ministry=media]');if(multiple)await click('[data-ministry=worship]');
  await click('#next');await click('[data-role=sound]');if(multiple)await click('[data-role=worship_leader]');
  await click('#next');await click(`[data-date="${full?'2027-01-10':'2027-01-03'}"]`);
  if(multiple){await click('#next');assert(await page.$eval('[data-date="2027-01-03"]',n=>n.disabled));await click('[data-date="2027-01-17"]');}
  await click('#next');
}
async function test(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS',name);}
try{
  await visit();
  await test('existing registrations show member name in list header and hide wizard',async()=>{await list();assert.equal(await page.$eval('#registration-heading',n=>n.textContent),'測試同工');assert.equal(await page.$$eval('.registration',ns=>ns.length),2);});
  await test('LINE nickname is never used in the registrant header',async()=>assert(!(await page.$eval('#registration-heading',n=>n.textContent)).includes('LINE')));
  await test('reload returns to completed list',async()=>{await page.reload({waitUntil:'networkidle0'});await list();});
  await test('Grace Footprints displays selected-year cumulative and prepared counts',async()=>{assert.equal(await page.$eval('#journey-heading',n=>n.textContent),'恩典腳蹤');assert.equal(await page.$eval('#journey-year',n=>n.value),'2027');assert.deepEqual(await page.$$eval('.journey-counts strong',ns=>ns.map(n=>n.textContent.trim())),['0 次','2 次']);});
  await test('finish opens next steps and homepage return guidance without writing',async()=>{await click('#finish-registration');await page.waitForSelector('#completion-heading');assert.match(await page.$eval('.return-guide',n=>n.textContent),/2027 讓我們一起服事/);assert.match(await page.$eval('.return-guide',n=>n.textContent),/同一個 LINE 帳號/);assert.equal(await page.$eval('.home-link',n=>n.href),'https://mchurch.online/');assert.equal(await page.$('#add-registration'),null);assert.equal(writes.length,0);});
  await test('completion page returns directly to own editable list',async()=>{await click('#view-my-registration');await list();assert(await page.$('#modify-registration'));assert.equal(writes.length,0);});
  await test('declining add confirmation leaves list intact',async()=>{await click('#add-registration',[false]);await list();assert.equal(writes.length,0);});
  await test('confirmed add opens clean form with verified member name',async()=>{await click('#add-registration',[true]);await form();assert.equal(await page.$eval('#member-name',n=>n.value),'測試同工');assert.equal(await page.$('.choice.selected'),null);});
  await test('annual encouragement stays visible while editing',async()=>{assert(await page.$('.service-journey'));assert.match(await page.$eval('.service-journey',n=>n.textContent),/謝謝/);});
  await test('form can return to list without changing registrations',async()=>{await click('.list-return');await list();assert.equal(writes.length,0);});
  await test('declining delete performs no mutation',async()=>{await click('[data-cancel="1"]',[false]);await list();assert.equal(writes.length,0);assert.equal(fixture.registrations.length,2);});
  await test('delete then decline reselection keeps list closed and remaining row',async()=>{await click('[data-cancel="1"]',[true,false]);await waitWrite();await list();assert.equal(fixture.registrations.length,1);assert.equal(writes.length,1);assert.equal(dialogs.at(-1).message,'已刪除這筆登記。是否重新選擇服事與日期？');});
  await test('deleting final row can remain on named empty list',async()=>{await click('[data-cancel="2"]',[true,false]);await waitWrite();await list();assert.match(await page.$eval('.empty',n=>n.textContent),/目前沒有/);assert.equal(await page.$eval('#registration-heading',n=>n.textContent),'測試同工');});
  await test('empty list can reopen wizard explicitly',async()=>{await click('#add-registration',[true]);await form();});
  await visit();
  await test('delete then accept reselection opens the wizard',async()=>{await click('[data-cancel="1"]',[true,true]);await waitWrite();await form();assert.equal(fixture.registrations.length,1);assert.equal(writes.length,1);});
  await visit();
  await test('declining modify retains original row and list',async()=>{await click('[data-adjust="1"]',[false]);await list();assert.equal(writes.length,0);assert.equal(fixture.registrations.length,2);});
  await test('modify uses one confirmation and opens wizard after successful cancellation',async()=>{dialogs=[];await click('[data-adjust="1"]',[true]);await waitWrite();await form();assert.equal(dialogs.length,1);assert.equal(writes.length,1);assert.match(dialogs[0].message,/先刪除這筆登記/);assert.equal(fixture.registrations.length,1);});
  await visit();failMutation=true;
  await test('failed modification preserves original list and does not open wizard',async()=>{await click('[data-adjust="1"]',[true]);await waitWrite();await list();assert.equal(fixture.registrations.length,2);assert.equal(alerts.length,1);});
  await test('failed operation releases busy guard for retry',async()=>{failMutation=false;await click('[data-adjust="1"]',[true]);await waitWrite();await form();assert.equal(writes.length,2);});
  await visit();failAfterWrite=true;
  await test('successful delete with failed refresh blocks duplicate writes and retains recovery',async()=>{await click('[data-cancel="1"]',[true]);await waitWrite();await list();assert(await page.$('#refresh-list'));assert(await page.$eval('[data-cancel="1"]',n=>n.disabled));assert(await page.$eval('#add-registration',n=>n.disabled));assert.match(await page.$eval('.list-feedback',n=>n.textContent),/已刪除/);assert.equal(dialogs.length,1);});
  await test('refresh retries content only and restores remaining row',async()=>{await click('#refresh-list');await list();assert.equal(writes.length,1);assert.equal(await page.$$eval('.registration',ns=>ns.length),1);assert.equal(await page.$('#refresh-list'),null);});
  await visit({empty:true});
  await test('first registration starts with mandatory name and ministry selection',async()=>{await form();assert(await page.$eval('#next',n=>n.disabled));assert.equal(await page.$('.list-return'),null);});
  await compose({multiple:true});
  await test('guided multi-role dates still prohibit two services on the same Sunday',async()=>{assert.equal(await page.$$eval('.summary article',ns=>ns.length),2);assert.match(await page.$eval('.identity-summary',n=>n.textContent),/測試同工/);});
  await test('batch completion shows named list and closes upper form',async()=>{await click('#submit');await waitWrite();await list();assert.equal(writes.filter(w=>w.action==='service_signup_register_batch').length,1);assert.equal(fixture.registrations.length,2);assert.match(await page.$eval('.list-feedback',n=>n.textContent),/已完成 2 筆/);});
  await visit({empty:true});await compose({full:true});
  await test('waitlisted completion keeps queue status on list',async()=>{await click('#submit');await waitWrite();await list();assert.match(await page.$eval('.registration-list',n=>n.textContent),/候補第 1 位/);assert.match(await page.$eval('.list-feedback',n=>n.textContent),/1 筆為候補/);});
  await visit({empty:true});await compose();failMutation=true;
  await test('failed submit retains selected name and dates and enables retry',async()=>{await click('#submit');await page.waitForFunction(()=>!document.querySelector('#submit').disabled);assert.match(await page.$eval('.identity-summary',n=>n.textContent),/測試同工/);assert.equal(await page.$$eval('.summary article',ns=>ns.length),1);assert.equal(fixture.registrations.length,0);});
  await test('submission can succeed after previous failure',async()=>{failMutation=false;await click('#submit');await waitWrite();await list();assert.equal(fixture.registrations.length,1);});
  await visit({empty:true});await compose();failAfterWrite=true;
  await test('saved submission with failed refresh prevents resubmitting batch',async()=>{await click('#submit');await waitWrite();await list();assert(await page.$('#refresh-list'));assert.match(await page.$eval('.list-feedback',n=>n.textContent),/已完成 1 筆/);await click('#refresh-list');await list();assert.equal(writes.length,1);assert.equal(fixture.registrations.length,1);});
  await visit({started:true});
  await test('in-season cancellation remains a review request and retains original row',async()=>{await click('[data-cancel="1"]',[true]);await waitWrite();await list();assert.equal(dialogs.length,1);assert.equal(fixture.registrations.length,2);assert.match(await page.$eval('.registration-list',n=>n.textContent),/等待服事領袖初審/);assert.equal(await page.$('[data-cancel="1"]'),null);});
  await test('in-season modification preserves request and leader review workflow',async()=>{await click('[data-adjust="2"]',['希望改為下一週音控']);await waitWrite();await list();assert.equal(writes.at(-1).action,'service_signup_change_request');assert.equal(writes.at(-1).note,'希望改為下一週音控');assert.equal(fixture.registrations.length,2);});
  await visit();fixture.registrations[0].status='offered';fixture.registrations[0].offer_expires_at='2027-01-01T12:00:00Z';await page.reload({waitUntil:'networkidle0'});
  await test('offered place acceptance remains available from list',async()=>{await click('[data-offer="1"]');await waitWrite();await list();assert.equal(writes.at(-1).action,'service_signup_offer');assert.equal(fixture.registrations[0].status,'registered');});
  await visit();delay=300;
  await test('rapid repeated modify clicks issue one cancellation',async()=>{answers.push(true);await page.$eval('[data-adjust="1"]',n=>{n.click();n.click();});await page.waitForSelector('#member-name');assert.equal(writes.length,1);assert.equal(dialogs.length,1);});
  await visit();
  for(const width of [375,390,430,1280,1440]){
    await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});
    await page.waitForSelector('#registration-heading');
    await test('list layout and touch targets at '+width+'px',async()=>{
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      assert(await page.$$eval('#app button',ns=>ns.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
    });
    if([390,1440].includes(width))await page.screenshot({path:out+'list-'+width+'.png',fullPage:true});
  }
  await click('#finish-registration');
  for(const width of [375,390,430,1280,1440]){
    await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});
    await page.waitForFunction(()=>!document.querySelector('#app').hidden);
    if(await page.$('#finish-registration'))await click('#finish-registration');
    await page.waitForSelector('#completion-heading');
    await test('completion layout and return controls at '+width+'px',async()=>{
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      assert(await page.$$eval('.completion-actions a,.completion-actions button,#journey-year',ns=>ns.length===3&&ns.every(n=>{const r=n.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
      assert.equal(await page.$('#member-name'),null);
    });
    if([390,1440].includes(width))await page.screenshot({path:out+'completion-'+width+'.png',fullPage:true});
  }
  await click('#view-my-registration');
  await test('list text and buttons meet 4.5:1 contrast',async()=>{
    const failures=await page.evaluate(()=>{
      const rgb=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return[n[0],n[1],n[2],n[3]??1];};
      const blend=(top,bottom)=>top.slice(0,3).map((v,i)=>v*top[3]+bottom[i]*(1-top[3]));
      const background=node=>{if(!node)return[255,255,255];return blend(rgb(getComputedStyle(node).backgroundColor),background(node.parentElement));};
      const luminance=color=>color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      return [...document.querySelectorAll('.registration-panel h2,.registration-panel p,.registration-header small,.registration-count,.registration strong,.registration small,.registration button,#add-registration,#finish-registration,.journey-counts span,.journey-note')].flatMap(node=>{
        const bg=background(node),fg=blend(rgb(getComputedStyle(node).color),bg),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        return ratio<4.5?[{text:node.textContent,ratio}]:[];
      });
    });assert.deepEqual(failures,[]);
  });
  await test('year switch reads history and preserves registration list',async()=>{
    fixture.registrations.push({id:3,slot_id:11,service_date:'2026-01-04',status:'confirmed'});await page.reload({waitUntil:'networkidle0'});await page.select('#journey-year','2026');
    assert.equal(await page.$eval('.journey-counts strong',n=>n.textContent.trim()),'1 次');assert.match(await page.$eval('.service-journey>p',n=>n.textContent),/1 次/);await list();assert.equal(await page.$('[data-adjust="3"]'),null);
  });
  await test('no open season still shows own records and cumulative history',async()=>{fixture.seasons=[];await page.reload({waitUntil:'networkidle0'});await list();assert.match(await page.$eval('.registration-panel',n=>n.textContent),/目前尚未開放/);assert(await page.$eval('#add-registration',n=>n.disabled));assert(await page.$('.service-journey'));});
  await visit();fixture.journeyUnavailable=true;await page.reload({waitUntil:'networkidle0'});
  await test('unavailable annual API never fabricates zero or blocks registration list',async()=>{await list();assert.match(await page.$eval('.service-journey',n=>n.textContent),/暫時無法載入/);assert.equal(await page.$('.journey-counts'),null);assert(await page.$('[data-adjust="1"]'));});
  await test('name header escapes markup',async()=>{fixture.member.name='<b>測試姓名</b>';await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('#registration-heading',n=>n.textContent),fixture.member.name);assert.equal(await page.$('#registration-heading b'),null);});
  await test('no unexpected dialogs or uncaught browser errors',async()=>{assert.deepEqual(answers,[]);assert.deepEqual(errors,[]);});
  fs.writeFileSync(out+'checks.json',JSON.stringify({status:'passed',checks,errors,environment:{browser:await browser.version(),data:'synthetic fixtures; all remote requests intercepted; no production writes',devices:'Chrome viewport simulation, real iPhone / Mac Safari not covered'}},null,2));
  console.log('TOTAL',checks.length);
  passed=true;
}catch(error){await page.screenshot({path:out+'failure.png',fullPage:true});throw error;}
finally{
  // Limit Chrome teardown after assertions; close only this run's browser.
  let shutdown;
  await Promise.race([browser.close(),new Promise(resolve=>{shutdown=setTimeout(resolve,5000);})]);
  clearTimeout(shutdown);browser.disconnect();browser.process()?.kill('SIGTERM');
  // Puppeteer may retain protocol timers after its Chrome process has ended.
  if(passed)process.exit(0);
}
