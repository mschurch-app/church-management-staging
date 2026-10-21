import {db} from './admin-db.mjs?v=20261012-readable2';
const $=s=>document.querySelector(s),draft=new URLSearchParams(location.search).get('draft'),endpoint='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/sermon-social-review';let item,youtubeWorkflow,instagramPublication=null,isFinalReviewer=false,canReviewIg=false,canPublishDirect=false,reviewBlockedMessage='',busy=false,submitted=false;
function setStatus(text,tone=''){const n=$('#status'),near=$('#action-status');n.textContent=text;n.dataset.tone=tone;if(near){near.textContent=text;near.dataset.tone=tone;}}
function instagramFailure(code){return ({sermon_image_migration_failed:'講道圖卡轉存失敗，請聯絡管理員確認圖片檔案。',sermon_image_invalid:'講道圖卡檔案無法使用，請聯絡管理員重新上傳。',sermon_image_missing:'講道圖卡不是可發布的檔案，請聯絡管理員重新上傳。',sermon_video_missing:'Reel 影片檔案未備妥，請重新上傳。',not_connected:'M+ Instagram 尚未連線，請由管理員重新連接。',token_expired:'M+ Instagram 授權已到期，請由管理員重新連接。',permission_missing:'Instagram 帳號缺少發布權限，請由管理員檢查授權。',publishing_disabled:'講道 Instagram 發布功能目前未開啟。',instagram_processing:'Instagram 未能完成媒體處理，請檢查圖卡或影片後重試。',instagram_timeout:'Instagram 處理逾時，請先確認帳號上是否已有貼文，再重試。',instagram_api:'Instagram 暫時未接受這份媒體，請檢查圖卡或影片後重試。',job_store:'發布紀錄無法儲存，請稍後重試。',unavailable:'發布服務暫時無法使用，請稍後重試。'})[String(code||'')]||'發布未完成，請稍後重試；核准內容已保留。';}
function reviewAccessMessage(){
 if(item.status==='changes_requested')return '本集已退回修改，等待重新送審。';
 if(item.review_stage==='completed')return '本集 IG 審核已完成。';
 if(item.review_stage==='initial_review'&&isFinalReviewer)return '目前由鈺庭初審；您可以先預覽。鈺庭通過後，才會開放牧師／師母複審。';
 if(item.review_stage==='pastoral_confirmation'&&!isFinalReviewer)return '鈺庭初審已通過，正在等待牧師／師母複審。';
 return '目前不在您的審核階段，請核對待辦狀態。';
}
function syncApproveAvailability(){
 if(!item)return;
 const initial=item.review_stage==='initial_review',reel=item.social_media_type==='reel';
 const needsAsset=initial&&(reel?!item.social_video_url||!item.social_image_url:!$('input[name="social-image"]:checked')?.value);
 const message=!(canReviewIg||canPublishDirect)?reviewBlockedMessage:submitted?'此審核階段已送出，無法重複送出。':needsAsset?reel?'Reel 或封面尚未備妥。':'請先選擇一張講道講員圖。':canPublishDirect?'按下後會略過鈺庭初審，直接核准並發布到 M+ Instagram。':'';
 const button=$('#approve');button.disabled=busy||submitted||!(canReviewIg||canPublishDirect)||needsAsset;button.title=message;
 $('#approve-hint').textContent=message;
}
async function api(action,payload={}){const session=await db.auth.getSession(),token=session.data.session?.access_token;if(!token){location.replace('admin-login.html?next='+encodeURIComponent(location.pathname+location.search));throw new Error('請重新登入。');}const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),['approve','approve_direct','sync_publication'].includes(action)?90000:30000);let response;try{response=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action,draftId:draft,...payload}),signal:controller.signal});}catch(error){if(error?.name==='AbortError')throw new Error('送出逾時，請重新載入頁面確認狀態後再試。');throw new Error('連線中斷，請確認網路後重新載入。');}finally{clearTimeout(timeout);}const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'操作失敗。');return data;}
function list(root,values){root.replaceChildren();(values||[]).forEach((value,index)=>{const row=document.createElement('label');row.className='review-item';const number=document.createElement('b'),input=document.createElement('textarea');number.textContent=String(index+1);input.value=typeof value==='string'?value:(value?.title&&value?.description?value.title+'｜'+value.description:JSON.stringify(value));row.append(number,input);root.append(row);});}
function renderArtworkOptions(){const root=$('#artwork-options'),originalOptions=Array.isArray(item.social_image_options)?item.social_image_options:[],options=[...originalOptions],approved=item.status==='approved'&&item.review_stage==='completed';if(approved&&item.social_image_url&&!options.includes(item.social_image_url))options.unshift(item.social_image_url);const shots=item.service_date==='2026-06-14'?['原影片畫面 1','原影片畫面 2','原影片畫面 3']:['膝蓋以上 A','膝蓋以上 B','半身'];root.replaceChildren();root.classList.toggle('source-landscape',item.service_date==='2026-06-14');for(const [index,url] of options.entries()){const label=document.createElement('label');label.className='artwork-option';const radio=document.createElement('input'),img=document.createElement('img'),text=document.createElement('span'),shot=approved&&url===item.social_image_url?'已核准圖卡':shots[originalOptions.indexOf(url)]||`第 ${index+1} 張`;radio.type='radio';radio.name='social-image';radio.value=url;radio.checked=url===item.social_image_url;radio.onchange=()=>{syncApproveAvailability();setStatus('已選取這張講員圖，可以送出初審。','success');};img.src=url;img.alt=`講道講員圖｜${shot}`;text.textContent=shot;label.append(radio,img,text);root.append(label);}root.closest('.artwork-review').hidden=item.social_media_type==='reel'||!options.length;syncApproveAvailability();}
function renderReel(){const reel=item.social_media_type==='reel';$('#reel-review').hidden=!reel;if(!reel)return;const video=$('#reel-video'),cover=$('#reel-cover');video.src=item.social_video_url||'';video.poster=item.social_image_url||'';cover.src=item.social_image_url||'';}
function renderReelUpload(){const allowed=item.social_media_type==='reel'&&['processing','changes_requested'].includes(item.status);$('#reel-upload').hidden=!allowed;$('#send-reel-review').disabled=!allowed||busy;}
async function fileHash(file){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function uploadReel(){if(busy)return;const video=$('#reel-file').files?.[0],cover=$('#cover-file').files?.[0],note=$('#upload-status');if(!video||!cover||video.type!=='video/mp4'||cover.type!=='image/jpeg'||video.size>200*1024*1024||cover.size>5*1024*1024){note.textContent='請選擇 200 MB 以下的 MP4，以及 5 MB 以下的 JPG 封面。';return;}busy=true;$('#send-reel-review').disabled=true;try{note.textContent='正在驗證檔案…';const [videoHash,coverHash]=await Promise.all([fileHash(video),fileHash(cover)]),prepared=await api('prepare_reel_upload',{videoHash,coverHash}),storage=db.storage.from('church-website-public-media');note.textContent='正在上傳 Reel…';const uploadedVideo=await storage.uploadToSignedUrl(prepared.video.path,prepared.video.token,video);if(uploadedVideo.error)throw new Error('Reel 上傳失敗：'+uploadedVideo.error.message);note.textContent='正在上傳封面…';const uploadedCover=await storage.uploadToSignedUrl(prepared.cover.path,prepared.cover.token,cover);if(uploadedCover.error)throw new Error('封面上傳失敗：'+uploadedCover.error.message);note.textContent='正在送鈺庭初審…';await api('complete_reel_upload',{videoHash,coverHash});note.textContent='已送鈺庭初審。';const refreshed=await api('get');render(refreshed);}catch(error){note.textContent=error.message||'上傳失敗，請稍後重試。';}finally{busy=false;renderReelUpload();}}
function renderSubtitles(){if(item.youtube_caption_requested===false)return;const root=$('#subtitle-preview'),cues=Array.isArray(item.subtitle_cues)?item.subtitle_cues:[],segments=Array.isArray(item.subtitle_segments)?item.subtitle_segments:[];root.replaceChildren();$('#subtitle-summary').textContent=item.subtitles_ready?`已完成 ${cues.length} 則字幕校對，請與大綱、重點及貼文一起核對。`:`字幕校對中｜${segments.filter(x=>x.review_status==='completed').length}/${segments.length} 段完成；完成前不能送複審。`;for(const cue of cues){const row=document.createElement('div'),time=document.createElement('time'),text=document.createElement('p');const format=value=>{const seconds=Math.max(0,Number(value)||0),m=Math.floor(seconds/60),s=Math.floor(seconds%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;};time.textContent=`${format(cue.start_seconds)}–${format(cue.end_seconds)}`;text.textContent=cue.text||'';row.append(time,text);root.append(row);}if(!cues.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='尚無可預覽字幕。';root.append(empty);}}
function values(root){return [...root.querySelectorAll('textarea')].map(x=>x.value.trim()).filter(Boolean);}
function renderYoutube(){const section=$('#youtube'),enabled=item.youtube_caption_requested!==false;section.hidden=!enabled;if(!enabled)return;const status=youtubeWorkflow?.status||'proofreading',labels={proofreading:'字幕校對中',waiting_edit:'等待確認影片剪輯',review_ready:'字幕等待複審',approved:'正在上稿',published:'字幕已上稿',failed:'上稿失敗，可重試'};$('#youtube-state').textContent=labels[status]||status;$('#youtube-controls').hidden=!isFinalReviewer||status==='published';$('#youtube-approve').hidden=!isFinalReviewer||!['review_ready','failed','approved'].includes(status);$('#youtube-offset').value=youtubeWorkflow?.caption_offset_seconds||item.sermon_start_seconds||0;$('#youtube-edit-note').textContent=youtubeWorkflow?.edit_confirmed_at?(youtubeWorkflow.edit_mode==='trimmed_replay'?`已確認剪除前段，字幕時間扣除 ${youtubeWorkflow.caption_offset_seconds} 秒。`:'已確認保留完整直播，字幕沿用原時間碼。'):'請在 YouTube 完成剪輯後，選擇實際影片版本。';}
function renderPublication(status){
 instagramPublication=status||null;
 const approved=item?.status==='approved'&&item?.review_stage==='completed';
 const published=status?.status==='published'&&Boolean(status?.instagram_media_id||status?.mediaId);
 const retry=$('#retry-instagram'),label=$('#ig-publication-status');
 retry.hidden=!approved||!isFinalReviewer||published;
 retry.disabled=busy||!approved||!isFinalReviewer||published;
 label.hidden=!approved;
 label.textContent=published?'Instagram 已發布。':approved?status?.status==='failed'?'內容已核准；'+instagramFailure(status.error_code)+' 請確認後按「重試發布」。':'內容已核准，Instagram 尚未確認發布。請按「重試發布」；失敗時會保留核准狀態。':'';
 label.dataset.tone=published?'success':'error';
}
function render(data){item=data.draft;youtubeWorkflow=data.youtube_workflow;isFinalReviewer=data.is_final_reviewer===true;canReviewIg=data.can_review_ig===true;canPublishDirect=data.can_publish_direct===true;const initial=item.review_stage==='initial_review';submitted=!(canReviewIg||canPublishDirect);reviewBlockedMessage=canReviewIg||canPublishDirect?'':reviewAccessMessage();$('#subtitle-library-link').href='youtube-subtitle-library.html?draft='+encodeURIComponent(item.id);$('#content').hidden=false;$('#title').textContent=item.sermon_title;const source=item.source_channel_name?item.source_channel_name+'公開影片・':'';const destination=item.youtube_caption_requested===false?'只發布 M+ Instagram・':'';$('#meta').textContent=source+destination+item.service_date+'・'+(item.speaker||'講員待確認')+'・'+(item.scripture||'經文待確認');$('#video').href=item.youtube_url;renderArtworkOptions();renderReel();renderReelUpload();renderSubtitles();renderYoutube();$('#speaker').value=item.speaker||'';$('#scripture').value=item.scripture||'';$('#start').value=item.sermon_start_seconds??'';$('#end').value=item.sermon_end_seconds??'';$('#caption').value=item.caption||'';list($('#outline'),item.outline);list($('#points'),item.key_points);list($('#applications'),item.applications);$('#stage').textContent=canPublishDirect?'IG 待初審｜牧師可直接發布':initial?'IG 初審｜邵鈺庭':item.review_stage==='completed'?'IG 審核完成':'IG 最終確認｜牧師、師母';$('#approve').textContent=canPublishDirect?'牧師直接核准並發布 IG':canReviewIg?initial?'IG 初審通過，送牧師／師母':'確認發布 Instagram':initial?'等待鈺庭初審':'目前無法審核';$('#save').disabled=!canReviewIg;$('#reject').disabled=!canReviewIg;$('#save').title=canPublishDirect?'請核對欄位後按「牧師直接核准並發布 IG」，修改會一併儲存。':reviewBlockedMessage;$('#reject').title=canPublishDirect?'此操作僅限當階段初審人。':reviewBlockedMessage;setStatus(canPublishDirect?'請核對 Reel、封面與貼文。按「牧師直接核准並發布 IG」會略過鈺庭初審，直接送往 M+ Instagram；修改的欄位會一併儲存。':reviewBlockedMessage|| (item.social_media_type==='reel'?'請觀看字幕 Reel，核對封面、講員、經文與貼文後送出審核。':initial?'請核對講員圖、講員、經文、大綱、重點與貼文；選擇一張講員圖後即可送出初審，IG 不必等待字幕。':item.youtube_caption_requested===false?'請確認圖片與貼文後發布到 M+ Instagram。':'請確認圖片與貼文後發布 Instagram。YouTube 字幕在下方獨立處理。'));renderPublication(data.publication);syncApproveAvailability();}
function payload(){return {speaker:$('#speaker').value.trim(),scripture:$('#scripture').value.trim(),start:Number($('#start').value)||null,end:Number($('#end').value)||null,outline:values($('#outline')),keyPoints:values($('#points')),applications:values($('#applications')),caption:$('#caption').value.trim(),socialImageUrl:item.social_media_type==='reel'?item.social_image_url||'':$('input[name="social-image"]:checked')?.value||'',comment:$('#comment').value.trim()};}
async function act(action,extra={}){
 if(busy||submitted&&['approve','save','reject'].includes(action)||!canReviewIg&&['save','reject'].includes(action))return;
 busy=true;
 const buttons=[...document.querySelectorAll('.review-actions button, #youtube-controls button')];
 buttons.forEach(button=>button.disabled=true);
 setStatus(action==='approve'?'正在送出審核與發布，請稍候…':action==='sync_publication'?'正在重試 Instagram 發布，請稍候…':action==='save'?'正在儲存修改…':action==='reject'?'正在退回修改…':'正在處理，請稍候…');
 try{
  const data=await api(action==='approve'&&canPublishDirect?'approve_direct':action,{...payload(),...extra});
  if(action==='save'){
   item=data.draft;setStatus('修改已儲存。','success');
  }else if(action==='confirm_youtube_edit'){
   youtubeWorkflow=data.youtube_workflow;renderYoutube();setStatus(data.status==='review_ready'?'影片範圍已確認，YouTube 字幕可進行複審。':'影片範圍已確認，字幕完成後會通知複審。','success');
  }else if(action==='approve_youtube'){
   youtubeWorkflow={...youtubeWorkflow,status:'published'};renderYoutube();setStatus('YouTube 繁體中文字幕已上稿。','success');
  }else if(action==='sync_publication'){
   renderPublication(data.instagram);
   setStatus(data.instagram?.status==='published'?'Instagram 已發布。':'內容已核准，但 Instagram 發布仍未成功：'+instagramFailure(data.instagram?.error),data.instagram?.status==='published'?'success':'error');
  }else if(action==='approve'&&data.status==='approved'){
   submitted=true;item.status='approved';item.review_stage='completed';renderPublication(data.instagram);
   const published=data.instagram?.status==='published';
   $('#approve').textContent=published?'已發布 Instagram':'IG 已核准，待發布';
   $('#approve-hint').textContent='核准已完成，無法重複核准。';
   setStatus(published?'Instagram 已發布；YouTube 字幕仍依獨立流程處理。':'內容已核准，但 Instagram 發布失敗：'+instagramFailure(data.instagram?.error),published?'success':'error');
   if(published)setTimeout(()=>location.assign('admin-dashboard.html?church=M%2B'),1400);
  }else{
   submitted=true;item.status=action==='reject'?'changes_requested':item.status;
   item.review_stage=data.status==='pastoral_confirmation'?'pastoral_confirmation':item.review_stage;
   $('#approve').textContent=action==='reject'?'已退回修改':'已送牧師／師母複審';
   $('#approve-hint').textContent='此審核階段已送出，無法重複送出。';
   setStatus(action==='reject'?'已退回修改。':'IG 初審已完成，已送牧師／師母複審。','success');
   setTimeout(()=>location.assign('admin-dashboard.html?church=M%2B'),1400);
  }
 }catch(error){
  setStatus(error.message==='already_submitted'?'這個審核階段已經送出，請勿重複操作。':error.message,'error');
 }finally{
  busy=false;
  buttons.forEach(button=>button.disabled=submitted);
  $('#save').disabled=submitted||!canReviewIg;
  $('#reject').disabled=submitted||!canReviewIg;
  syncApproveAvailability();renderYoutube();renderPublication(instagramPublication);
 }
}
$('#form').addEventListener('submit',e=>{e.preventDefault();act('approve');});$('#approve').addEventListener('click',e=>{e.preventDefault();if(!busy)act('approve');});$('#retry-instagram').onclick=()=>act('sync_publication');$('#save').onclick=()=>act('save');$('#reject').onclick=()=>{if(!$('#comment').value.trim()){setStatus('退回時請填寫意見。','error');return;}act('reject');};
$('#send-reel-review').onclick=uploadReel;
$('#youtube-full').onclick=()=>act('confirm_youtube_edit',{editMode:'full_replay',captionOffsetSeconds:0});$('#youtube-trimmed').onclick=()=>act('confirm_youtube_edit',{editMode:'trimmed_replay',captionOffsetSeconds:Math.max(0,Number($('#youtube-offset').value)||Number(item.sermon_start_seconds)||0)});$('#youtube-approve').onclick=()=>act('approve_youtube');
if(!/^[0-9a-f-]{36}$/i.test(draft||''))setStatus('審核連結不正確。','error');else api('get').then(data=>{render(data);if(data.media_preparation_error)setStatus('圖卡尚未準備好：'+instagramFailure(data.media_preparation_error),'error');else if(data.media_prepared)setStatus('圖卡已整理至固定的發布位置。內容尚未發布 Instagram。','success');}).catch(error=>setStatus(error.message,'error'));
