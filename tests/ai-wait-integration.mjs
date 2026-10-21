import {spawn} from 'node:child_process';
import {chromium} from '/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {emptyDraft} from '../sermon-preparation-contract.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const server=spawn(process.execPath,['tests/sermon-preparation-preview.mjs'],{stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Preview exited '+code)));});
let browser;const checks=[];
try{browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
for(const [device,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]){
const page=await browser.newPage({viewport});let jobs=[],enqueueCount=0,fail=false;
let project={id:'00000000-0000-4000-8000-000000000001',title:'隔離驗收',scripture:'詩篇23篇',speaker:'測試講員',version:1,backup_version:1};let payload=emptyDraft({title:project.title,scripture:project.scripture,speaker:project.speaker,service_date:''});
await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname!=='/fixture-api')return route.continue();const input=route.request().postDataJSON();let data={};if(input.action==='list')data={items:[project],worker:{online:true}};if(input.action==='load'){if(fail)return route.fulfill({status:503,json:{ok:false}});data={project,payload,jobs,versions:[]};}if(input.action==='save'){payload=input.payload;project.version++;data={project,payload};}if(input.action==='enqueue'){enqueueCount++;const job={id:'test-job',kind:input.kind,status:'queued',base_version:project.version};jobs=[job];data={job};}return route.fulfill({json:{ok:true,...data}});});
await page.goto('http://127.0.0.1:8770/sermon-preparation.html?church=M%2B&project='+project.id);await page.waitForSelector('#workspace:visible');
await page.locator('[data-step="outline"]').click();await page.locator('#generate-outline').click();await page.waitForSelector('[data-job-progress="test-job"]');assert.equal(enqueueCount,1);assert.match(await page.locator('#ai-job-progress').textContent(),/已排隊，請稍候/);checks.push(device+': actual information page enqueues once and shows top progress');
jobs[0].status='running';jobs[0].progress='AI 正在整理大綱';await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#ai-job-progress').textContent.includes('產生中，請稍候'));assert.equal(enqueueCount,1);checks.push(device+': reopening project restores running status without new enqueue');
jobs[0].status='completed';jobs[0].result={outline:['觀察','解釋','應用']};await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#ai-job-progress').textContent.includes('完成 100%'));assert.match(await page.locator('#jobs').textContent(),/觀察/);assert.equal(await page.locator('#outline').inputValue(),'');checks.push(device+': confirmed result shows 100% and awaits deliberate adoption');await page.screenshot({path:'docs/reports/2026-10-21-ai-wait/'+device+'-page.png',fullPage:true});await page.close();
}
await writeFile('docs/reports/2026-10-21-ai-wait/integration-results.json',JSON.stringify({checks,production_writes:false},null,2));console.log(JSON.stringify(checks,null,2));
}finally{await browser?.close();server.kill();}
