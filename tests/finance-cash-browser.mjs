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
        data = ({
          profile: { ok: true, roles: ['entry','cash_verify','approve'], owner: true },
          workers: { ok: true, workers: [{ userId: user.id, name: '測試同工甲' }, { userId: second, name: '測試同工乙' }] },
          list: { ok: true, batches: [] },
          accounts: { ok: true, accounts: [] },
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
    await page.$eval('#counted-cash', el => { el.value = '1500'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const fields = await page.$$('.finance-category-grid input');
    await fields[0].type('1000');
    await fields[1].type('500');
    await page.$eval('.finance-bag-footer input', el => { el.value = '1500'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.$eval('#entered-total', el => el.textContent), '1,500');
    assert.equal(await page.$eval('#cash-difference', el => el.textContent), '0');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'no horizontal overflow');
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  }
  assert.deepEqual(consoleErrors, []);
  console.log('finance cash browser smoke: desktop and mobile passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
