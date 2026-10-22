import {readAccess,canOpen,canAction} from './admin-access.mjs?v=20261022-experience5';
import {validateDraft} from './sermon-preparation-contract.mjs?v=20261014-directuse1';
import {createSermonDraftStore} from './sermon-draft-store.mjs?v=20261022-experience13';

const same=(a,b)=>a&&b&&a.userId===b.userId&&a.sessionId===b.sessionId&&a.church===b.church;
function sessionScope(session){
 try{const value=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(!/^[0-9a-f-]{36}$/i.test(value.session_id||'')||value.sub!==session.user.id)return null;return {userId:session.user.id,sessionId:value.session_id,church:'M+'};}catch{return null;}
}
// Device copies may contain incomplete required fields. Server saves keep their stricter contract.
export function validateDeviceSermon(value){
 if(!value||JSON.stringify(value).length>2000000)throw Error('裝置草稿格式不完整，尚未套用。');
 const copy=structuredClone(value);
 for(const key of ['title','speaker','scripture'])if(typeof copy.information?.[key]==='string'&&!copy.information[key].trim())copy.information[key]='未填';
 if(Array.isArray(copy.slides))for(const slide of copy.slides)if(typeof slide?.title==='string'&&!slide.title.trim())slide.title='未填';
 if(copy.outline_confirmed===true&&Array.isArray(copy.outline)&&copy.outline.length<3)copy.outline_confirmed=false;
 validateDraft(copy);return structuredClone(value);
}
const element=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});

// One opt-in copy per verified login, independent of official versions, AI jobs and NAS.
export function createSermonDraftRecovery({db,host,readDraft,mayLeave,isBusy,setBusy,loadLatest,onRestore,onIdentityLost,message,store=createSermonDraftStore()}){
 let scope=null,pending=null,active=null,queue=Promise.resolve(),generation=0,working=false,timer=null,snapshot=null,lastSnapshot=null,inputRevision=0,snapshotRevision=0;
 const heading=element('h2','關閉後繼續預備'),copy=element('p','可選擇將這篇信息暫存在這個瀏覽器／App，24 小時內於同一次登入續填。共用裝置請勿開啟。','muted'),actions=element('div','','studio-actions'),toggle=element('button','在這台裝置保留草稿','secondary'),resume=element('button','繼續裝置草稿','secondary'),remove=element('button','刪除裝置草稿','secondary'),status=element('p','尚未開啟裝置草稿。','studio-device-status'),detail=element('p','','muted');
 for(const button of [toggle,resume,remove]){button.type='button';button.dataset.appControl='surface';}
 status.setAttribute('role','status');actions.append(toggle,resume,remove);host.append(heading,copy,detail,actions,status);
 const say=text=>{status.textContent=text;};
 const live=epoch=>generation===epoch&&!!scope;
 const allowed=access=>canOpen(access,'M+','website_weekly')&&canAction(access,'M+','website_weekly','edit');
 async function identity(fresh=true){
  const access=await readAccess(db,{fresh}),result=await db.auth.getSession(),next=sessionScope(result.data?.session);
  if(result.error||!next||access.user?.id!==next.userId||!allowed(access))throw Error('無法確認目前登入與信息編輯權限，尚未套用草稿。');
  return next;
 }
 function render(){
  host.hidden=!scope;toggle.hidden=!active;toggle.disabled=resume.disabled=remove.disabled=working||isBusy();
  resume.hidden=!pending||!!active?.enabled;remove.hidden=!pending;
  toggle.textContent=active?.enabled?'停止保留並刪除裝置草稿':'在這台裝置保留草稿';
  detail.hidden=!pending||!!active?.enabled;detail.textContent=pending?`裝置副本：${pending.payload?.information?.title||'未填主題'} · 依正式版本 ${pending.baseVersion} · ${new Date(pending.updatedAt).toLocaleString('zh-TW')}。讀取正式版本不會自動套用或刪除這份副本。`:'';
 }
 function cancelTimer(){clearTimeout(timer);timer=null;}
 function flush(){
  cancelTimer();if(!active?.enabled||!snapshot)return queue;
  const selected=active,epoch=generation,payload=snapshot,revision=snapshotRevision,serialized=JSON.stringify(payload);snapshot=null;
  if(serialized===lastSnapshot)return queue;lastSnapshot=serialized;
  say('正在保留裝置草稿…');
  queue=queue.catch(()=>{}).then(async()=>{
   if(!live(epoch)||active!==selected||!selected.enabled)return;
   try{const saved=await store.write(scope,selected.revision,{projectId:selected.id,baseVersion:selected.version,payload});if(!live(epoch)||active!==selected)return;selected.revision=saved.revision;pending=saved;if(revision===inputRevision)say('已保留於這台裝置 · '+new Date(saved.updatedAt).toLocaleTimeString('zh-TW')+'，尚未儲存正式版本。');render();}
   catch(error){if(live(epoch)&&active===selected){selected.enabled=false;lastSnapshot=null;say(error.name==='DraftConflictError'?error.message:'裝置草稿未更新，這一頁的輸入仍在；請重試或儲存正式版本後再關閉。');render();}}
  });return queue;
 }
 function changed(){
  if(!active?.enabled)return;
  try{const payload=validateDeviceSermon(readDraft()),serialized=JSON.stringify(payload);if(serialized===(snapshot?JSON.stringify(snapshot):lastSnapshot))return;snapshot=payload;snapshotRevision=++inputRevision;say('尚有輸入等待保留，請稍候…');cancelTimer();timer=setTimeout(flush,300);}
  catch{snapshot=null;inputRevision++;cancelTimer();say('這次輸入尚未保留於裝置，請先修正過長或不完整的內容；本頁輸入仍在。');}
 }
 async function refresh(initialSession){
  // The caller has already checked access; retain this identity for sign-out protection even if local storage fails.
  if(!scope&&initialSession)scope=sessionScope(initialSession);
  const epoch=generation;
  try{const verified=await identity();if(generation!==epoch)return;scope=verified;await store.prune(scope);const row=await store.read(scope);if(!live(epoch))return;pending=row;render();}
  catch{if(generation===epoch){say('裝置草稿暫時無法讀取；本頁仍可編輯及儲存正式版本。');render();}}
 }
 async function opened(project){
  await flush();if(active)active.enabled=false;active={id:project.id,version:project.version,revision:null,enabled:false};snapshot=null;lastSnapshot=null;render();
  say(pending?'這台裝置有尚未送出的副本；核對後可繼續填寫或刪除。':'尚未開啟裝置草稿。');
 }
 async function verify(){
  if(!active?.enabled&&!active?.restored)return;const epoch=generation,verified=await identity();if(!live(epoch)||!same(scope,verified))throw Error('登入或編輯權限已變更，尚未送出。');await flush();
 }
 async function saved(project){
  await flush();if(active)active.enabled=false;snapshot=null;lastSnapshot=null;
  let cleared=true;try{if(pending?.projectId===project.id){await store.remove(scope,active?.revision||pending.revision);pending=null;}}catch{cleared=false;}
  active={id:project.id,version:project.version,enabled:false,revision:null};render();say(cleared?'正式版本已儲存，這篇信息的裝置副本已清除。':'正式版本已儲存，但裝置副本未能清除；請先核對正式版本，勿重複儲存。');return cleared;
 }
 toggle.onclick=async()=>{
  if(working||isBusy()||!active)return;working=true;render();const selected=active,epoch=generation;
  try{
   const verified=await identity();if(!live(epoch)||active!==selected)return;if(!same(scope,verified))throw Error('登入已變更，請重新載入。');
   if(selected.enabled){if(!confirm('停止保留並刪除這台裝置的講章副本？目前頁面的輸入與正式版本不受影響。'))return;await flush();selected.enabled=false;await queue;if(pending?.projectId===selected.id){await store.remove(scope,selected.revision);pending=null;}selected.revision=null;snapshot=null;lastSnapshot=null;say('已刪除裝置副本，這一頁的輸入仍保留。');}
   else{const existing=await store.read(scope);if(!live(epoch)||active!==selected)return;if(existing){pending=existing;throw Error('這台裝置已有一份草稿，請先繼續或刪除它；目前輸入仍保留。');}selected.enabled=true;selected.revision=null;lastSnapshot=null;changed();await flush();}
  }catch(error){if(live(epoch))say(error.message||'裝置草稿未能更新，本頁輸入仍在。');}
  finally{working=false;render();}
 };
 resume.onclick=async()=>{
  if(working||isBusy()||!pending||!mayLeave())return;working=true;setBusy(true);render();const selected=pending,epoch=generation;
  try{
   const verified=await identity();if(!live(epoch))return;if(!same(scope,verified))throw Error('登入已變更，請重新載入。');
   const row=await store.read(scope);if(!live(epoch))return;if(!row||row.revision!==selected.revision)throw Error('裝置草稿已變更或到期，請重新載入確認。');
   if(!/^[0-9a-f-]{36}$/i.test(row.projectId||'')||!Number.isSafeInteger(row.baseVersion)||row.baseVersion<1)throw Error('裝置草稿格式不完整，尚未套用。');
   const payload=validateDeviceSermon(row.payload),latest=await loadLatest(row.projectId);if(!live(epoch))return;
   validateDraft(latest.payload);if(latest.project?.id!==row.projectId||latest.project.version!==row.baseVersion)throw Error('正式信息已有新版本，舊裝置草稿未套用。請先核對最新信息；裝置副本仍保留。');
   const claimed=await store.write(scope,row.revision,{projectId:row.projectId,baseVersion:row.baseVersion,payload});if(!live(epoch))return;
   pending=claimed;active={id:row.projectId,version:row.baseVersion,revision:claimed.revision,enabled:true,restored:true};lastSnapshot=JSON.stringify(payload);snapshot=null;
   onRestore(latest,payload);say('已帶回裝置草稿，尚未儲存正式版本。');message('已帶回裝置草稿，請核對後再儲存新版本。','neutral');
  }catch(error){if(live(epoch))say(error.message||'草稿未能載入，目前輸入仍保留。');}
  finally{working=false;setBusy(false);render();}
 };
 remove.onclick=async()=>{
  if(working||isBusy()||!pending||!confirm('刪除這台裝置的講章副本？目前輸入與正式信息不受影響。'))return;working=true;render();const epoch=generation;
  try{await flush();if(active)active.enabled=false;await queue;if(!live(epoch))return;await store.remove(scope,pending.revision);if(!live(epoch))return;pending=null;snapshot=null;lastSnapshot=null;say('已刪除裝置草稿，這一頁的輸入仍保留。');}
  catch(error){if(live(epoch))say(error.message||'裝置副本未能刪除，請再試一次。');}
  finally{working=false;render();}
 };
 const subscription=db.auth.onAuthStateChange?.((event,session)=>{
  if(!scope){if(event==='SIGNED_OUT'){generation++;onIdentityLost();}return;}const next=sessionScope(session);
  if(event==='SIGNED_OUT'||(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)&&!same(scope,next))){
   const previous=scope;generation++;cancelTimer();if(active)active.enabled=false;scope=pending=active=snapshot=null;host.hidden=true;detail.textContent='';say('登入已變更。');onIdentityLost();queue=queue.catch(()=>{}).then(()=>store.clearSession(previous)).catch(()=>{});
  }
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void flush();});window.addEventListener('pagehide',()=>void flush());
 return {refresh,opened,changed,verify,saved,render,flush,dispose(){generation++;cancelTimer();subscription?.data?.subscription?.unsubscribe?.();}};
}
