import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root=path.resolve(import.meta.dirname,'..');
const source=await readFile(path.join(root,'mplus-dashboard-ui.mjs'),'utf8');
assert.match(source,/autoPromptRoutineSetup:access\.user\.title!=='師母'/);
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep))throw Error('outside fixture');
  const data=await readFile(file);
  res.setHeader('content-type',pathname.endsWith('.html')?'text/html; charset=utf-8':/\.(mjs|js)$/.test(pathname)?'text/javascript':'application/octet-stream');
  res.end(data);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const [kind,query] of [['spouse','?required&spouse'],['coworker','?required']]){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/tests/mplus-planner-fixture.html'+query);
  await page.getByRole('button',{name:'例行工作',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#fixture-actions')?.textContent.includes('routine-status'));
  if(kind==='spouse'){
   assert.equal(await page.locator('dialog[open]').count(),0,'spouse should not see the automatic setup prompt');
   await page.getByRole('button',{name:'例行工作',exact:true}).click();
   await page.getByRole('button',{name:'＋ 新增例行工作'}).click();
   assert.equal(await page.locator('dialog[open]').count(),1,'spouse can still add a routine manually');
  }else{
   await page.locator('dialog[open]').waitFor();
   assert.match(await page.locator('dialog[open]').textContent(),/例行工作/,'other coworkers still see onboarding');
  }
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('PASS: spouse has no automatic routine prompt; manual creation and coworker onboarding remain available');
}finally{await browser.close();server.close();}
