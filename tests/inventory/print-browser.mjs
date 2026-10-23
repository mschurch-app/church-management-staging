import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'tests/phase4/results/inventory-print');await mkdir(out,{recursive:true});
// Reuse the established operations data fixture; no production endpoints are reachable.
const sourceFile=path.join(root,'tests/operations-workspaces-browser.mjs'),source=await readFile(sourceFile,'utf8'),cut=source.indexOf('const sourceFiles=');assert(cut>100);
const temp=await mkdtemp(path.join(os.tmpdir(),'church-print-'));
let prefix=source.slice(0,cut).replaceAll("path.resolve(import.meta.dirname,'..')",JSON.stringify(root)).replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(path.resolve(path.dirname(sourceFile),p))).replace(/out=path.join\(root,'[^']+'\)/,`out=${JSON.stringify(out)}`);
prefix=prefix.replace("res.setHeader('content-type'",`res.setHeader('Content-Security-Policy',"connect-src 'self'; form-action 'self'; frame-src 'self'");res.setHeader('content-type'`);
await writeFile(path.join(temp,'fixture.mjs'),prefix+'\nexport {origin};export const close=()=>server.close();');
const pdfjs=await import(process.env.PDFJS_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const fixture=await import(path.join(temp,'fixture.mjs')),checks=[],errors=[];let browser;
const check=(name)=>{checks.push(name);console.log('PASS',name);};
try{
 for(const engine of ['chromium','webkit']){
  browser=engine==='chromium'?await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}):await webkit.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  for(const church of ['M+','SHiNE']){
   await page.goto(fixture.origin+'/inventory.html?church='+encodeURIComponent(church));await page.waitForSelector('.inventory-card');
   await page.locator('#search').fill('無線');await page.waitForFunction(()=>document.querySelector('#item-count').textContent==='1／2 項');
   await page.emulateMedia({media:'print'});await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));
   assert.match(await page.locator('#print-context').textContent(),new RegExp(church==='M+'?'M\\+ 大雅教會':'火樂教會'));assert.match(await page.locator('#print-context').textContent(),/1／2 項.*搜尋：無線/);
   for(const s of ['.page-header','.module-bar','.inventory-scope','#reload','.inventory-actions','.filter-panel','.locations-panel','.app-skip-link','.mplus-function-dock']){for(const n of await page.locator(s).all())assert.equal(await n.isVisible(),false,s);}
   assert(await page.locator('.inventory-print-heading').isVisible());assert.equal(await page.locator('.inventory-card').count(),1);check(engine+' '+church+' filtered print has scope/count/filter and no navigation or controls');
   await page.screenshot({path:path.join(out,engine+'-'+church.replace('+','plus')+'-list.png'),fullPage:true});
   if(engine==='chromium')await page.pdf({path:path.join(out,church.replace('+','plus')+'-list.pdf'),format:'A4'});
   await page.emulateMedia({media:'screen'});await page.evaluate(()=>dispatchEvent(new Event('afterprint')));assert(await page.locator('#search').isVisible());assert.equal(await page.locator('#search').inputValue(),'無線');check(engine+' '+church+' leaving print retains filter and restores controls');
   await page.evaluate(()=>{t.inventory_movements=Array.from({length:30},(_,i)=>({id:'move'+i,item_id:'i1',reason:'合成異動 '+(i+1),quantity_delta:1,quantity_before:i,quantity_after:i+1,created_at:'2026-10-23T01:00:00Z',notes:'合成長紀錄分頁驗收 '+(i+1)}));});await page.locator('.inventory-card').click();await page.waitForSelector('#detail-dialog[open]');
   await page.emulateMedia({media:'print'});assert.equal(await page.locator('main').isVisible(),false);assert(await page.locator('#detail-dialog').isVisible());
   assert.equal(await page.locator('#detail-dialog button:visible').count(),0);assert(await page.locator('.inventory-detail-scope').isVisible());assert.match(await page.locator('.loan-list').textContent(),/合成借用人/);assert.equal(await page.locator('.movement-list .record-row').count(),30);assert.match(await page.locator('.movement-list').textContent(),/合成長紀錄分頁驗收 30/);
   const box=await page.locator('#detail-dialog').evaluate(n=>{const s=getComputedStyle(n);return {position:s.position,overflow:s.overflow,maxHeight:s.maxHeight,scroll:n.scrollHeight,client:n.clientHeight};});assert(['static','absolute'].includes(box.position));assert.equal(box.overflow,'visible');assert.equal(box.maxHeight,'none');assert(box.scroll<=box.client+1);check(engine+' '+church+' detail print contains all records and excludes background/actions/clipping');
   await page.screenshot({path:path.join(out,engine+'-'+church.replace('+','plus')+'-detail.png'),fullPage:true});if(engine==='chromium'){
    const bytes=await page.pdf({path:path.join(out,church.replace('+','plus')+'-detail.pdf'),format:'A4'}),pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let text='';for(let p=1;p<=pdf.numPages;p++)text+=(await (await pdf.getPage(p)).getTextContent()).items.map(i=>i.str).join('');
    assert(pdf.numPages>=2);assert(text.normalize('NFKC').replace(/\s/g,'').includes('合成長紀錄分頁驗收30'),text.slice(-400));assert(!text.includes('管理首頁'));assert(!text.includes('編輯資料'));check(engine+' '+church+' actual PDF includes last of 30 records across pages');await pdf.destroy();
   }
   await page.emulateMedia({media:'screen'});await page.keyboard.press('Escape');assert.equal(await page.locator('#detail-dialog').isVisible(),false);assert(await page.locator('#search').isVisible());assert.equal(await page.locator('#search').inputValue(),'無線');check(engine+' '+church+' Escape closes detail and restores original filter');
  }
  await page.goto(fixture.origin+'/inventory.html?church=M%2B&inventory_scope=MSCHOOL');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('課輔班清冊已載入'));
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('#print-context').textContent(),'課輔班｜0／0 項｜全部物品');assert(await page.locator('#items .empty-list').isVisible());check(engine+' empty school scope prints correct unit and zero count');
  await browser.close();browser=null;
 }
 assert.equal(errors.length,0,errors.join('\n'));check('no browser script errors');
}finally{await browser?.close();fixture.close();await rm(temp,{recursive:true,force:true});await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,errors},null,2));}
