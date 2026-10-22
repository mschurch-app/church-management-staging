import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {contrastMetrics} from './phase3/contrast.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),mode=process.argv[2]||'after',base='f2e7ebb83cbbc74591e3fcf76e6c1259e01874b8',out=path.join(root,'tests/phase4/results/people-workspaces',mode);await mkdir(out,{recursive:true});
const fieldSource=(await readFile(path.join(root,'member-management.mjs'),'utf8')).match(/export const FIELDS=.*?;/)[0];
const bootstrap=`<script>
const church=new URLSearchParams(location.search).get('church');
window.t={church,allowed:true,calls:[],reads:0,readFail:false,writeFail:false,afterReadFail:false,delay:40,groups:[{id:1,church_id:church,name:'合成恩典組',leader:'合成同工甲',group_type:'成人',meeting_time:'每週五 19:30',location:'教會一樓',memo:'一起分享生活與代禱'},{id:2,church_id:church,name:'合成喜樂組',leader:'合成同工乙',group_type:'青年',meeting_time:'每週六 10:00',location:'線上聚會',memo:''}],members:Array.from({length:6},(_,i)=>({id:i+1,church_id:church,name:'合成會友'+['甲','乙','丙','丁','戊','己'][i],gender:i%2?'姊妹':'弟兄',phone:'0900-000-00'+i,group_name:i<4?'合成恩典組':'合成喜樂組',faith_status:'新朋友（初次聚會）',growth_progress:'穩定聚會(8成以上)',ministry:'主日招待',memo:i===0?'合成關懷備註；不是正式會友資料。':'',line_bound:i%2===0})),rows:[{id:1,church_id:church,meeting_date:'2026-10-23',meeting_type:'小組聚會',group_name:'合成恩典組',leader_name:'合成同工甲',total_expected:5,total_present:2,present_list:'合成會友甲、原有合成姓名',absent_list:'合成會友乙、合成會友丙、合成會友丁',memo:'合成紀錄'},{id:2,church_id:church,meeting_date:'2026-10-22',meeting_type:'主日聚會',group_name:'合成喜樂組',leader_name:'合成同工乙',total_expected:2,total_present:1,present_list:'合成會友戊',absent_list:'合成會友己'},{id:3,church_id:church,meeting_date:'2026-10-21',meeting_type:'小組聚會',group_name:'合成喜樂組',total_expected:2,total_present:2,present_list:'合成會友戊、合成會友己',absent_list:''}]};
window.readFixture=async()=>{t.reads++;if(!t.allowed)throw Error('沒有權限');if(t.readFail)throw Error('合成讀取失敗');};
window.writeFixture=async(action,input)=>{t.calls.push({action,input});await new Promise(r=>setTimeout(r,t.delay));if(!t.allowed)throw Error('沒有權限');if(t.writeFail)throw Error('合成儲存失敗');if(t.afterReadFail)t.readFail=true;};
</script>`;
const stubs={
 '/admin-db.mjs':`export const db={auth:{onAuthStateChange:fn=>window.authChanged=fn,signOut:async()=>authChanged?.('SIGNED_OUT')}};`,
 '/admin-access.mjs':`export const TAB_PERMISSIONS={members:['members'],groups:['groups'],attendance:['attendance']};export const canOpen=a=>a.allowed;export const chooseChurch=(a,c)=>c;export async function readAccess(){return {allowed:t.allowed,user:{id:'fixture-a',name:'合成同工',title:'測試管理'},churches:[t.church],grants:['members','groups','attendance'].map(permission=>({church_id:t.church,permission})),featurePermissions:['members','groups','attendance'].map(feature_key=>({church_id:t.church,feature_key,view:true}))};}`,
 '/church-customizations.mjs':`export const loadChurchCustomizations=async()=>({});export const catalog=(s,k,f)=>k==='group_types'?['成人','青年']:k==='meeting_types'?['小組聚會','主日聚會']:f;`,
 '/member-management.mjs':fieldSource+`export async function listMembers(db,c,q='',page=0,n=false,o={}){await readFixture();return {rows:t.members.filter(r=>(!q||[r.name,r.phone,r.memo,r.group_name].some(v=>String(v||'').includes(q)))&&(!o.groupName||r.group_name===o.groupName)),hasNext:false};}export async function listMemberGroups(){return t.groups.map(g=>g.name);}export async function saveMember(db,c,input,row){await writeFixture('member-save',input);if(row)Object.assign(t.members.find(m=>m.id===row.id),input);return {id:row?.id||7};}export const setMemberArchived=async()=>{};export const batchUpdateMembers=async()=>{};`,
 '/group-management.mjs':`export async function listGroups(db,c,archived=false){await readFixture();return t.groups.filter(g=>Boolean(g.archived_at)===archived);}export async function listGroupMembers(){await readFixture();return t.members;}export async function saveGroup(db,c,input,row){await writeFixture('group-save',input);if(row)Object.assign(t.groups.find(g=>g.id===row.id),input);else t.groups.push({id:3,church_id:c,...input});return {id:row?.id||3};}export async function setGroupArchived(db,c,row,archived){await writeFixture('group-archive',{id:row.id,archived});t.groups.find(g=>g.id===row.id).archived_at=archived?'2026-10-23':null;}`,
 '/attendance-management.mjs':`export async function listAttendance(){await readFixture();return t.rows;}export async function listAttendanceMembers(){await readFixture();return t.members;}export async function saveAttendance(db,c,input,row){await writeFixture('attendance-save',input);return {id:row?.id||4};}`
};
const server=createServer(async(req,res)=>{try{
 const file=new URL(req.url,'http://fixture').pathname;let data;
 if(stubs[file])data=stubs[file];else{
  const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));
  data=mode==='before'&&/^\/(members|groups|attendance)(\.html|-ui\.mjs)$/.test(file)?execFileSync('git',['show',base+':'+file.slice(1)],{cwd:root}):await readFile(target);
  if(file.endsWith('.html'))data=data.toString().replace('</head>',bootstrap+'</head>');
  if(file==='/member-options.mjs')data=data.toString().replace(/export async function loadMinistryOptions[^\n]+/,"export const loadMinistryOptions=async()=>['主日招待','關懷代禱'];");
 }
 res.setHeader('content-type',file.endsWith('.html')?'text/html;charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch(e){res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const checks=[],failures=[],visuals=[];const check=(ok,name)=>{assert(ok,name);checks.push(name);};
async function visit(browser,width,name,church){
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Taipei',isMobile:width<700,hasTouch:width<700,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),errors=[],blocked=[];
 page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){blocked.push(r.request().url());return r.abort();}return r.continue();});
 await page.clock.setFixedTime(new Date('2026-10-22T16:30:00Z'));await page.goto(origin+'/'+name+'.html?church='+encodeURIComponent(church));await page.locator(name==='members'?'#list article':name==='groups'?'#groups article':'#records article').first().waitFor();await page.locator('.admin-identity').waitFor();await page.evaluate(()=>document.fonts.ready);return {context,page,errors,blocked};
}
async function capture(page,prefix,state){
 await page.evaluate(()=>scrollTo(0,0));const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,header:document.querySelector('.page-header').getBoundingClientRect().height}));
 const details=await page.locator('details').evaluateAll(nodes=>nodes.map(n=>n.open));const contrast=await page.evaluate(contrastMetrics);await page.locator('details').evaluateAll((nodes,states)=>nodes.forEach((n,i)=>n.open=states[i]),details);
 visuals.push({prefix,state,metrics,contrast});await page.screenshot({path:path.join(out,prefix+'-'+state+'.png'),fullPage:true});await page.screenshot({path:path.join(out,prefix+'-'+state+'-viewport.png')});
 if(state==='editor'){await page.locator('#editor').evaluate(n=>scrollTo(0,scrollY+n.getBoundingClientRect().top-16));await page.screenshot({path:path.join(out,prefix+'-workspace.png')});}
 if(mode==='before')return;
 check(metrics.scrollWidth<=metrics.width+1,prefix+' '+state+' width');check(Math.round(metrics.header)===164,prefix+' '+state+' header');check(!contrast.failures.length,prefix+' '+state+' contrast '+JSON.stringify(contrast.failures));
 const small=await page.locator('button,input:not([type=checkbox]),select,summary,.member-pick,.choice').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length&&n.getBoundingClientRect().height<43.5).map(n=>({id:n.id,tag:n.tagName,text:n.textContent.slice(0,30),height:n.getBoundingClientRect().height})));check(!small.length,prefix+' '+state+' touch targets '+JSON.stringify(small));
}
try{for(const engine of mode==='before'?['chromium']:['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{for(const width of [390,1440])for(const church of ['M+','SHiNE'])for(const name of ['members','groups','attendance']){
  const {context,page,errors,blocked}=await visit(browser,width,name,church),prefix=[name,engine,width,church==='M+'?'mplus':'shine'].join('-');
  try{
   await capture(page,prefix,'list');
   if(name==='members')await page.getByRole('button',{name:'編輯資料',exact:true}).first().click();
   if(name==='groups')await page.getByRole('button',{name:church==='M+'?'編輯小組':'編輯小家',exact:true}).first().click();
   if(name==='attendance')await page.getByRole('button',{name:'更正紀錄',exact:true}).first().click();
   await page.locator('#editor form').waitFor();await capture(page,prefix,'editor');
   if(mode==='before')continue;
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+' 200% text');await page.evaluate(()=>document.documentElement.style.fontSize='');
   if(name==='members'){
    await page.fill('#editor [name=name]','合成姓名修改');await page.getByRole('button',{name:'取消',exact:true}).click();check(await page.locator('#editor').isVisible(),prefix+' cancel preserves unsaved member');
    await page.getByRole('button',{name:'切換表格檢視',exact:true}).click();check(await page.locator('#editor [name=name]').inputValue()==='合成姓名修改'&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+' compact view preserves editor and width');
    await page.locator('#list input[data-member-id]').first().check();check(await page.locator('#batch-actions').isVisible(),prefix+' member selection exposes batch bar');
   }else if(name==='groups'){
    const reads=await page.evaluate(()=>t.reads);await page.fill('#group-search','線上');check(await page.locator('#groups article').count()===1&&await page.evaluate(()=>t.reads)===reads,prefix+' local group location search');
    await page.fill('#group-search','無相符資料');check(await page.locator('.people-empty').isVisible(),prefix+' explicit empty search');await page.click('#clear-search');
    await page.fill('#editor [name=name]','修改保留');await page.getByRole('button',{name:'取消',exact:true}).click();await page.click('#new');check(await page.locator('#editor [name=name]').inputValue()==='修改保留',prefix+' cancel and new protect group edits');
    await page.evaluate(()=>t.writeFail=true);await page.locator('#editor button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#editor [role=status]').textContent.includes('合成儲存失敗'));check(await page.locator('#editor [name=name]').inputValue()==='修改保留'&&!await page.locator('#editor button[type=submit]').isDisabled(),prefix+' failed group save retains values');
    await page.evaluate(()=>{t.writeFail=false;t.afterReadFail=true;t.delay=150;document.querySelector('#editor form').requestSubmit();document.querySelector('#editor form').dispatchEvent(new Event('submit',{cancelable:true}));});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('資料已儲存，清單尚未更新'));
    check(await page.evaluate(()=>t.calls.filter(c=>c.action==='group-save').length)===2&&await page.locator('#editor').isHidden(),prefix+' acknowledged group save suppresses duplicate and closes draft');
    await page.evaluate(()=>t.readFail=false);await page.getByRole('button',{name:'重新讀取',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('共 '));check(await page.evaluate(()=>t.calls.filter(c=>c.action==='group-save').length)===2,prefix+' group refresh only reads');
    const term=church==='M+'?'小組':'小家';await page.evaluate(()=>t.readFail=true);await page.getByRole('button',{name:'查看已封存'+term,exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('合成讀取失敗'));check(await page.getByRole('button',{name:'查看已封存'+term,exact:true}).isVisible()&&!await page.locator('#new').isDisabled(),prefix+' failed archive-list read preserves active state');
    await page.evaluate(()=>{t.readFail=false;t.afterReadFail=false;});page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'封存',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已封存'));check(await page.locator('#groups article').count()===1,prefix+' archive reports actual operation');
    await page.getByRole('button',{name:'查看已封存'+term,exact:true}).click();await page.waitForFunction(()=>document.querySelector('#new').disabled);check(await page.locator('#groups article').count()===1&&await page.getByRole('button',{name:'恢復',exact:true}).isVisible(),prefix+' archived list disables new');
    await page.getByRole('button',{name:'恢復',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已恢復'));await page.getByRole('button',{name:'返回使用中'+term,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#new').disabled);check(await page.locator('#groups article').count()===2,prefix+' restore returns item to active list');
   }else{
    const reads=await page.evaluate(()=>t.reads);await page.selectOption('#record-group','合成喜樂組');check(await page.locator('#records article').count()===2&&await page.locator('#records>.status-message').innerText().then(s=>s.includes('75%'))&&await page.evaluate(()=>t.reads)===reads,prefix+' local attendance filter and scoped rate');await page.selectOption('#record-type','主日聚會');check(await page.locator('#records article').count()===1,prefix+' combined record filters');await page.click('#clear-filters');
    const search=page.locator('.roster-search input');await search.fill('乙');check(await page.locator('#editor form').evaluate(n=>n.dataset.unsavedChanges!=='true'),prefix+' view-only roster search does not dirty data');await page.locator('input[data-name="合成會友乙"]').check();await search.fill('丙');check(await page.locator('#editor form').evaluate(n=>n.dataset.unsavedChanges==='true'),prefix+' roster search keeps genuine unsaved marker');await page.locator('input[data-name="合成會友丙"]').check();check(await page.locator('.attendance-roster-summary').innerText().then(s=>s.includes('出席 4 人')),prefix+' search retains offscreen selections and historic name');
    await page.selectOption('#editor [name=group]','2');check(await page.locator('#editor [name=group]').inputValue()==='1',prefix+' group change requires discard confirmation');
    await page.getByRole('button',{name:'取消',exact:true}).click();check(await page.locator('#editor').isVisible(),prefix+' attendance cancel protects changes');
    await page.evaluate(()=>t.writeFail=true);await page.locator('#editor button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#editor .status-message[role=status]').textContent.includes('合成儲存失敗'));check(await page.locator('input[data-name="合成會友乙"]').isChecked(),prefix+' failed save retains hidden attendance choices');
    await page.evaluate(()=>{t.writeFail=false;t.afterReadFail=true;t.delay=150;document.querySelector('#editor form').requestSubmit();document.querySelector('#editor form').dispatchEvent(new Event('submit',{cancelable:true}));});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('清單尚未更新，請重新讀取'));
    const saves=await page.evaluate(()=>t.calls.filter(c=>c.action==='attendance-save'));check(saves.length===2&&saves[1].input.present.length===4&&saves[1].input.absent.length===1&&saves[1].input.present.includes('原有合成姓名'),prefix+' all filtered and historical names saved once');
    await page.evaluate(()=>t.readFail=false);await page.getByRole('button',{name:'重新讀取',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#new').disabled);await page.click('#new');check(await page.locator('#editor [name=meeting_date]').inputValue()==='2026-10-23',prefix+' new record uses Taipei local date');
   }
   check(!errors.length&&!blocked.length,prefix+' no page errors or external requests '+JSON.stringify(errors));
  }catch(e){failures.push({prefix,error:e.stack});console.error(prefix,e.message);}finally{await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();await writeFile(path.join(out,'checks.json'),JSON.stringify({mode,base,productionWrites:0,real_iPhone:false,real_Mac_Safari:false,visuals,checks,failures},null,2));}
console.log(JSON.stringify({checks:checks.length,failures},null,2));assert.equal(failures.length,0);
