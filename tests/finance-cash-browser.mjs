import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const base = 'http://127.0.0.1:8778';
const root = new URL('../', import.meta.url).pathname;
const out = path.join(root, 'docs/reports/2026-10-21-finance');
fs.mkdirSync(out, { recursive: true });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {} };
const second = '22222222-2222-4222-8222-222222222222';
const session = { access_token: 'test.token.signature', refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const roleAccounts = [{ userId: user.id, name: '測試同工甲', title: '行政', roles: [] }, { userId: second, name: '測試同工乙', title: '師母', roles: [] }];
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
  const page = await browser.newPage();
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
        if (body.action === 'assign_role') {
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
          profile: { ok: true, roles: ['entry','cash_verify','approve'], owner: true },
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
  for (const [width,height,name] of [[1440,900,'mac-1440'],[390,844,'iphone-390']]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
    await page.goto(`${base}/finance-cash.html`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#finance-app:not([hidden])', { timeout: 10000 });
    await page.click('#new-batch');
    await page.waitForSelector('.finance-group');
    await page.type('.finance-group input[type="text"]', '王小明');
    await page.click('.finance-group .finance-inline button');
    await page.waitForSelector('.finance-search-results button');
    await page.click('.finance-search-results button');
    assert.equal(await page.$eval('#counted-cash',el=>el.readOnly),true);
    const fields = await page.$$('.finance-category-grid input');
    await fields[0].type('1000');
    await fields[1].type('500');
    assert.equal(await page.$eval('.finance-bag-total',el=>el.readOnly&&el.value==='1500'),true);
    assert.equal(await page.$eval('#entered-total', el => el.textContent), '1,500');
    assert.equal(await page.$eval('#counted-cash',el=>el.value),'1500');
    assert.equal(await page.$eval('#submit-batch',el=>el.disabled),true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'no horizontal overflow');
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  }
  for (const width of [320,360,375,390,430]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const tabs = await page.$eval('.finance-tabs', nav => {
      const area = nav.getBoundingClientRect();
      return {
        overflow: nav.scrollWidth > nav.clientWidth + 1,
        buttons: [...nav.querySelectorAll('button:not([hidden])')].map(button => {
          const rect = button.getBoundingClientRect();
          return rect.left >= area.left - 1 && rect.right <= area.right + 1 && rect.height >= 44;
        })
      };
    });
    assert.equal(tabs.overflow, false, `${width}px finance tabs must not scroll sideways`);
    assert.deepEqual(tabs.buttons, [true,true,true], `${width}px finance tabs must be fully visible`);
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.click('#roles-tab');
  await page.waitForSelector('#role-list input[data-role-key="entry"]');
  assert.match(await page.$eval('.finance-role-help', node => node.textContent), /立即儲存/);
  const entry = `#role-list input[data-user-id="${user.id}"][data-role-key="entry"]`;
  const verify = `#role-list input[data-user-id="${user.id}"][data-role-key="cash_verify"]`;
  const approve = `#role-list input[data-user-id="${user.id}"][data-role-key="approve"]`;
  await page.click(entry);
  await page.waitForFunction(() => [...document.querySelectorAll('#role-list input')].every(input => input.disabled));
  await page.waitForFunction(selector => document.querySelector(selector)?.closest('.finance-list-card')?.querySelector('.finance-role-status')?.textContent === '已儲存。', {}, entry);
  assert.equal(roleAccounts[0].roles.includes('entry'), true);
  await page.screenshot({ path: path.join(out, 'roles-saved-390.png'), fullPage: true });
  failNextRoleAssignment = true;
  await page.click(verify);
  await page.waitForFunction(selector => document.querySelector(selector)?.closest('.finance-list-card')?.querySelector('.finance-role-status')?.textContent === '未儲存，請再試一次。', {}, verify);
  assert.equal(await page.$eval(verify, input => input.checked), false);
  failNextWorkers = true;
  await page.click(entry);
  await page.waitForFunction(selector => document.querySelector(selector)?.closest('.finance-list-card')?.querySelector('.finance-role-status')?.textContent.includes('權限已儲存，但點收同工清單暫時無法更新'), {}, entry);
  assert.equal(await page.$eval(entry, input => input.checked), false);
  assert.equal(roleAccounts[0].roles.includes('entry'), false);
  failNextRoleAssignment = true; failNextAccounts = true;
  await page.click(approve);
  await page.waitForFunction(selector => document.querySelector(selector)?.closest('.finance-list-card')?.querySelector('.finance-role-status')?.textContent.includes('無法確認是否儲存'), {}, approve);
  assert.equal(await page.$$eval('#role-list input', inputs => inputs.every(input => input.disabled)), true);
  await page.click('#reload-roles');
  await page.waitForFunction(selector => document.querySelector(selector)?.disabled === false, {}, approve);
  await page.waitForFunction(() => document.querySelector('#reload-roles')?.disabled === false);
  assert.equal(await page.$eval(approve, input => input.checked), false);
  await page.screenshot({ path: path.join(out, 'roles-390.png'), fullPage: true });
  assert.deepEqual(consoleErrors, []);
  console.log('finance cash browser smoke: desktop and mobile passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
