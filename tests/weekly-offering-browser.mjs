import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const source=await readFile('website-maintenance-management.mjs','utf8');
const actual=source.slice(source.indexOf('let accountingRequest='),source.indexOf('\nfunction displayImage'));
const html=`<meta charset="utf-8"><div id="sections"></div><script type="module">
import {ACCOUNTING_SECTION_KEY,ensureAccountingSection,accountingItems} from '/finance/weekly-offering.mjs';
const church='M+',REVIEW_ENDPOINT='/preview',$=s=>document.querySelector(s),el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n};
let programEditors=[],current={id:'draft',service_date:'2026-10-25',status:'draft',sections:ensureAccountingSection([{key:'program',items:[]},{key:'news',items:[]},{key:'prayer',items:[]},{key:'schedule',items:[],auto_schedule:true},{key:'offering',title:'人工奉獻',enabled:true,items:[{label:'old',body:'保留人工內容'}]},{key:'custom-old',title:'原有自訂',enabled:true,items:[{label:'original',body:'自訂保留'}]}])};
const guard={mark(){}},syncWorkspace=()=>{},syncProgramFromSchedule=()=>{},db={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}},itemEditor=(s,item)=>el('p',item.body);
window.mode='ready';window.fetch=async()=>{const mode=window.mode;await new Promise(r=>setTimeout(r,120));if(mode==='error')throw Error('測試讀取失敗');return {ok:true,json:async()=>({ok:true,preview:{status:mode==='empty'?'empty':'ready',offeringDate:'2026-10-18',message:'上週主日尚無會計奉獻資料。',grandTotal:300,categoryTotals:{感恩奉獻:300},rows:[]}})}};
${actual}
window.fixture={current,loadAccounting,renderSections};renderSections();
</script>`;
const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url.startsWith('/finance/')?'text/javascript':'text/html');res.end(req.url.startsWith('/finance/')?await readFile('.'+req.url):html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const width of [390,1280]){const page=await browser.newPage({viewport:{width,height:844}});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.fixture);
const manual=page.locator('[data-section-key="offering"]'),auto=page.locator('[data-section-key="offering_accounting"]');assert.equal(await auto.locator('h3').textContent(),'欄位 6');assert.equal(await page.locator('[data-section-key="custom-old"] h3').textContent(),'欄位 7');assert.ok(await auto.getByRole('checkbox').isChecked());assert.ok(!(await manual.getByRole('checkbox').isChecked()));await auto.getByRole('checkbox').uncheck();assert.ok(!(await manual.getByRole('checkbox').isChecked()));await manual.getByRole('checkbox').check();assert.ok(!(await auto.getByRole('checkbox').isChecked()));await auto.getByRole('button',{name:'重新讀取上週奉獻'}).click();await page.getByText('正在讀取會計資料，請稍候…').waitFor();await page.getByText('NT$300',{exact:true}).waitFor();assert.ok((await manual.textContent()).includes('保留人工內容'));assert.ok((await page.locator('[data-section-key="custom-old"]').textContent()).includes('自訂保留'));
await page.evaluate(async()=>{mode='empty';await fixture.loadAccounting()});assert.ok(!(await auto.textContent()).includes('NT$300'));assert.ok((await auto.textContent()).includes('尚無會計奉獻資料'));
await page.evaluate(async()=>{mode='error';await fixture.loadAccounting()});assert.ok((await auto.textContent()).includes('測試讀取失敗'));assert.equal(await page.evaluate(()=>fixture.current.sections[5].source_status),'error');await page.close();}
console.log('PASS desktop + phone: field order, independent hide toggles, loading, privacy-safe totals, empty/error states, original content preserved');}finally{await browser.close();server.close();}
