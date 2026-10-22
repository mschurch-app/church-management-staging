import {reviewQueue} from './weekly-review-queue.mjs?v=20261022-experience22';
import {initWeeklyYoutube} from './weekly-youtube.mjs?v=20261022-experience21';
import {weeklyMetadata} from './weekly-youtube-content.mjs?v=20261021-weekly-link1';
import {db} from './admin-db.mjs?v=20261012-readable2';
import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261022-experience5';

import {workflowSummary,apiResult,uncertainWrite,lockControls,draftGuard,reviewDialog} from './app-workflow.mjs?v=20261009-stage4';

const ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/weekly-bulletin-review';
const PROMO_ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/weekly-promo-review';
const CANVA_ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/weekly-canva';
const INSTAGRAM_ENDPOINT='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/instagram-publishing';
const $=selector=>document.querySelector(selector),params=new URLSearchParams(location.search),church=params.get('church')||'M+';
let youtubePreview=null;
let current=null,items=[],busy=false,reading=false,recovery=false,readVersion=0,requestedId=null,authorized=false,actorId=null,authEpoch=0,authChecking=false;
const guard=draftGuard(document.querySelector('#review-actions'),dirty=>{const note=$('#review-draft-state');note.textContent=dirty?'審核意見尚未送出；切換或重新載入前會先確認。':'審核意見只保留在目前頁面，送出後才會保存。';note.dataset.dirty=String(dirty);});
const statusText={pending_initial:'等待鈺庭初審',pending_review:'等待牧師／師母審核',changes_requested:'已退回',published:'週報已發布',approved:'預告已核准'};
function setStatus(text,tone=''){const node=$('#status');node.textContent=text;node.dataset.tone=tone;}
function reviewAccessMessage(row){return row&&!row.canDecide&&['pending_initial','pending_review'].includes(row.status)?'這筆內容目前僅供檢視；此帳號無法核准或退回。若審核分工已調整，請重新載入確認。':'';}
function renderAccessNote(row){const note=$('#review-access-note');note.textContent=reviewAccessMessage(row);note.hidden=!note.textContent;}
function renderLoadNote(results){const labels=['主日社群預告','主日週報'],missing=results.flatMap((r,i)=>r.status==='rejected'?[labels[i]]:[]),note=$('#review-load-note');note.hidden=!missing.length;note.textContent=missing.length?missing.join('、')+' 暫時無法載入。'+(missing.length===1?'目前先顯示另一份清單；':'')+'請按「重新載入」確認完整紀錄。':'';}
function loadedStatus(message){const partial=!$('#review-load-note').hidden,readonly=!!reviewAccessMessage(current);setStatus(partial?'部分清單尚未載入，請確認上方提示。':readonly?'已載入，這筆內容僅供檢視。':message,partial||readonly?'':'success');}

const pending=row=>!!row&&['pending_initial','pending_review'].includes(row.status);
function syncControls(){
 const waiting=busy||reading||authChecking,eligible=authorized&&current?.canDecide===true&&pending(current);
 $('.review-layout').setAttribute('aria-busy',String(waiting));
 $('#review-reload').disabled=waiting;
 $('#review-choose-another').hidden=!authorized||!recovery;$('#review-choose-another').disabled=waiting;
 $('#review-actions').hidden=!authorized||!current||!eligible&&!guard.dirty||recovery&&!guard.dirty;
 $('#review-comment').disabled=waiting||!authorized||!eligible&&!guard.dirty;
 if(guard.dirty&&!waiting)$('#review-comment').readOnly=!eligible;else $('#review-comment').readOnly=false;
 for(const id of ['approve','request-changes','canva-review-more','retry-line'])$('#'+id).disabled=waiting||recovery||!eligible;
 document.querySelectorAll('.review-choice').forEach(button=>button.disabled=busy||recovery||!authorized);
 youtubePreview?.sync();
}
function checkedRow(result,id,track){
 const row=track==='promo'?result.promo:result.bulletin;
 if(!row||row.id!==id||row.church_id!==church||!Number.isSafeInteger(row.version)||row.version<1||typeof row.service_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.service_date)||typeof row.title!=='string'||!['draft','pending_initial','pending_review','changes_requested','published','approved'].includes(row.status))throw new Error('審核內容回應不完整，原有意見已保留，請重新載入確認。');
 return {...row,track,canDecide:result.canDecide===true};
}
function applyRow(row){
 current=row;requestedId=row.id;recovery=false;guard.clear();renderPreview(row);renderList();summary(row);
}

const changed=()=>Object.assign(new Error('登入或權限已變更，請重新載入確認。'),{name:'AccessChangedError'});
function assertIdentity(epoch){if(epoch!==authEpoch||!authorized)throw changed();}
function invalidateIdentity(message='登入已變更，請重新登入後載入審核內容。'){
 authEpoch++;readVersion++;authorized=false;actorId=null;current=null;requestedId=null;items=[];busy=false;reading=false;authChecking=false;recovery=true;
 guard.clear();$('#review-comment').value='';$('#preview').replaceChildren(Object.assign(document.createElement('p'),{textContent:message,className:'workflow-empty'}));
 $('#review-load-note').hidden=true;renderAccessNote(null);youtubePreview=null;
 document.querySelector('.workflow-dialog[open]')?.dispatchEvent(new Event('cancel',{cancelable:true}));
 renderList();summary(null);syncControls();setStatus(message,'error');
}
async function verifyAccess(epoch=authEpoch,{approve=false}={}){
 const access=await readAccess(db,{fresh:true});
 if(epoch!==authEpoch)throw changed();
 if(!access.user?.id||actorId&&access.user.id!==actorId||!canOpen(access,church,'website_weekly')){invalidateIdentity();throw changed();}
 if(approve&&!canAction(access,church,'website_weekly','approve')){if(current)current.canDecide=false;recovery=true;renderAccessNote(current);syncControls();throw new Error('審核權限已變更，意見仍保留；請重新載入確認。');}
 return access;
}
async function reviewRequest(endpoint,action,payload={},milliseconds=15000){
 const epoch=authEpoch;assertIdentity(epoch);
 if(!['list','get','publication_status','weekly_status','weekly_live_info'].includes(action))await verifyAccess(epoch,{approve:true});
 const session=await db.auth.getSession();assertIdentity(epoch);
 const token=session.data.session?.access_token;
 if(!token||session.data.session?.user?.id!==actorId){invalidateIdentity();throw changed();}
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(milliseconds),body:JSON.stringify({action,church,...payload})});
 assertIdentity(epoch);const result=await apiResult(response);assertIdentity(epoch);
 if(response.status===401||result.error==='login_required'||result.error==='forbidden'){invalidateIdentity();throw changed();}
 return {response,result};
}
async function recheckAccess(){
 if(!authorized||busy||reading||authChecking||document.visibilityState==='hidden')return;
 const epoch=authEpoch,selected=current,sequence=readVersion;authChecking=true;syncControls();
 try{await verifyAccess(epoch);if(!selected)return;const result=await api('get',{bulletinId:selected.id,track:selected.track});assertIdentity(epoch);if(current!==selected||sequence!==readVersion)return;const row=checkedRow(result,selected.id,selected.track);
  if(row.version!==selected.version||row.status!==selected.status){recovery=true;setStatus('內容或審核狀態已有更新，意見仍保留；請重新載入確認。','error');}
  selected.canDecide=row.canDecide;renderAccessNote(selected);
 }catch(error){if(epoch===authEpoch){recovery=true;setStatus(error.message||'無法確認目前權限，意見仍保留，請重新載入。','error');}}
 finally{if(epoch===authEpoch){authChecking=false;syncControls();}}
}
db.auth.onAuthStateChange?.((event,session)=>{
 if(event==='SIGNED_OUT'||actorId&&session?.user?.id&&session.user.id!==actorId){invalidateIdentity();return;}
 // Defer verification until after the synchronous Auth callback releases its lock.
 if(['TOKEN_REFRESHED','USER_UPDATED'].includes(event)&&authorized)setTimeout(()=>{void recheckAccess();},0);
});
window.addEventListener('focus',()=>{void recheckAccess();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void recheckAccess();});

async function api(action,payload={}){
  const track=payload.track||'bulletin',endpoint=track==='promo'?PROMO_ENDPOINT:ENDPOINT;
  const {response,result}=await reviewRequest(endpoint,action,payload);
  if(!response.ok){const messages={reviewer_required:'目前帳號不是這一階段的審核人。',self_review_forbidden:'建立者不能審核自己送出的內容。',comment_required:'退回前請填寫需要修改的內容。',conflict:'這份週報已被其他人處理，請重新載入。',not_found:'找不到這份週報。'};if(['conflict','not_found','reviewer_required','self_review_forbidden'].includes(result.error)){recovery=true;if(current&&['reviewer_required','self_review_forbidden'].includes(result.error))current.canDecide=false;renderAccessNote(current);}throw new Error(messages[result.error]||'目前無法處理週報審核。');}
  return result;
}
async function canvaApi(action,payload={}){
  const {response,result}=await reviewRequest(CANVA_ENDPOINT,action,payload,45000);
  if(!response.ok||!result.ok)throw new Error(({reviewer_required:'只有本段初審人可再產生三套圖。',credit_quota_exceeded:'Canva AI 額度已用完，原三套圖仍保留。',connection_required:'Canva 連線已失效，請管理員重新連線。',invalid_status:'本份預告已離開初審階段。'}[result.error])||'Canva 再生圖尚未完成，請稍後重試。');return result;
}
async function instagramApi(action,payload={}){
  const {response,result}=await reviewRequest(INSTAGRAM_ENDPOINT,action,payload,60000);
  if(!response.ok||!result.ok)throw new Error(({instagram_timeout:'Instagram 尚在處理影片，請稍後再按重試。',instagram_processing:'Instagram 無法處理這支影片，請同工重新產生 Reel。',instagram_already_published:'Instagram 已接受發布，請先檢查帳號，避免重複貼文。',permission_missing:'Instagram 發布權限不足，請檢查連線。',token_expired:'Instagram 連線已過期，請重新連結。'}[result.error])||'Instagram 發布失敗，請檢查發布紀錄。');
  return result;
}
async function refreshInstagram(row){
  const panel=$('#instagram-publication'),message=$('#instagram-publication-message'),button=$('#instagram-retry');if(!panel||!message||!button||current!==row)return;
  try{const result=await instagramApi('publication_status',{bulletinId:row.id});if(current!==row)return;const job=result.publication;
    message.textContent=job?.status==='published'?'Instagram Reel 已發布。':job?.status==='processing'?'Instagram 正在處理 Reel，請稍後確認。':job?.status==='failed'?({'instagram_timeout':'影片處理逾時，尚未發布；可接續原工作重試。','instagram_processing':'Instagram 無法處理影片，請同工檢查檔案。','instagram_already_published':'Instagram 回報已發布，請先核對帳號內容。'}[job.error_code]||'Instagram 發布失敗，尚未出現在帳號；可重試。'):'目前沒有 Instagram 發布紀錄。';
    button.hidden=job?.status!=='failed'||job.error_code==='instagram_processing'||job.error_code==='instagram_already_published'||!authorized;
  }catch(error){if(current===row){message.textContent=error.message||'無法確認 Instagram 發布狀態。';button.hidden=true;}}
}
async function retryInstagram(row){
  const epoch=authEpoch,button=$('#instagram-retry'),message=$('#instagram-publication-message');if(!authorized||authChecking||reading||recovery||!row||current!==row||row.track!=='promo'||row.status!=='approved'||busy||!button||!message)return;
  busy=true;syncControls();button.disabled=true;message.textContent='正在接續原本的 Instagram 發布工作…';
  try{const result=await instagramApi('publish',{bulletinId:row.id});if(current===row)message.textContent=result.status==='published'?'Instagram Reel 已發布。':'Instagram 仍在處理影片。';}
  catch(error){if(current===row)message.textContent=error.message||'Instagram 尚未發布。';}
  finally{if(epoch===authEpoch){busy=false;button.disabled=false;syncControls();if(current===row)await refreshInstagram(row);}}
}
async function showCanvaSets(row){
  const area=$('#review-canva-options');if(!area||row!==current)return;
  const result=await canvaApi('list',{bulletinId:row.id});if(row!==current)return;
  area.replaceChildren();for(const [batch,job] of (result.jobs||[]).entries())for(let n=1;n<=3;n++){
    const home=job.outputs?.[`option${n}_home`],ig=job.outputs?.[`option${n}_ig`];if(!home?.path||!ig?.path)continue;
    const card=document.createElement('div');card.className='review-canva-card';const title=document.createElement('strong');title.textContent=`第 ${batch+1} 批 · 設計 ${n}`;card.append(title);
    for(const [label,path] of [['官網橫圖',home.path],['IG 直圖',ig.path]]){const image=document.createElement('img');image.alt=`${title.textContent} ${label}`;image.loading='lazy';image.decoding='async';image.src=db.storage.from('church-website-public-media').getPublicUrl(path).data.publicUrl;card.append(image);}
    area.append(card);
  }
  $('#canva-review-more').hidden=row.track!=='promo'||row.status!=='pending_initial'||!row.canDecide||(result.jobs||[]).length>=2;
}
async function moreCanva(){
  const epoch=authEpoch,row=current;if(!row||!authorized||authChecking||reading||recovery||row.track!=='promo'||row.status!=='pending_initial'||!row.canDecide||busy)return;
  const accepted=await reviewDialog({title:'再產生三套 Canva 圖？',description:'會使用教會 Canva AI 額度。原有三套保留，新三套完成後與原方案並列；請審核人退回後由同工挑選。',withNote:false,confirmLabel:'產生新三套'});if(accepted===null||epoch!==authEpoch||current!==row||busy||reading||authChecking||recovery||!authorized)return;
  busy=true;syncControls();
  try{
    const input={TOPIC:row.sermon_topic,SCRIPTURE:row.sermon_scripture,SPEAKER:row.sermon_speaker,SERVICE_DATE:row.service_date,SUBTITLE:row.subtitle||'',SERVICE_TIME:row.service_time||''};
    let result=await canvaApi('review_start',{requestId:crypto.randomUUID(),bulletinId:row.id,input,aiConsent:true}),job=result.job;
    for(let attempt=0;attempt<28&&job.status==='working';attempt++){
      if(row!==current)break;setStatus(`Canva 正在製作第二批三套圖（${job.progress||0}%）。`);
      await new Promise(resolve=>setTimeout(resolve,Math.min(4000,Math.max(1500,Number(job.retryAfterMs)||2000))));
      if(row!==current||epoch!==authEpoch)break;
      result=await canvaApi('advance',{jobId:job.id});job=result.job;
    }
    if(row!==current)return;
    if(job.status==='ready'){await showCanvaSets(row);setStatus('第二批三套圖已完成。請比較六套方案，必要時退回讓同工選圖。','success');}
    else if(job.status==='blocked')throw new Error('Canva 尚未完成第二批圖；原三套仍保留，可稍後再查詢。');
    else setStatus('Canva 仍在製作中；稍後再按「再產生三套」會接續同一筆工作，不會重複生成。');
  }catch(error){if(epoch===authEpoch)setStatus(error.message||'Canva 第二批圖尚未完成。','error');}
  finally{if(epoch===authEpoch){busy=false;renderList();syncControls();}}
}
function renderList(){
 const list=$('#review-list'),active=document.activeElement,focusKey=active?.matches('.review-choice')?[active.dataset.id,active.dataset.track]:null;
 const queue=reviewQueue(items,{query:$('#review-search').value,status:$('#review-filter').value,track:$('#review-track').value});
 list.replaceChildren();
 $('#review-queue-count').textContent=authorized?`已載入 ${queue.loaded} 筆 · 待審 ${queue.pending} 筆 · 符合篩選 ${queue.visible.length} 筆${$('#review-load-note').hidden?'':'（清單尚未完整）'}`:'登入並載入後顯示審核紀錄。';
 const filtered=!!($('#review-search').value||$('#review-filter').value||$('#review-track').value);$('#review-clear').disabled=!filtered;
 const selectedVisible=!current||queue.visible.some(row=>row.id===current.id&&row.track===current.track),note=$('#review-selection-note');note.hidden=selectedVisible||!authorized;note.textContent=note.hidden?'':'目前閱讀的「'+(current.title||'未命名內容')+'」不在篩選結果中；內容與未送出的意見仍保留。';
 if(!items.length)list.append(Object.assign(document.createElement('p'),{textContent:authorized?'已載入的清單目前沒有審核紀錄。':'請登入並重新載入審核紀錄。',className:'muted'}));
 else if(!queue.visible.length)list.append(Object.assign(document.createElement('p'),{textContent:'沒有符合的紀錄。可調整條件或按「清除篩選」。',className:'workflow-empty'}));
 for(const item of queue.visible){
  const selected=current?.id===item.id&&current?.track===item.track,button=document.createElement('button');button.type='button';button.dataset.appControl='surface';button.dataset.id=item.id;button.dataset.track=item.track;button.setAttribute('aria-pressed',String(selected));button.className='review-choice secondary'+(selected?' current':'');
  const strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=item.service_date+' · '+(item.track==='promo'?'社群預告':'週報上稿')+' · '+(item.title||'本週週報');small.textContent=statusText[item.status]||item.status;button.append(strong,small);button.disabled=busy||recovery||!authorized;button.onclick=()=>openBulletin(item.id,item.track);list.append(button);
 }
 if(focusKey){const target=[...list.querySelectorAll('button')].find(n=>n.dataset.id===focusKey[0]&&n.dataset.track===focusKey[1]);target?.focus({preventScroll:true});}
}

function renderYoutube(row,area){
 if(church!=='M+')return;
 const panel=document.createElement('section');panel.id='weekly-youtube';panel.className='weekly-youtube';
 panel.innerHTML='<p class="eyebrow">YOUTUBE · 主日直播</p><h3>直播資訊與橫式預告圖</h3><label class="youtube-toggle"><input id="youtube-enabled" type="checkbox">核准後自動同步 YouTube</label><label class="youtube-target">本週直播場次<select id="youtube-target"><option value="">自動使用每週直播入口</option></select></label><button id="youtube-choose" type="button" class="secondary">選擇待播場次</button><p id="youtube-state" role="status" aria-live="polite"></p><details open><summary>標題、說明與標籤</summary><pre id="youtube-preview"></pre></details><div class="youtube-actions"><button id="youtube-refresh" type="button" class="secondary">確認同步結果</button><button id="youtube-retry" type="button" hidden>重新同步本週資訊</button></div><a id="youtube-watch" href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" hidden>查看 YouTube 直播 ↗</a><p class="muted">縮圖使用下方已送審的橫式預告圖。</p>';
 area.append(panel);const youtubeRow={...row,status:row.status==='approved'?'published':row.status};youtubePreview=initWeeklyYoutube({db,church,request:async(action,payload)=>{const value=await reviewRequest('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/youtube-oauth',action,payload,120000);if(!value.response.ok)throw new Error('YouTube 操作未完成，請確認最新狀態。');return value.result;},onDirty:()=>{},getContext:()=>({row:youtubeRow,editable:false,reviewer:authorized&&current===row&&row.canDecide,busy:busy||reading||recovery||authChecking||!authorized||current!==row,saved:authorized&&current===row})});youtubePreview.reset();
}
function renderFinalPromo(row,area){
  if(row.hero_image_path){
    const section=document.createElement('section'),heading=document.createElement('h3'),image=document.createElement('img');
    section.className='review-final-media';heading.textContent='本次送審橫式圖';image.className='review-hero';image.loading='lazy';image.decoding='async';image.alt='本次送審橫式預告圖';
    image.src=db.storage.from('church-website-public-media').getPublicUrl(row.hero_image_path).data.publicUrl;
    section.append(heading,image);area.append(section);
  }
  const reel=document.createElement('section'),reelHeading=document.createElement('h3');
  reel.className='review-reel review-final-media';reelHeading.textContent='IG Reel';reel.append(reelHeading);
  if(row.reel_video_path){const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=db.storage.from('church-website-public-media').getPublicUrl(row.reel_video_path).data.publicUrl;reel.append(video);}
  else if(row.reel_cover_image_path){const cover=document.createElement('img');cover.className='review-reel-cover';cover.alt='IG Reel 封面';cover.loading='lazy';cover.decoding='async';cover.src=db.storage.from('church-website-public-media').getPublicUrl(row.reel_cover_image_path).data.publicUrl;reel.append(cover);}
  else{const missing=document.createElement('p');missing.textContent='IG Reel 尚未準備完成。';reel.append(missing);}
  area.append(reel);
  if(row.status==='approved'&&church==='M+'){
    const panel=document.createElement('section'),heading=document.createElement('h3'),message=document.createElement('p'),retry=document.createElement('button');
    panel.id='instagram-publication';panel.className='review-section';heading.textContent='Instagram 發布狀態';message.id='instagram-publication-message';message.setAttribute('role','status');message.textContent='正在確認實際發布結果…';retry.id='instagram-retry';retry.type='button';retry.className='secondary';retry.textContent='重試發布 Instagram Reel';retry.hidden=true;retry.onclick=()=>retryInstagram(row);panel.append(heading,message,retry);area.append(panel);
    refreshInstagram(row);
  }
  if(church==='M+'){
    const block=document.createElement('section'),heading=document.createElement('h3');block.className='review-section';heading.textContent='YouTube 標題與說明';block.append(heading);
    try{const data=weeklyMetadata(row);for(const [label,value] of [['標題',data.title],['說明',data.description]]){const line=document.createElement('div'),name=document.createElement('b'),content=document.createElement('p');line.className='review-item';name.textContent=label;content.textContent=value;line.append(name,content);block.append(line);}}
    catch{const error=document.createElement('p');error.textContent='請補齊主題、經文與講員，才能預覽 YouTube 說明。';block.append(error);}
    area.append(block);
  }
}
function renderPreview(row){renderAccessNote(row);const area=$('#preview');area.replaceChildren();const h=document.createElement('h2');h.textContent=row.title||'本週週報';const subtitle=document.createElement('p');subtitle.textContent=row.subtitle||'';const meta=document.createElement('div');meta.className='review-meta';for(const text of [row.service_date,row.service_time,statusText[row.status]||row.status,`版本 ${row.version}`]){const span=document.createElement('span');span.className='review-pill';span.textContent=text;meta.append(span);}area.append(h,subtitle,meta);if(row.track==='promo'&&row.status!=='pending_initial'){youtubePreview=null;renderFinalPromo(row,area);$('#canva-review-more').hidden=true;$('#retry-line').hidden=row.status!=='pending_review'||!row.lineNotificationPending||!row.canDecide;$('#review-actions').hidden=!row.canDecide||row.status!=='pending_review';$('#approve').textContent='審核發佈';$('#review-comment').value='';return;}const sermon=document.createElement('section');sermon.className='review-section';for(const [label,value] of [['信息主題',row.sermon_topic],['聖經經文',row.sermon_scripture],['講員',row.sermon_speaker],['主日時間',row.service_time]])if(value){const line=document.createElement('div'),name=document.createElement('b'),text=document.createElement('p');line.className='review-item';name.textContent=label;text.textContent=value;line.append(name,text);sermon.append(line);}area.append(sermon);if(row.track==='promo')renderYoutube(row,area);if(row.track==='promo'&&row.speaker_photo_path){const photo=document.createElement('img');photo.className='review-hero';photo.alt='講員照片';photo.loading='lazy';photo.decoding='async';photo.src=db.storage.from('church-website-public-media').getPublicUrl(row.speaker_photo_path).data.publicUrl;area.append(photo);}if(row.track==='promo'&&row.reel_enabled){const reel=document.createElement('section');reel.className='review-reel';const title=document.createElement('h3');title.textContent='Instagram Reel 預覽';reel.append(title);if(row.reel_cover_image_path){const cover=document.createElement('img');cover.className='review-reel-cover';cover.loading='lazy';cover.decoding='async';cover.alt='Instagram Reel 封面圖';cover.src=db.storage.from('church-website-public-media').getPublicUrl(row.reel_cover_image_path).data.publicUrl;reel.append(cover);}if(row.reel_video_path){const video=document.createElement('video');video.controls=true;video.playsInline=true;video.src=db.storage.from('church-website-public-media').getPublicUrl(row.reel_video_path).data.publicUrl;reel.append(video);const caption=document.createElement('p');caption.textContent=row.reel_caption||'';reel.append(caption);}else{const warning=document.createElement('p');warning.textContent='尚未產生 Reel，核准後只會發布週報。';reel.append(warning);}area.append(reel);}if(row.track==='promo'){const block=document.createElement('section');block.className='review-section';const title=document.createElement('h3');title.textContent='Canva 預告圖選項';const grid=document.createElement('div');grid.id='review-canva-options';grid.className='review-canva-grid';block.append(title,grid);area.append(block);showCanvaSets(row).catch(error=>{if(current===row&&authorized)setStatus(error.message||'Canva 圖卡暫時無法載入。','error');});}if(row.hero_image_path){const image=document.createElement('img');image.className='review-hero';image.loading='lazy';image.decoding='async';image.alt='主日預告圖片';image.src=db.storage.from('church-website-public-media').getPublicUrl(row.hero_image_path).data.publicUrl;area.append(image);}if(row.track==='bulletin'&&row.weekly_schedule){for(const [key,label] of [['current','本週服事'],['next','下週服事']]){const box=document.createElement('section');box.className='review-section';const heading=document.createElement('h3');heading.textContent=label;box.append(heading);for(const item of row.weekly_schedule[key]||[]){const line=document.createElement('div'),name=document.createElement('b'),value=document.createElement('p');line.className='review-item';name.textContent=item.label;value.textContent=item.value;line.append(name,value);box.append(line);}area.append(box);}}for(const section of row.track==='bulletin'?(row.sections||[]):[]){if(section.enabled===false)continue;const box=document.createElement('section');box.className='review-section';const title=document.createElement('h3'),description=document.createElement('p');title.textContent=section.title||'未命名欄位';description.textContent=section.description||'';box.append(title,description);if(section.auto_schedule){const note=document.createElement('p');note.textContent='服事排班會依週報日期由系統自動帶入。';box.append(note);}else for(const item of section.items||[]){if(!item.label&&!item.body)continue;const line=document.createElement('div'),label=document.createElement('b'),body=document.createElement('p');line.className='review-item';label.textContent=item.label||'內容';body.textContent=item.body||'';line.append(label,body);box.append(line);}area.append(box);}$('#canva-review-more').hidden=row.track!=='promo'||row.status!=='pending_initial'||!row.canDecide;$('#retry-line').hidden=row.track!=='promo'||row.status!=='pending_review'||!row.lineNotificationPending||!row.canDecide;$('#review-actions').hidden=!row.canDecide||!['pending_initial','pending_review'].includes(row.status);$('#approve').textContent=row.status==='pending_initial'?'初審通過，交牧師／師母複審':'審核發佈';$('#review-comment').value='';}
function summary(row){workflowSummary($('#workflow'),{title:row?`${row.service_date} · ${statusText[row.status]||row.status}`:'週報審核工作區',description:recovery?'請重新載入確認最新紀錄後再操作。':reviewAccessMessage(row)?'請閱讀內容；審核操作依目前分工開放。':row?.status==='pending_review'?'確認主日資訊、完整週報與 IG 預覽，再作出審核決定。':row?.status==='published'?'週報已發布，可以從清單翻閱紀錄。':'選擇週報，閱讀內容與審核紀錄。',steps:['閱讀內容','審核決定','發布／退回'],active:reviewAccessMessage(row)?0:['pending_initial','pending_review'].includes(row?.status)?1:row?2:0});}
async function openBulletin(id,track='bulletin',{force=false}={}){
 if(busy||recovery&&!force||!authorized)return;if(!force&&!guard.canLeave())return;
 const sequence=++readVersion;reading=true;syncControls();setStatus('正在載入審核內容…');
 try{const result=await api('get',{bulletinId:id,track});if(sequence!==readVersion)return;applyRow(checkedRow(result,id,track));loadedStatus(pending(current)?'請確認內容後通過，或填寫意見退回修改。':`目前狀態：${statusText[current.status]||current.status}。`);}
 catch(error){if(sequence===readVersion){recovery=true;summary(current);setStatus(error.message||'載入失敗，原有意見已保留，請重新載入。','error');}}
 finally{if(sequence===readVersion){reading=false;syncControls();}}
}

async function decide(action){
  if(!authorized||authChecking||!current||!current.canDecide||busy||reading||recovery||!['pending_initial','pending_review'].includes(current.status))return;
  const comment=$('#review-comment').value.trim();if(action==='request_changes'&&!comment){setStatus('請填寫退回意見。','error');$('#review-comment').focus();return;}
  const epoch=authEpoch,selected=current,initial=selected.status==='pending_initial',approved=action==='approve';
  const description=approved?(initial?'通過後交牧師或師母複審，不會在初審階段發布。':selected.track==='promo'?'通過後發布 IG Reel 並更新 YouTube 直播資訊；週報上稿仍獨立審核。':selected.legacy&&selected.reel_enabled?'通過後依原流程發布週報與社群。':'通過後發布主日週報。'):'將連同意見退回編輯人修改。';
  const accepted=await reviewDialog({title:approved?(initial?'確認初審通過？':'確認核准發布？'):'確認退回修改？',description,withNote:false,confirmLabel:approved?(initial?'送交審核':'審核發佈'):'退回修改'});
  if(accepted===null||epoch!==authEpoch||!authorized||authChecking||busy||reading||recovery||current!==selected)return;
  busy=true;syncControls();const unlock=lockControls($('.review-layout'));setStatus(approved?'正在保存審核結果…':'正在退回修改…');let committed=false;
  try{await api(action,{bulletinId:selected.id,version:selected.version,comment,track:selected.track});committed=true;guard.clear();await load(selected.id,selected.track);if(epoch!==authEpoch)return;setStatus(approved?(initial?'初審已通過，已交牧師或師母複審。':'已核准，正在發布。'):'已退回修改，意見已記錄。','success');}
  catch(error){if(epoch!==authEpoch)return;if(committed||uncertainWrite(error)){recovery=true;$('#review-actions').hidden=true;summary(selected);setStatus(committed?'審核已完成，但最新紀錄暫時無法載入。請重新載入確認。':'連線中斷，尚無法確認審核結果。請重新載入，勿重複送出。','error');}else setStatus(error.message||'審核未完成。','error');}
  finally{if(epoch===authEpoch){busy=false;unlock();renderList();syncControls();}}
}
async function retryLine(){
  const epoch=authEpoch,row=current,button=$('#retry-line');
  if(!authorized||authChecking||reading||recovery||!row||!row.canDecide||row.track!=='promo'||row.status!=='pending_review'||!row.lineNotificationPending||busy)return;
  busy=true;syncControls();button.disabled=true;setStatus('正在補送牧師與師母的 LINE 通知…');
  try{const result=await api('retry_notification',{bulletinId:row.id,track:'promo'});if(current===row){row.lineNotificationPending=result.notificationPending===true;button.hidden=!row.lineNotificationPending;setStatus(row.lineNotificationPending?'仍有 LINE 通知未送達，請稍後再試。':'牧師與師母的 LINE 通知均已送達。',row.lineNotificationPending?'error':'success');}}
  catch(error){if(epoch===authEpoch)setStatus(error.message||'LINE 通知尚未送達。','error');}
  finally{if(epoch===authEpoch){busy=false;button.disabled=false;syncControls();}}
}
async function load(preferredId=requestedId,preferredTrack=current?.track,{resetSelection=false}={}){
 const sequence=++readVersion;
 const results=await Promise.allSettled(['promo','bulletin'].map(async track=>{const result=await api('list',{track});if(!Array.isArray(result.items)||result.items.some(row=>!row||typeof row.id!=='string'||typeof row.service_date!=='string'||row.church_id&&row.church_id!==church))throw new Error('清單回應不完整。');return result;}));
 if(sequence!==readVersion)return;
 renderLoadNote(results);
 if(results.every(r=>r.status==='rejected'))throw new Error('審核清單暫時無法載入，原有意見已保留。請重新載入確認。');
 const nextItems=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.items.map(item=>({...item,track:i===0?'promo':'bulletin'})):[]);
 const requested=resetSelection?null:preferredId||params.get('bulletin'),requestedTrack=resetSelection?null:preferredTrack||params.get('track');
 if(requested&&requestedTrack&&results[requestedTrack==='promo'?0:1].status==='rejected')throw new Error('選取內容的清單暫時無法載入，原有意見已保留。請重新載入確認。');
 const selected=nextItems.find(item=>item.id===requested&&(!requestedTrack||item.track===requestedTrack));
 if(requested&&!selected)throw new Error('選取內容已不在清單中，原有意見已保留，請返回協作平台確認。');
 const next=selected||reviewQueue(nextItems).ordered[0];
 if(next){const result=await api('get',{bulletinId:next.id,track:next.track});if(sequence!==readVersion)return;const row=checkedRow(result,next.id,next.track);items=nextItems;applyRow(row);}
 else{items=nextItems;current=null;requestedId=null;recovery=false;guard.clear();$('#review-comment').value='';renderList();renderAccessNote(null);const partial=results.some(r=>r.status==='rejected');$('#preview').innerHTML=partial?'<p class="workflow-empty">已載入的清單沒有審核紀錄；其餘清單尚未載入。</p>':'<p class="workflow-empty">目前沒有主日內容需要審核。</p>';$('#review-actions').hidden=true;summary(null);setStatus(partial?'部分審核清單尚未載入，請重新載入確認。':'目前沒有待審內容。',partial?'':'success');}
}

async function start(){
 if(busy)return;const epoch=authEpoch;busy=true;syncControls();
 try{if(!['M+','SHiNE'].includes(church))throw new Error('堂會連結不正確。');const access=await verifyAccess(epoch);if(epoch!==authEpoch)return;actorId=access.user.id;authorized=true;$('#back').href='pastoral/workspace.html?church='+encodeURIComponent(church)+'&tab=tasks';await load();if(epoch===authEpoch&&current)loadedStatus('週報已載入。請先閱讀，再進行審核。');}
 catch(error){if(epoch===authEpoch){setStatus(error.message||'無法載入週報審核，請重新載入。','error');$('#review-actions').hidden=true;}}
 finally{if(epoch===authEpoch){busy=false;renderList();syncControls();}}
}

$('#canva-review-more').onclick=moreCanva;$('#retry-line').onclick=retryLine;$('#approve').onclick=()=>decide('approve');$('#request-changes').onclick=()=>decide('request_changes');$('#review-search').oninput=renderList;$('#review-filter').onchange=renderList;
$('#review-track').onchange=renderList;
$('#review-clear').onclick=()=>{$('#review-search').value='';$('#review-filter').value='';$('#review-track').value='';renderList();$('#review-search').focus();};
$('#review-list').addEventListener('keydown',event=>{
 if(!event.target.matches('.review-choice')||event.altKey||event.ctrlKey||event.metaKey||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 const buttons=[...$('#review-list').querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(event.target);if(index<0)return;
 const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)));event.preventDefault();buttons[next]?.focus();
});

async function reloadReview(resetSelection=false){
 if(busy||reading||!guard.canLeave())return;
 if(!authorized){await start();return;}
 const epoch=authEpoch;busy=true;syncControls();
 try{await verifyAccess(epoch);await load(undefined,undefined,{resetSelection});if(epoch!==authEpoch)return;if(resetSelection){params.delete('bulletin');params.delete('track');const url=new URL(location.href);url.searchParams.delete('bulletin');url.searchParams.delete('track');history.replaceState(null,'',url);}loadedStatus('最新審核紀錄已載入。');}
 catch(error){if(epoch!==authEpoch)return;recovery=true;summary(current);setStatus(error.message||'無法載入，原有意見已保留，請稍後再試。','error');}
 finally{if(epoch===authEpoch){busy=false;renderList();syncControls();}}
}
$('#review-reload').onclick=()=>reloadReview();
$('#review-choose-another').onclick=()=>reloadReview(true);
start();
