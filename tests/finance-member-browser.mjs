import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const base = 'http://127.0.0.1:8778';
const root = new URL('../', import.meta.url).pathname;
const out = path.join(root, 'docs/reports/2026-10-22-finance-members');
fs.mkdirSync(out, { recursive: true });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {} };
const second = '22222222-2222-4222-8222-222222222222';
const session = { access_token: 'test.token.signature', refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const roleAccounts = [{ userId: user.id, name: '測試同工甲', title: '行政', roles: [] }, { userId: second, name: '測試同工乙', title: '師母', roles: [] }];
let entryAllowed=true;
let failNextRoleAssignment = false, failNextWorkers = false, failNextAccounts = false;
const server = spawn(process.execPath, ['tests/serve.mjs'], { cwd: root, env: { ...process.env, CHURCH_TEST_PORT: '8778' }, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  setTimeout(() => reject(new Error('server_timeout')), 5000);
});
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run','--no-default-browser-check','--disable-background-networking'], userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'finance-cash-browser-')) });
  const page = await browser.newPage();page.on('dialog',dialog=>dialog.accept());
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.evaluateOnNewDocument(session => localStorage.setItem('church-staging-admin-v1', JSON.stringify(session)), session);
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.hostname.endsWith('supabase.co')) {
      let body = {};
      try { body = JSON.parse(request.postData() || '{}'); } catch {}
      let data = [];
      if (url.pathname === '/auth/v1/user') data = user;
      else if (url.pathname === '/auth/v1/token') data = session;
      else if (url.pathname.includes('/functions/v1/finance-cash')) {
        if(body.action==='members'){
          await new Promise(r=>setTimeout(r,body.search==='慢查'?700:80));
          if(body.search==='錯誤')data={ok:false,code:'service_unavailable'};
          else data={ok:true,members:body.search==='沒有'?[]:body.search==='待編號'?[{id:3,name:'待編號',phone:'0900000003',offeringCode:''}]:body.search==='同名'?[{id:4,name:'同名',phone:'0900000004',offeringCode:'0004'},{id:5,name:'同名',phone:'0900000005',offeringCode:'0005'}]:[{id:body.search==='新名'?2:1,name:body.search,phone:'0900000001',offeringCode:body.search==='新名'?'0002':'0013'}]};
        } else if (body.action === 'assign_role') {
          await new Promise(resolve => setTimeout(resolve, 250));
          if (failNextRoleAssignment) { failNextRoleAssignment = false; data = { ok: false, code: 'service_unavailable' }; }
          else {
            const account = roleAccounts.find(item => item.userId === body.userId);
            if (account) account.roles = body.enabled ? [...new Set([...account.roles,body.role])] : account.roles.filter(role => role !== body.role);
            data = { ok: true };
          }
        } else if (body.action === 'workers' && failNextWorkers) {
          failNextWorkers = false; data = { ok: false, code: 'service_unavailable' };
        } else if (body.action === 'accounts' && failNextAccounts) {
          failNextAccounts = false; data = { ok: false, code: 'service_unavailable' };
        } else data = ({
          profile: { ok: true, roles:entryAllowed?['entry','cash_verify','approve']:['approve'], owner: true },
          workers: { ok: true, workers: [{ userId: user.id, name: '測試同工甲' }, { userId: second, name: '測試同工乙' }] },
          list: { ok: true, batches: [] },
          accounts: { ok: true, accounts: roleAccounts },
          members: { ok: true, members: [{ id: 1, name: '王小明', phone: '0900000000', offeringCode: '0013' }] }
        })[body.action] || { ok: false, code: 'invalid_request' };
      } else if (url.pathname.includes('/rpc/get_my_app_capabilities')) data = { is_owner: true };
      else if (url.pathname.includes('/rpc/')) data = [];
      else if (url.pathname.includes('/church_public_settings')) data = { church_id: 'M+', name: '測試教會' };
      await request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(data) });
      return;
    }
    if (url.origin !== base && url.protocol !== 'data:') { await request.abort(); return; }
    await request.continue();
  });
  const query='.finance-member-query';
  async function type(value){await page.$eval(query,(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
  for(const width of [1440,390]){
    await page.setViewport({width,height:900});await page.goto(base+'/finance-cash.html',{waitUntil:'networkidle0'});await page.waitForSelector('#finance-app:not([hidden])');await page.click('#new-batch');
    await type('王小明');await page.waitForFunction(()=>document.querySelector('.finance-search-results')?.textContent.includes('正在查找'));await page.waitForSelector('.finance-search-results button');
    assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('尚未連結'));await page.click('.finance-search-results button');
    assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('0013'));assert.equal(await page.$eval('input[type=tel]',n=>n.value),'0900000001');
    await type('新名');assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('尚未連結'));assert.equal(await page.$eval('input[type=tel]',n=>n.value),'');await page.waitForSelector('.finance-search-results button');await page.click('.finance-search-results button');assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('0002'));
    await type('沒有');await page.waitForFunction(()=>document.querySelector('.finance-search-results')?.textContent.includes('沒有找到'));assert.equal(await page.$eval(query,n=>n.value),'沒有');
    await type('錯誤');await page.waitForSelector('.finance-member-error');assert.equal(await page.$eval(query,n=>n.value),'錯誤');
    await type('待編號');await page.waitForSelector('.finance-search-results button');await page.click('.finance-search-results button');assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('已連結'));assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('待補'));assert.ok(await page.$('.finance-code-assignment'));
    await type('同名');assert.equal(await page.$('.finance-code-assignment'),null);await page.waitForFunction(()=>document.querySelectorAll('.finance-search-results button').length===2);assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('尚未連結'));const buttons=await page.$$('.finance-search-results button');await buttons[1].click();assert.ok((await page.$eval('.finance-member-state',n=>n.textContent)).includes('0005'));
    await type('慢查');await new Promise(r=>setTimeout(r,400));await type('新名');await page.waitForSelector('.finance-search-results button');await new Promise(r=>setTimeout(r,500));assert.equal(await page.$eval('.finance-search-results button',n=>n.textContent.includes('新名')),true);
    await page.$eval(query,el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));await type('輸入中');await new Promise(r=>setTimeout(r,500));assert.equal(await page.$$('.finance-search-results button').then(x=>x.length),0);await page.$eval(query,el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.waitForSelector('.finance-search-results button');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(out,'member-search-'+width+'.png'),fullPage:true});
  }
  entryAllowed=false;await page.goto(base+'/finance-cash.html',{waitUntil:'networkidle0'});await page.waitForSelector('#finance-app:not([hidden])');assert.equal(await page.$eval('#new-batch',n=>n.hidden),true);await page.click('[data-tab="editor"]');assert.ok((await page.$eval('#editor-state',n=>n.textContent)).includes('唯讀'));assert.equal(await page.$$eval('#cash-form input,#cash-form select,#cash-form button',nodes=>nodes.every(n=>n.disabled)),true);assert.equal(await page.$eval('#add-donor',n=>n.disabled),true);assert.equal(await page.$eval('#add-anonymous',n=>n.disabled),true);
  entryAllowed=true;roleAccounts[0].roles=['entry'];roleAccounts[0].inheritedRoles=['entry'];roleAccounts[0].legacyEntry=false;await page.goto(base+'/finance-cash.html',{waitUntil:'networkidle0'});await page.waitForSelector('#finance-app:not([hidden])');await page.click('#roles-tab');const inherited='input[data-user-id="'+user.id+'"][data-role-key="entry"]';await page.waitForSelector(inherited);assert.equal(await page.$eval(inherited,n=>n.checked&&n.disabled),true);assert.ok((await page.$eval('#role-list',n=>n.textContent)).includes('財務會計'));await page.waitForFunction(()=>!document.querySelector('#cash-form').inert&&!document.querySelector('#reload-roles').disabled);await page.$eval('input[data-user-id="'+user.id+'"][data-role-key="cash_verify"]',n=>n.click());await page.waitForFunction(()=>[...document.querySelectorAll('.finance-role-status')].some(n=>n.textContent.includes('已儲存')),{timeout:4000});assert.equal(await page.$eval(inherited,n=>n.disabled),true);
  assert.deepEqual(consoleErrors,[]);console.log('PASS desktop + phone: automatic lookup, explicit linking, pending code, duplicate names, empty/error, stale response, IME, contact clearing, no overflow.');
}finally{await browser?.close();server.kill('SIGTERM');}
