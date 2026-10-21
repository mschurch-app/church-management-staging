import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const out = new URL('../docs/reports/2026-10-21-finance/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const root = new URL('../', import.meta.url).pathname;
const server = spawn(process.execPath, ['tests/serve.mjs'], { cwd: root, env: { ...process.env, CHURCH_TEST_PORT: '8781' }, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('server_timeout')), 10000);
  server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
  server.once('error', reject);
  server.once('exit', code => { if (code) reject(new Error(`server_exit_${code}`)); });
});
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-first-run','--no-default-browser-check','--disable-background-networking']
});
try {
  for (const [width, height, name] of [[390, 844, 'finance-admin-mobile'], [1440, 900, 'finance-admin-desktop']]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
    await page.goto('http://127.0.0.1:8781/tests/finance-nav-fixture.html', { waitUntil: 'networkidle0' });
    await page.click('[data-center="church"]');
    assert.equal(await page.$$eval('.hub-tile',nodes=>nodes.some(node=>node.textContent.includes('奉獻與財務'))),false);
    await page.click('[data-center="admin"]');
    const card = await page.$('.hub-tile:nth-child(2)');
    assert(card);
    assert.match(await card.evaluate(node => node.textContent), /同工行政/);
    assert.match(await card.evaluate(node => node.textContent), /奉獻與財務/);
    await card.evaluate(node => node.click());
    const dialog = await page.waitForSelector('.mplus-event-dialog[open]', { timeout: 3000 });
    assert(dialog);
    assert.match(await dialog.evaluate(node => node.textContent), /同工行政/);
    const href = await dialog.$$eval('a',nodes=>nodes.find(node=>node.textContent.includes('奉獻與財務'))?.getAttribute('href'));
    assert.match(href, /finance-cash\.html/);
    await page.click('.mplus-dialog-close');
    if (width < 600) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: width >= 600 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.close();
  }
  console.log('finance navigation visual check: mobile and desktop passed');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
