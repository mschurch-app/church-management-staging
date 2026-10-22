import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {daily} from './phase3/fixtures.mjs';
export const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
export const root=path.resolve(import.meta.dirname,'..');
const uid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000010';
const rows=daily().map((row,i)=>({...row,id:`00000000-0000-4000-8000-00000000000${i+2}`,version:1}));
const bootstrap=`<script>
const user={id:'${uid}'},sid=window.fixtureSession||'${sid}';
window.t={rows:${JSON.stringify(rows)},calls:[],previewConflict:new URL(location.href).searchParams.has('previewConflict'),contract:true,readDelay:0,rollback:false,schemaMissing:false,denied:false,readonly:window.fixtureMode==='readonly',exportDenied:false,identityDelay:0,writeFail:false,invalidAck:false,afterWriteFail:false,readFail:false,authLost:false,callbacks:[],scope:{userId:user.id,sessionId:sid,church:'M+'}};
const access_token=['e30',btoa(JSON.stringify({sub:user.id,session_id:sid})),'synthetic'].join('.'),session={access_token,user};
window.fixtureDb={auth:{getSession:async()=>({data:{session:t.authLost?null:session}}),signOut:async()=>t.signOut(),onAuthStateChange:fn=>{t.callbacks.push(fn);return{data:{subscription:{unsubscribe(){}}}};}}};
t.signOut=()=>{t.authLost=true;for(const fn of t.callbacks)fn('SIGNED_OUT',null);};
t.readAccess=async()=>{if(t.identityDelay)await new Promise(r=>setTimeout(r,t.identityDelay));if(t.authLost)throw Error('login_required');return{user};};
window.fetch=async(url,init)=>{if(!String(url).includes('/functions/v1/daily-devotional-admin'))throw Error('Unexpected request');const body=JSON.parse(init.body);t.calls.push(body);
 if(body.action==='content_list'){if(t.readDelay)await new Promise(r=>setTimeout(r,t.readDelay));if(t.readFail)return Response.json({ok:false,error:'unavailable'},{status:503});return Response.json({ok:true,items:t.rows.filter(r=>r.devotional_date>=body.from&&r.devotional_date<=body.to),writeVersionContract:t.contract?'devotional-version-v1':null,reviewerStage:'final'});}
 if(t.writeFail)return Response.json({ok:false,error:'unavailable'},{status:503});if(t.invalidAck)return Response.json({});
 if(t.rollback)return Response.json({ok:false,error:'invalid_action'},{status:400});if(t.schemaMissing)return Response.json({ok:false,error:'schema_not_ready'},{status:503});const row=t.rows.find(r=>r.id===body.id);if(t.previewConflict&&row){t.previewConflict=false;row.version++;row.devotional_title='另一位同工的合成新版本';}if(!row)return Response.json({ok:false,error:'not_found'},{status:409});if(body.expectedVersion!==row.version)return Response.json({ok:false,error:'version_conflict'},{status:409});Object.assign(row,body.values,{review_status:body.toStatus||'approved',version:row.version+1});if(t.afterWriteFail)t.readFail=true;return Response.json({ok:true,item:row});};
</script><script type="module" src="/daily-devotional-admin.mjs"></script>`;
const stubs={'/admin-db.mjs':'export const db=window.fixtureDb;','/admin-access.mjs':"export const readAccess=()=>t.readAccess();export const canOpen=()=>!t.denied;export const canAction=(a,c,k,action)=>!t.denied&&!t.readonly&&(action!=='export'||!t.exportDenied);"};
export async function createFixture(){
 const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://fixture').pathname;let data;
  if(file==='/fixture.html')data=(await readFile(path.join(root,'daily-devotional-admin.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<html lang="zh-Hant"','<html class="mplus-theme" lang="zh-Hant"').replace('<head>','<head><base href="/">').replace('</body>',bootstrap+'</body>');
  else if(stubs[file])data=stubs[file];else{const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));data=await readFile(target);}
  res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,errors=[];
 async function setup(browser,width=390,mode='owner'){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});await context.addInitScript(mode=>window.fixtureMode=mode,mode);
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();let answer=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>answer?d.accept():d.dismiss());
  await page.goto(origin+'/fixture.html');await ready(page);return{context,page,answer:v=>answer=v};
 }
 return{origin,setup,errors,close:()=>server.close()};
}
export const ready=page=>page.waitForFunction(()=>!document.querySelector('#devotional-reload').disabled);
export const edit=async page=>{await page.locator('[data-edit]').click();await page.locator('.devotional-editor').waitFor();};
export const device=(page,name)=>page.locator('#devotional-device').getByRole('button',{name,exact:true});
export const enable=async page=>{await device(page,'在這台裝置保留草稿').click();await page.waitForFunction(()=>document.querySelector('.devotional-device-status').textContent.startsWith('已保留於'));};
export const settled=page=>page.waitForFunction(()=>!document.querySelector('.review-panel[aria-busy=true]'));
export const writes=page=>page.evaluate(()=>t.calls.filter(c=>c.action!=='content_list'));
export const localRow=page=>page.evaluate(async()=>{const {createDevotionalDraftStore}=await import('/devotional-draft-store.mjs');return createDevotionalDraftStore().read(t.scope);});
export const updateRow=(page,change)=>page.evaluate(async change=>{const {createDevotionalDraftStore}=await import('/devotional-draft-store.mjs');const store=createDevotionalDraftStore(),row=await store.read(t.scope);return store.write(t.scope,row.revision,{...row,...change});},change);
export async function outputDir(name){const out=process.env.CHURCH_TEST_OUT||path.join(root,'tests/phase4/results',name);await mkdir(out,{recursive:true});return out;}
