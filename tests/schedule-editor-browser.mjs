import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-10-22-experience7');await mkdir(out,{recursive:true});
const bootstrap=`<script>
window.t={saves:[],dialogs:[],writeFail:false,readFail:false,delay:50,rows:[{id:1,church_id:'M+',service_date:'2027/01/03',event:'合成主日聚會',speaker:'合成講員',tech_sound:'合成音控',tech_video:'保留導播同工',custom_assignments:{custom_1234567890abcdef:'保留自訂同工'},custom_1234567890abcdef:'保留自訂同工'}]};
window.fixtureDb={auth:{onAuthStateChange:()=>{}}};
</script>`;
const management=`export const COMMON=['event','speaker','worship_leader','tech_sound','tech_video','usher1','usher2'];export const M_PLUS=['presider','prayer','sunday_school','sunday_school_ta','transport'];export const SHINE=['singers','keyboard','guitar','bass','drums','ushers'];
export async function listSchedules(db,church){if(t.readFail)throw Error('清單暫時無法讀取');return t.rows.map(row=>({...row,church_id:church}));}
export const listScheduleMembers=async()=>[{name:'合成同工甲',group_name:'合成小組'},{name:'合成同工乙',group_name:'合成小組'}];
export const listRolePreferences=async()=>[{role_key:'speaker',label:'信息分享',is_visible:true,sort_order:1},{role_key:'tech_sound',label:'音控控台',is_visible:true,sort_order:2},{role_key:'worship_leader',label:'敬拜讚美',is_visible:true,sort_order:3},{role_key:'tech_video',label:'導播',is_visible:false,sort_order:4},{role_key:'custom_1234567890abcdef',label:'自訂服事',is_visible:true,sort_order:5},...Array.from({length:20},(_,i)=>({role_key:'custom_'+String(i+1).padStart(16,'0'),label:'其他服事 '+(i+1),is_visible:true,sort_order:i+6}))];
export async function saveSchedule(db,church,input,previous){t.saves.push({church,input,previous});await new Promise(r=>setTimeout(r,t.delay));if(t.writeFail)throw Error('合成儲存失敗');t.rows=[{id:1,church_id:church,...input}];}export const saveRolePreferences=async()=>[];`;
const stubs={'/admin-db.mjs':'export const db=window.fixtureDb;','/admin-access.mjs':`export const readAccess=async()=>({user:{id:'fixture-only'}});export const canOpen=()=>true;`,'/schedule-management.mjs':management};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://fixture'),file=url.pathname;let data;
 if(file==='/fixture.html'){data=(await readFile(path.join(root,'schedules.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<head>','<head><base href="/">').replace('<html lang="zh-Hant"','<html class="mplus-theme" lang="zh-Hant"').replace('</body>',bootstrap+'<script type="module" src="/schedules-ui.mjs"></script></body>');}
 else if(stubs[file])data=stubs[file];else{const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));data=await readFile(target);}
 res.setHeader('content-type',file==='/fixture.html'?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,checks=[];
const check=(result,name)=>{assert(result,name);checks.push(name);console.log('PASS',name);};
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{for(const width of [390,1440])for(const church of ['M+','SHiNE']){
  const prefix=engine+' '+width+' '+church+': ',context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700}),page=await context.newPage(),dialogs=[],errors=[];
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/fixture.html?church='+encodeURIComponent(church));await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('筆排班'));await page.locator('#records button').first().click();
  const controls=page.locator('#editor [data-schedule-role] input');
  const expectedRoles=['speaker','tech_sound','worship_leader','custom_1234567890abcdef',...Array.from({length:20},(_,i)=>'custom_'+String(i+1).padStart(16,'0'))];
  check(JSON.stringify(await controls.evaluateAll(nodes=>nodes.map(n=>n.name)))===JSON.stringify(expectedRoles),prefix+'all configured visible roles appear in original order');
  check(await page.locator('#editor input[type=date]').inputValue()==='2027-01-03',prefix+'existing slash date remains valid when opened');
  if(width<700)check(await page.evaluate(()=>document.activeElement?.tagName==='H2'),prefix+'mobile editor does not open keyboard automatically');
  await page.fill('#schedule-role-search','音控');
  check(await page.locator('#editor [data-schedule-role]:visible').count()===1,prefix+'role search narrows a long form');
  if(church==='M+')await page.locator('#editor').screenshot({path:path.join(out,'schedule-filter-'+engine+'-'+width+'.local.png')});
  await page.locator('#schedule-role-search').press('Enter');
  check(await page.evaluate(()=>t.saves.length===0),prefix+'Enter in filter cannot save business data');
  await page.getByRole('button',{name:'顯示全部',exact:true}).click();await page.fill('#schedule-role-search','保留自訂');
  check(await page.locator('#editor [data-schedule-role]:visible').count()===1,prefix+'search finds an existing assigned name');
  await page.getByRole('button',{name:'顯示全部',exact:true}).click();await page.selectOption('#schedule-role-filter','empty');
  check(await page.locator('#editor [data-schedule-role]:visible').count()===21,prefix+'unassigned filter identifies actual empty roles');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  check(!await page.locator('#editor').isVisible()&&dialogs.length===0,prefix+'filtering alone creates no unsaved business changes');
  await page.locator('#records button').first().click();await page.selectOption('#schedule-role-filter','empty');
  const member=page.locator('#editor [name=worship_leader]');await member.fill('合成同工甲');await member.press('ArrowDown');await member.press('ArrowDown');
  check(await member.getAttribute('aria-activedescendant')!==null,prefix+'arrow keys identify the selected suggestion');
  await member.press('Enter');
  check(await member.inputValue()==='合成同工甲'&&await member.getAttribute('aria-expanded')==='false'&&await page.evaluate(()=>t.saves.length===0),prefix+'Enter chooses a member without submitting');
  await member.press('Enter');
  check(await page.evaluate(()=>t.saves.length===0),prefix+'Enter after choosing a member still cannot save the form');
  await member.fill('合成同工');const picked=page.locator('#schedule-member-menu-worship_leader [data-name="合成同工乙"]');if(width<700)await picked.tap();else await picked.click();
  check(await member.inputValue()==='合成同工乙'&&await member.getAttribute('aria-expanded')==='false',prefix+'pointer selection retains focus and selects the intended person');
  await member.fill('合成同工甲');await member.press('ArrowUp');await member.press('Escape');
  check(await member.inputValue()==='合成同工甲'&&await member.getAttribute('aria-expanded')==='false',prefix+'Escape closes suggestions and preserves input');
  await member.focus();await member.press('Tab');
  check(await member.getAttribute('aria-expanded')==='false',prefix+'Tab leaves suggestion menu normally');
  check(await page.locator('.schedule-editor-summary').textContent().then(t=>t.includes('已安排 4 / 24')),prefix+'assignment count updates while editing without hiding the active field');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  check(await page.locator('#editor').isVisible()&&dialogs.length===1,prefix+'real edits still require discard confirmation');
  await page.fill('#schedule-role-search','不存在的項目');
  check(await page.locator('.schedule-editor-empty').isVisible()&&await controls.count()===24,prefix+'empty search retains all role values in the editor');
  await page.evaluate(()=>t.writeFail=true);await page.locator('#editor button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='合成儲存失敗');
  check(await member.inputValue()==='合成同工甲'&&await page.locator('#editor button[type=submit]').isEnabled(),prefix+'write failure retains filtered and edited data');
  const payload=await page.evaluate(()=>t.saves[0]);
  check(payload.church===church&&payload.input.speaker==='合成講員'&&payload.input.tech_sound==='合成音控'&&payload.input.worship_leader==='合成同工甲'&&payload.input.custom_1234567890abcdef==='保留自訂同工'&&payload.input.tech_video==='保留導播同工',prefix+'save preserves filtered roles, custom assignments, hidden fixed values and church');
  await page.getByRole('button',{name:'顯示全部',exact:true}).click();await page.locator('#editor').screenshot({path:path.join(out,'schedule-'+engine+'-'+width+'-'+(church==='M+'?'mplus':'shine')+'.local.png')});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+'normal text has no page overflow');
  await page.evaluate(()=>document.documentElement.classList.add('ios-keyboard-open'));
  check(await page.locator('#editor .editor-actions').evaluate(n=>getComputedStyle(n).position)==='static',prefix+'keyboard mode releases sticky actions');
  await page.evaluate(()=>{document.documentElement.classList.remove('ios-keyboard-open');const sizes=[...document.querySelectorAll('#editor,#editor *')].map(node=>[node,parseFloat(getComputedStyle(node).fontSize)]);for(const [node,size]of sizes)node.style.fontSize=(size*2)+'px';});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+'large text keeps controls within page');
  await page.evaluate(()=>{t.writeFail=false;t.readFail=true;t.delay=150;const form=document.querySelector('#editor form');form.requestSubmit();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('排班已儲存，但'));
  check(await page.evaluate(()=>t.saves.length===2)&&!await page.locator('#editor').isVisible(),prefix+'double submission writes once and acknowledged save closes after reload failure');
  check(errors.length===0,prefix+'no uncaught browser errors');await context.close();
 }}finally{await browser.close();}
}
await writeFile(path.join(out,'checks.local.json'),JSON.stringify({checks,synthetic:true,production_writes:false,physical_iPhone:false,macSafari:false},null,2));console.log('TOTAL',checks.length);
}finally{server.close();}
