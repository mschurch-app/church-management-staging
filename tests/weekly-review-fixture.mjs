import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {weekly} from './phase3/fixtures.mjs';
export const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..');
const rows=weekly().map((r,i)=>({...r,status:i===2?'published':'pending_review',submitted_at:'2026-10-22T10:00:00Z'}));
const bootstrap=`<script>
const user={id:'reviewer-one'},session={access_token:'synthetic-token',user};
window.t={rows:${JSON.stringify(rows)},promos:[],calls:[],readFail:false,listFail:false,promoFail:false,invalidRead:false,delay:0,sessionDelay:0,writeDelay:0,writeFail:false,unknownWrite:false,afterWriteFail:false,denied:false,approveDenied:false,canDecide:true,authLost:false,callbacks:[],actor:user.id,authReads:0};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
window.fixtureDb={auth:{getSession:async()=>{const value=t.authLost?null:{...session,user:{id:t.actor}};if(t.sessionDelay)await pause(t.sessionDelay);return{data:{session:value}};},onAuthStateChange:fn=>{t.callbacks.push(fn);return{data:{subscription:{unsubscribe(){}}}};}} ,storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'/assets/app/church-os-icon.svg'}})})}};
t.signOut=()=>{t.authLost=true;for(const fn of t.callbacks)fn('SIGNED_OUT',null);};
t.changeUser=()=>{t.actor='reviewer-two';for(const fn of t.callbacks)fn('SIGNED_IN',{...session,user:{id:t.actor}});};
t.refresh=()=>{for(const fn of t.callbacks)fn('TOKEN_REFRESHED',{...session,user:{id:t.actor}});};
t.readAccess=async()=>{t.authReads++;if(t.authLost)throw Error('login_required');return{user:{id:t.actor}};};
window.fetch=async(url,init)=>{
 const body=JSON.parse(init.body);t.calls.push({url:String(url),...body});const promo=String(url).endsWith('weekly-promo-review'),source=promo?t.promos:t.rows;
 if(String(url).endsWith('youtube-oauth'))return Response.json({ok:true,publication:null,candidates:[]});
 if(String(url).endsWith('weekly-canva'))return Response.json({ok:true,jobs:[{id:'synthetic-job'}],job:{id:'synthetic-job',status:'ready'}});
 if(String(url).endsWith('instagram-publishing'))return Response.json({ok:true,publication:null});
 if(body.action==='list'){const data=structuredClone(source);if(t.delay)await pause(t.delay);if(t.listFail||promo&&t.promoFail)return Response.json({ok:false,error:'unavailable'},{status:503});return Response.json({ok:true,items:data});}
 if(body.action==='get'){let row=structuredClone(source.find(r=>r.id===body.bulletinId));const canDecide=t.canDecide;if(t.delay)await pause(t.delay);if(t.readFail)return Response.json({ok:false,error:'unavailable'},{status:503});if(t.invalidRead&&row)row.id='wrong-item';return Response.json({ok:true,[promo?'promo':'bulletin']:row,canDecide});}
 if(t.writeDelay)await pause(t.writeDelay);
 if(t.writeFail)return Response.json({ok:false,error:'unavailable'},{status:503});
 if(t.unknownWrite)return Response.json({});
 const row=source.find(r=>r.id===body.bulletinId);if(row){row.status=body.action==='approve'?(promo?'approved':'published'):'changes_requested';row.version++;}
 if(t.afterWriteFail)t.listFail=true;
 return Response.json({ok:true,notificationPending:false});
};
</script><script type="module" src="/weekly-bulletin-review.mjs"></script>`;
const stubs={'/admin-db.mjs':'export const db=window.fixtureDb;','/admin-access.mjs':"export const readAccess=()=>t.readAccess();export const canOpen=()=>!t.denied;export const canAction=()=>!t.denied&&!t.approveDenied;"};
export async function createFixture(){
 const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://fixture').pathname;let data;
  if(file==='/fixture.html')data=(await readFile(path.join(root,'weekly-bulletin-review.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('<html lang="zh-Hant"','<html class="mplus-theme" lang="zh-Hant"').replace('</body>',bootstrap+'</body>');
  else if(stubs[file])data=stubs[file];else{const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));data=await readFile(target);}
  res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,errors=[];
 async function setup(browser,width=390,initial={}){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();let answer=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>answer?d.accept():d.dismiss());
  await page.goto(origin+'/fixture.html?church=M%2B');await ready(page);if(Object.keys(initial).length){await page.evaluate(values=>Object.assign(t,values),initial);await page.locator('#review-reload').click();await ready(page);}
  return{context,page,answer:v=>answer=v};
 }
 return{origin,setup,errors,close:()=>server.close()};
}
export const ready=page=>page.waitForFunction(()=>!document.querySelector('#review-reload').disabled&&document.querySelector('.review-layout').getAttribute('aria-busy')!=='true');
export const writes=page=>page.evaluate(()=>t.calls.filter(c=>!['list','get','weekly_status','list_sets','publication_status'].includes(c.action)));
export async function outputDir(){const dir=path.join(root,'tests/phase4/results/weekly-review');await mkdir(dir,{recursive:true});return dir;}
