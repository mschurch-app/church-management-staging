// Actual page and UI module with isolated synthetic responses. No external request is sent.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {contrastMetrics} from './phase3/contrast.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/james-codex/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),base='3dbe5a94b415b01b7ee32e0a5be0baebea460f88',mode=process.argv[2]||'after',out=path.join(root,'tests/phase4/results/social-review-workspace',mode);
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const file=new URL(req.url,'http://fixture').pathname;
 if(/^\/sample-[123]\.svg$/.test(file)){
  const num=file.match(/\d/)[0];res.setHeader('content-type','image/svg+xml');return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600"><rect width="480" height="600" fill="#e4eade"/><rect x="20" y="20" width="440" height="330" rx="20" fill="#456558"/><text x="240" y="180" text-anchor="middle" fill="white" font-size="36" font-family="sans-serif">合成素材 ${num}</text><text x="40" y="410" fill="#203c35" font-size="30" font-family="sans-serif">一次勇敢的對話</text><text x="40" y="465" fill="#52665a" font-size="22" font-family="sans-serif">測試用圖・非真實講員</text></svg>`);
 }
 if(file==='/sample.mp4')return res.writeHead(204).end();
 const target=path.resolve(root,'.'+file);assert(target.startsWith(root+path.sep));
 let data=mode==='before'&&['/sermon-social-review.html','/sermon-social-review.mjs','/sermon-social-review.css'].includes(file)?execFileSync('git',['show',base+':'+file.slice(1)],{cwd:root}):await readFile(target);
 if(file==='/church-brand.mjs')data=data.toString().replace('await readAccess(db)',JSON.stringify({user:{name:'合成同工',title:'測試審核'},churches:['M+'],grants:[],featurePermissions:[]})).replace('await loadChurchCustomizations(db,selected)','null');
 if(file==='/sermon-social-review.mjs')data=data.toString().replace("import {db} from './admin-db.mjs?v=20261012-readable2';",`const db={auth:{getSession:async()=>({data:{session:{access_token:'isolated-fixture'}}})},storage:{from:()=>({uploadToSignedUrl:async()=>({error:null})})}};`);
 res.setHeader('content-type',file.endsWith('.html')?'text/html;charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.jpg')?'image/jpeg':'image/svg+xml');res.end(data);
 }catch(e){res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const id='71000000-0000-4000-8000-000000000001';
const caption='一次勇敢的對話，可能成為另一個人認識盼望的起點。\n\n腓利走近那輛車，先問了一句：「你所念的，你明白嗎？」他願意先聆聽，也願意陪伴對方讀懂經文。\n\n我們不必等到所有答案都準備好，才開始關心身旁的人。這週可以從一個真誠的問題開始：你最近過得好嗎？\n\n這是合成測試稿，不作為正式講道內容。';
function fixture(kind='image',role='initial') {const reel=kind==='reel'||kind==='upload';return {ok:true,can_review_ig:role!=='readonly',can_publish_direct:false,is_final_reviewer:role==='final',youtube_workflow:{status:'review_ready'},draft:{id,sermon_title:'一次勇敢的對話：從聆聽開始的信仰旅程',service_date:'2026-10-25',speaker:'合成講員',scripture:'使徒行傳 8:26–39',youtube_url:origin+'/source',sermon_start_seconds:1200,sermon_end_seconds:3600,review_stage:role==='final'?'pastoral_confirmation':'initial_review',status:kind==='upload'?'changes_requested':'pending_review',social_media_type:reel?'reel':'image',social_video_url:reel?origin+'/sample.mp4':'',social_image_options:reel?[]:[1,2,3].map(n=>origin+'/sample-'+n+'.svg'),social_image_url:origin+'/sample-1.svg',youtube_caption_requested:kind!=='upload'||role==='final',subtitles_ready:true,subtitle_cues:Array.from({length:8},(_,n)=>({start_seconds:n*20,end_seconds:n*20+19,text:'合成字幕 '+(n+1)+'：走近對方，聆聽心裡的問題，再一起讀懂經文。'})),outline:['回應呼召，願意走近陌生人。','從對方正在思考的問題開始對話。','以經文分享盼望，讓對方自由回應。'],key_points:['先聆聽，才能理解真正的需要。','真誠陪伴，把關懷化成具體行動。'],applications:['主動問候一位最近較少聯絡的朋友。','在對話中先聽完對方的想法，再分享自己的經驗。'],caption}};}
const results=[],checks=[],failures=[];function check(ok,name){assert(ok,name);checks.push(name);}
async function open(browser,width,kind='image',role='initial'){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),state={data:fixture(kind,role),calls:[],fail:false,delay:0,errors:[],blocked:[]};
 page.on('pageerror',e=>state.errors.push(e.message));
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/functions/v1/sermon-social-review'){
   const b=req.postDataJSON();state.calls.push(b);if(state.delay&&b.action!=='get')await new Promise(r=>setTimeout(r,state.delay));
   let data=state.data,status=200;
   if(b.action!=='get'){
    if(state.fail){status=503;data={ok:false,error:'合成測試：暫時無法儲存'};}
    else if(b.action==='save'){Object.assign(state.data.draft,{caption:b.caption,speaker:b.speaker,scripture:b.scripture,social_image_url:b.socialImageUrl});data=state.data;}
    else if(b.action==='prepare_reel_upload')data={ok:true,video:{path:'fixture.mp4',token:'fixture'},cover:{path:'fixture.jpg',token:'fixture'}};
    else if(b.action==='complete_reel_upload'){state.data.draft.status='pending_review';data={ok:true};}
    else if(b.action==='approve')data={ok:true,status:role==='final'?'approved':'pastoral_confirmation',instagram:{status:'failed',error:'instagram_timeout'}};
    else if(b.action==='reject')data={ok:true,status:'changes_requested'};
    else if(b.action==='confirm_youtube_edit')data={ok:true,status:'review_ready',youtube_workflow:{status:'review_ready',edit_confirmed_at:'2026-10-23',edit_mode:b.editMode,caption_offset_seconds:b.captionOffsetSeconds}};
    else throw Error('Unexpected isolated action '+b.action);
   }
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  }
  if(url.origin!==origin){state.blocked.push(url.origin);return route.abort();}return route.continue();
 });
 await page.goto(origin+'/sermon-social-review.html?church=M%2B&draft='+id);await page.locator('#content:not([hidden])').waitFor();await page.evaluate(()=>document.fonts.ready);
 return {page,context,state};
}
try{for(const engine of mode==='before'?['chromium']:['chromium','webkit']){
 const browser=await (engine==='chromium'?chromium:webkit).launch(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
 try{for(const width of [390,1440])for(const kind of ['image','reel']){
  const {page,context,state}=await open(browser,width,kind),prefix=`${kind} ${engine} ${width}`;
  try{
   const metrics=await page.evaluate(()=>({height:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,header:document.querySelector('.page-header').getBoundingClientRect().height,captionTop:Math.round(document.querySelector('#caption').getBoundingClientRect().top+scrollY)}));
   await page.screenshot({path:path.join(out,`${kind}-${engine}-${width}.png`),fullPage:true});await page.screenshot({path:path.join(out,`${kind}-${engine}-${width}-viewport.png`)});
   const contrast=await page.evaluate(contrastMetrics);results.push({prefix,...metrics,contrast});
   await page.locator(kind==='image'?'.artwork-review':'#reel-review').evaluate(n=>scrollTo(0,n.getBoundingClientRect().top+scrollY-20));
   await page.screenshot({path:path.join(out,`${kind}-${engine}-${width}-workspace.png`)});
   await page.locator('#caption').evaluate(n=>scrollTo(0,n.closest('section').getBoundingClientRect().top+scrollY-20));
   await page.screenshot({path:path.join(out,`${kind}-${engine}-${width}-caption.png`)});
   if(mode==='before')continue;
   check(metrics.scrollWidth<=width+1&&Math.round(metrics.header)===164,prefix+' normal width/header');
   check(!contrast.failures.length,prefix+' text contrast: '+JSON.stringify(contrast.failures));
   const small=await page.locator('button:not(:disabled),input:not([type=radio]),.social-review-nav a,.social-back-link,a.secondary').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length&&n.getBoundingClientRect().height<43.5).map(n=>n.id));
   check(!small.length,prefix+' 44px controls '+JSON.stringify(small));
   check((await page.locator('#form #caption').count())===1&&(await page.locator('#form #approve').count())===1,prefix+' editing and submit retain form ownership');
   const edit=caption+'\n保留這一段修改。';await page.fill('#caption',edit);await page.click('a[href="#review-caption"]');
   check(await page.locator('#caption').inputValue()===edit&&state.calls.length===1,prefix+' section navigation preserves edits without requests');
   check((await page.locator('#caption-count').innerText()).startsWith(edit.length.toLocaleString('zh-TW')),prefix+' caption length follows input');
   await page.locator('a[href="#review-decision"]').click();await page.keyboard.press('Tab');
   check(await page.evaluate(()=>Boolean(document.activeElement.closest('#review-decision'))),prefix+' section target supports keyboard continuation');
   await page.click('.social-back-link');check(await page.evaluate(()=>document.activeElement.id==='review-navigation'),prefix+' back to section navigation');
   if(kind==='image'){
    await page.locator('input[name="social-image"]').first().focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    check(await page.locator('input[name="social-image"]').nth(2).isChecked(),prefix+' all image candidates selectable by keyboard');
   }
   state.fail=true;await page.click('#save');await page.waitForFunction(()=>document.querySelector('#action-status').textContent.includes('暫時無法儲存'));
   check(await page.locator('#caption').inputValue()===edit&&!await page.locator('#save').isDisabled(),prefix+' failed save retains edits and re-enables retry');
   state.fail=false;state.delay=150;await page.locator('#save').evaluate(n=>{n.click();n.click();});await page.waitForFunction(()=>document.querySelector('#action-status').textContent==='修改已儲存。');
   const saved=state.calls.filter(c=>c.action==='save');check(saved.length===2&&saved[1].caption===edit&&saved[1].socialImageUrl.endsWith(kind==='image'?'3.svg':'1.svg'),prefix+' retry saves selected asset and edited text once');
   const actions=await page.locator('.review-actions').evaluate(n=>({position:getComputedStyle(n).position,top:n.getBoundingClientRect().top,comment:document.querySelector('#comment').getBoundingClientRect().bottom}));check(actions.position==='static'&&actions.top>=actions.comment,prefix+' action controls do not cover comments');
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),prefix+' 200% text without page overflow');
   check(!state.errors.length&&!state.blocked.length,prefix+' no page errors or external requests');
  }catch(e){failures.push({prefix,error:e.stack});console.error(prefix,e.message);}finally{await context.close();}
 }
 if(mode!=='before')for(const role of ['readonly','final']){
  const {page,context,state}=await open(browser,390,'image',role),prefix=engine+' '+role;
  try{if(role==='readonly'){
   check(await page.locator('#save').isDisabled()&&await page.locator('#reject').isDisabled()&&await page.locator('#approve').isDisabled(),prefix+' existing permission gates remain disabled');
   await page.locator('a[href="#review-caption"]').click();check(state.calls.length===1,prefix+' readonly navigation sends no writes');
  }else{
   state.delay=200;await page.locator('#approve').evaluate(n=>{n.click();n.click();});await page.waitForFunction(()=>document.querySelector('#ig-publication-status').textContent.includes('內容已核准'));
   check(state.calls.filter(c=>c.action==='approve').length===1&&await page.locator('#approve').isDisabled(),prefix+' duplicate approval suppressed');
   check(await page.locator('#retry-instagram').isVisible()&&await page.locator('#ig-publication-status').isVisible(),prefix+' acknowledged approval with failed publishing retains status and retry');
   await page.click('#youtube-full');await page.waitForFunction(()=>document.querySelector('#youtube-edit-note').textContent.includes('保留完整直播'));
   check(state.calls.filter(c=>c.action==='confirm_youtube_edit').length===1,prefix+' independent YouTube controls remain usable');
  }}catch(e){failures.push({prefix,error:e.stack});console.error(prefix,e.message);}finally{await context.close();}
 }
 if(mode!=='before'){
  const {page,context}=await open(browser,390,'upload');try{check(await page.locator('#youtube-jump').isHidden()&&await page.locator('#reel-upload').isVisible()&&await page.locator('#media-jump').isVisible(),engine+' only available sections have navigation');}finally{await context.close();}
 }
 if(mode!=='before'){
  const {page,context,state}=await open(browser,390,'upload','final');try{
   await page.locator('#reel-file').setInputFiles({name:'fixture.mp4',mimeType:'video/mp4',buffer:Buffer.from('synthetic-video')});
   await page.locator('#cover-file').setInputFiles({name:'fixture.jpg',mimeType:'image/jpeg',buffer:Buffer.from('synthetic-cover')});
   await page.click('#send-reel-review');await page.waitForFunction(()=>document.querySelector('#reel-upload').hidden);
   check(!await page.locator('#youtube-full').isDisabled()&&state.calls.filter(c=>c.action==='complete_reel_upload').length===1,engine+' upload completion restores independent YouTube controls');
  }catch(e){failures.push({prefix:engine+' upload',error:e.stack});}finally{await context.close();}
 }
 }finally{await browser.close();}
}
}finally{server.close();await writeFile(path.join(out,'checks.json'),JSON.stringify({mode,base,productionWrites:0,real_iPhone:false,real_Mac_Safari:false,results,checks,failures},null,2));}
console.log(JSON.stringify({checks:checks.length,failures},null,2));assert.equal(failures.length,0);
