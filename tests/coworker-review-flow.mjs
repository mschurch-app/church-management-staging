import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {database} from './phase1/bootstrap.mjs';
import {ROLE_TEMPLATES} from '../app-function-definitions.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'docs/reports/2026-10-22-coworker-review');
const db=await database(),checks=[],rpcErrors=[];
const owner='40000000-0000-4000-8000-000000000001';
let sequence=10;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const check=(truth,label)=>{assert(truth,label);checks.push(label);console.log('PASS',label);};
await db.exec("alter table public.app_notifications add church_id text,add title text,add body text,add target_url text;create unique index notifications_source on public.app_notifications(user_id,event_key,source_key) where source_key is not null");
await db.exec(await readFile(path.join(root,'supabase/migrations/20261022031549_line_coworker_applications.sql'),'utf8'));
await q('insert into auth.users(id) values($1)',[owner]);
await q("insert into church_auth.accounts(user_id,is_active,display_name,job_title) values($1,true,'合成擁有者','管理員')",[owner]);
await q('insert into church_auth.owners values($1)',[owner]);
await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims','{}',false)",[owner]);
const fixture=`<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/auth.css"><link rel="stylesheet" href="/coworker-application.css"><main id="applications"></main><p id="saved"></p><script type="module">import{mountCoworkerApplications}from'/admin-coworker-review.mjs';const db={rpc:async(name,args={})=>{const r=await fetch('/fixture-rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,args})});return r.json();}};await mountCoworkerApplications(db,document.querySelector('#applications'),{onSaved:()=>{if(new URLSearchParams(location.search).has('refresh-fails'))throw Error('Synthetic refresh failure');document.querySelector('#saved').textContent='已儲存';}});</script></html>`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/fixture-rpc'){
   let body='';for await(const chunk of req)body+=chunk;
   const {name,args:a}=JSON.parse(body);let data;
   try{
    await db.exec('set role authenticated');
    if(name==='list_coworker_applications')data=await scalar('select public.list_coworker_applications()');
    else if(name==='review_coworker_application')data=await scalar('select public.review_coworker_application($1,$2,$3,$4::jsonb,$5,$6)',[a.p_user,a.p_expected_version,a.p_decision,JSON.stringify(a.p_input),a.p_source_user,a.p_note]);
    else throw Error('Unexpected RPC');
    res.setHeader('content-type','application/json');res.end(JSON.stringify({data,error:null}));
   }catch(e){rpcErrors.push({code:e.code,message:e.message});res.setHeader('content-type','application/json');res.end(JSON.stringify({data:null,error:{message:e.message,code:e.code}}));}
   finally{await db.exec('reset role');}
   return;
  }
  if(url.pathname==='/fixture.html'){res.setHeader('content-type','text/html; charset=utf-8');res.end(fixture);return;}
  const file=path.resolve(root,'.'+url.pathname);assert(file.startsWith(root+path.sep));
  res.setHeader('content-type',/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'image/svg+xml');res.end(await readFile(file));
 }catch{res.writeHead(500).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
async function applicant(){
 await q("delete from church_auth.mplus_staff_applications where status='pending'");
 const id='40000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');
 await q('insert into auth.users(id) values($1)',[id]);
 await q("insert into auth.identities values($1,'custom:line-web',$2,'{}')",[id,'synthetic-'+id]);
 await q("insert into church_auth.mplus_staff_applications(user_id,full_name,church_id,ministry,status) values($1,'合成申請人','M+','影音','pending')",[id]);
 return id;
}
try{
 await mkdir(out,{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();
  try{
   const id=await applicant();await page.goto(origin+'/fixture.html');await page.click('#applications>article>details>summary');await page.locator('select').nth(0).selectOption('approve');await page.locator('select').nth(1).selectOption('administrator');
   await page.locator('[data-application-role]').selectOption('custom');
   check(await page.locator('[data-application-permission]:checked').count()===ROLE_TEMPLATES.administrator.permissions.length,engine+': choosing custom manually preserves existing checks');
   await page.locator('[data-application-role]').selectOption('administrator');
   await page.check('[data-application-permission="heat_camp"]');
   check(await page.locator('[data-application-role]').inputValue()==='custom',engine+': grant edits immediately show custom role without clearing checks');
   check((await page.locator('[id^=application-role-help]').textContent()).includes('目前勾選'),engine+': custom role change is explained beside the selector');
   await page.locator('[data-application-role]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'custom-role-'+engine+'.local.png')});
   // The complete UI payload goes to the real PostgreSQL review/save functions.
   await page.click('button[type=submit]');
   await page.waitForFunction(()=>document.querySelector('#saved').textContent==='已儲存'||document.querySelector('.form-message')?.textContent&&!document.querySelector('button[type=submit]')?.disabled);
   check(await page.locator('#saved').textContent()==='已儲存',engine+': edited role template is accepted by the actual PostgreSQL contract');
   const grants=await q('select permission from church_auth.grants where user_id=$1 order by permission',[id]);
   assert.deepEqual(grants.map(r=>r.permission),[...ROLE_TEMPLATES.administrator.permissions,'heat_camp'].sort());
   check(await scalar('select role_key from church_auth.account_roles where user_id=$1',[id])==='custom',engine+': changed role is stored as custom with exactly selected grants');
   check(await scalar('select count(*)::int from church_auth.owners where user_id=$1',[id])===0,engine+': approval does not grant owner rights');
   check(await scalar("select count(*)::int from church_auth.coworker_application_audit where applicant_user_id=$1 and action='approve'",[id])===1,engine+': one approval audit is written');
   const unchanged=await applicant();await page.goto(origin+'/fixture.html');await page.click('#applications>article>details>summary');await page.locator('select').nth(0).selectOption('approve');await page.locator('[data-application-role]').selectOption('facilities');await page.locator('.application-permission').filter({has:page.locator('[data-application-permission="spaces"]')}).locator('summary').click();await page.check('[data-application-action="spaces:edit"]');
   check(await page.locator('[data-application-role]').inputValue()==='facilities',engine+': changing operations alone preserves a matching role template');
   await page.click('button[type=submit]');await page.locator('#saved').filter({hasText:'已儲存'}).waitFor();
   check(await scalar('select role_key from church_auth.account_roles where user_id=$1',[unchanged])==='facilities',engine+': unchanged template persists through PostgreSQL');
   check(await scalar("select can_edit from church_auth.account_feature_permissions where user_id=$1 and feature_key='spaces'",[unchanged])===true,engine+': explicitly selected operation is stored');
   const removed=await applicant();await page.goto(origin+'/fixture.html?refresh-fails=1');await page.click('#applications>article>details>summary');await page.locator('select').nth(0).selectOption('approve');await page.locator('[data-application-role]').selectOption('care');await page.locator('.application-permission').filter({has:page.locator('[data-application-permission="members"]')}).locator('summary').click();await page.check('[data-application-action="members:edit"]');await page.uncheck('[data-application-permission="private_prayers"]');
   check(await page.locator('[data-application-role]').inputValue()==='custom'&&await page.locator('[data-application-action="members:edit"]').isChecked(),engine+': removing a grant keeps other selected operation rights');
   await page.click('button[type=submit]');await page.getByText('審核結果已儲存，帳號名單暫時無法更新；請重新讀取帳號名單。',{exact:true}).waitFor();
   assert.deepEqual((await q('select permission from church_auth.grants where user_id=$1 order by permission',[removed])).map(r=>r.permission),ROLE_TEMPLATES.care.permissions.filter(k=>k!=='private_prayers').sort());
   check(await scalar('select role_key from church_auth.account_roles where user_id=$1',[removed])==='custom',engine+': PostgreSQL saves exactly reduced custom grants');
   check(await page.locator('button[type=submit]').count()===0&&await scalar("select status from church_auth.mplus_staff_applications where user_id=$1",[removed])==='approved',engine+': post-save refresh failure reports saved state and offers no duplicate approval');
   const stale=await applicant();await page.goto(origin+'/fixture.html');await page.click('#applications>article>details>summary');await page.locator('select').nth(0).selectOption('approve');await page.check('[data-application-permission="members"]');await page.locator('textarea').fill('合成審核備註');
   await q("update church_auth.mplus_staff_applications set updated_at=updated_at+interval '1 second' where user_id=$1",[stale]);
   await page.click('button[type=submit]');await page.locator('.form-message').filter({hasText:'申請已被更新'}).waitFor();
   await page.locator('.form-message').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'stale-review-'+engine+'.local.png')});
   check(await page.locator('textarea').inputValue()==='合成審核備註'&&await page.locator('[data-application-permission="members"]').isChecked()&&await page.locator('button[type=submit]').isEnabled()&&await page.locator('.form-message').getAttribute('data-tone')==='error',engine+': stale review reports the real error and retains input and selections');
   check(await scalar('select count(*)::int from church_auth.grants where user_id=$1',[stale])===0&&await scalar("select status from church_auth.mplus_staff_applications where user_id=$1",[stale])==='pending',engine+': rejected stale review grants nothing and remains pending');

  }finally{await context.close();await browser.close();}
 }
 await writeFile(path.join(out,'flow-results.json'),JSON.stringify({synthetic:true,production_writes:false,real_postgresql_contract:true,physical_iPhone:false,checks},null,2));
 console.log('TOTAL',checks.length);
}finally{server.close();await db.close();}
