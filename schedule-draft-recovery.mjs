import * as accessApi from './admin-access.mjs?v=20261022-experience5';
import {createScheduleDraftStore} from './schedule-draft-store.mjs?v=20261022-experience10';
const node=(tag,text='',className='')=>Object.assign(document.createElement(tag),{textContent:text,className});
export function sessionScope(session,church){
 try{const payload=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(!/^[0-9a-f-]{36}$/i.test(payload.session_id||'')||payload.sub!==session.user.id)return null;return {userId:session.user.id,sessionId:payload.session_id,church};}catch{return null;}
}
const sameScope=(a,b)=>a&&b&&a.userId===b.userId&&a.sessionId===b.sessionId&&a.church===b.church;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export async function scheduleDraftFingerprint(row,preferences){
 const data=row?Object.fromEntries(Object.entries(row).filter(([key])=>!['created_at','updated_at'].includes(key))):null;
 const source=JSON.stringify(stable({row:data,visibleRoles:preferences.filter(p=>p.is_visible).map(p=>p.role_key).sort()}));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function validFields(fields,allowed){return fields&&typeof fields==='object'&&!Array.isArray(fields)&&Object.keys(fields).length<=200&&Object.entries(fields).every(([key,value])=>allowed.has(key)&&typeof value==='string'&&value.length<=300)&&typeof fields.service_date==='string'&&(!fields.service_date||/^\d{4}-\d{2}-\d{2}$/.test(fields.service_date));}
// One optional draft per verified login and church. Restoring never submits it.
export function createScheduleDraftRecovery({db,church,host,editor,latest,onRestore,onIdentityLost,message,isBusy=()=>false,store=createScheduleDraftStore()}){
 let scope=null,pending=null,active=null,queue=Promise.resolve(),generation=0,working=false,pruned=false;
 const report=error=>message(error?.name==='DraftConflictError'?error.message:'裝置草稿未能更新；這一頁的輸入仍保留，請勿直接關閉。','error');
 const actionAllowed=(access,row)=>typeof accessApi.canAction==='function'&&accessApi.canAction(access,church,'schedules',row?'edit':'create');
 async function identity(fresh=false){
  const access=await accessApi.readAccess(db,{fresh});if(!accessApi.canOpen(access,church,'schedules'))throw new Error('無法確認排班權限。');
  const result=await db.auth.getSession(),next=sessionScope(result.data?.session,church);
  if(result.error||!next||access.user.id!==next.userId)throw new Error('請重新確認登入後再使用裝置草稿。');
  return {scope:next,access};
 }
 function render(){
  host.replaceChildren();host.hidden=!pending||!!active?.form.isConnected;
  if(host.hidden)return;
  const title=node('h2','這台裝置有一份排班草稿'),copy=node('p','尚未送出，24 小時內可在同一次登入繼續填寫。'),time=node('p',new Date(pending.updatedAt).toLocaleString('zh-TW')+' · '+(pending.fields?.service_date||'日期未填'),'muted'),actions=node('div','','schedule-draft-actions'),resume=node('button','繼續填寫'),discard=node('button','刪除裝置草稿','secondary');
  resume.type=discard.type='button';resume.disabled=discard.disabled=working||isBusy();resume.onclick=()=>void restore();discard.onclick=async()=>{if(working||isBusy()||!confirm('刪除這台裝置尚未送出的排班草稿？正式排班不受影響。'))return;try{await discardDraft();}catch(error){report(error);}};
  actions.append(resume,discard);host.append(title,copy,time,actions);
 }
 async function refresh(){
  if(active?.form.isConnected)return;
  const current=++generation;
  try{const verified=await identity();if(current!==generation)return;scope=verified.scope;if(!pruned){await store.prune(scope);pruned=true;}const saved=await store.read(scope);if(current!==generation||active?.form.isConnected)return;pending=saved;render();}
  catch{if(current===generation){pending=null;host.hidden=true;}}
 }
 async function discardDraft(){
  const previous=active;if(previous)previous.enabled=false;
  await queue;const current=pending;
  if(current&&scope)await store.remove(scope,current.revision);
  active=null;pending=null;render();
 }
 async function beforeOpen(){
  if(working)return false;
  if(pending&&!active?.form.isConnected&&!confirm('這台裝置另有未送出的排班草稿。放棄它並開啟其他排班嗎？'))return false;
  try{await discardDraft();return true;}catch(error){report(error);return false;}
 }
 function attach(form,{row,fields,fingerprint,recovered=null}){
  const current={form,row,fields,fingerprint,enabled:!!recovered,restored:!!recovered,epoch:generation,revision:recovered?.revision||null,lastSnapshot:recovered?JSON.stringify(recovered.fields):null};active=current;if(recovered)pending=recovered;
  const section=node('aside','','schedule-device-draft'),copy=node('p','可選擇將排班姓名暫存在這個瀏覽器／App，24 小時內續填。共用裝置請勿開啟；重新登入後不能續填。'),button=node('button',recovered?'停止保留並刪除裝置草稿':'在這台裝置保留草稿','secondary'),status=node('p',recovered?'已帶回裝置草稿，尚未儲存正式排班。':'尚未開啟裝置草稿。','schedule-device-draft-status');
  button.type='button';status.setAttribute('role','status');section.append(copy,button,status);form.querySelector('h2').after(section);
  const live=()=>active===current&&current.epoch===generation&&form.isConnected;
  const write=()=>{
   if(!current.enabled||!live())return;
   const snapshot={...fields()},serialized=JSON.stringify(snapshot);if(serialized===current.lastSnapshot)return;current.lastSnapshot=serialized;status.textContent='正在保留裝置草稿…';
   queue=queue.catch(()=>{}).then(async()=>{
    if(!live()||!current.enabled)return;
    try{const payload={rowId:row?.id??null,baseHash:await fingerprint(),fields:snapshot};if(!live()||!current.enabled)return;const saved=await store.write(scope,current.revision,payload);if(!live())return;current.revision=saved.revision;pending=saved;status.textContent='已保留於這台裝置 · '+new Date(saved.updatedAt).toLocaleTimeString('zh-TW')+'，尚未送出。';}
    catch(error){if(live()){current.enabled=false;current.lastSnapshot=null;button.textContent='重試保留裝置草稿';status.textContent=error?.name==='DraftConflictError'?error.message:'裝置草稿未更新，這一頁的輸入仍在；請重試或儲存正式排班後再關閉。';}}
   });
  };
  button.onclick=async()=>{
   if(working||isBusy()||!live())return;
   if(current.enabled||current.clearFailed){current.enabled=false;await queue;try{if(pending)await store.remove(scope,current.revision);pending=null;current.revision=null;current.lastSnapshot=null;current.clearFailed=false;button.textContent='在這台裝置保留草稿';status.textContent='已刪除裝置草稿；這一頁的輸入仍保留。';}catch(error){current.clearFailed=true;button.textContent='重試刪除裝置草稿';report(error);}return;}
   working=true;button.disabled=true;
   try{const verified=await identity(true);if(!live())return;if(scope&&!sameScope(scope,verified.scope))throw new Error('登入已變更。');if(!actionAllowed(verified.access,row))throw new Error('目前沒有這份排班的編輯權限。');scope=verified.scope;await store.prune(scope);const existing=await store.read(scope);if(!live())return;if(existing&&existing.revision!==current.revision){status.textContent='另一個分頁已有裝置草稿，請先處理該草稿；本頁輸入仍保留。';return;}current.enabled=true;button.textContent='停止保留並刪除裝置草稿';write();}
   catch(error){if(live())status.textContent=error.message||'暫時無法保留裝置草稿，這一頁仍可繼續編輯。';}
   finally{working=false;if(live())button.disabled=false;}
  };
  // These controls manage a device copy, not the business form's dirty state.
  for(const type of ['input','change'])section.addEventListener(type,event=>event.stopPropagation());
  form.addEventListener('input',write);form.addEventListener('change',write);
  render();return {write};
 }
 async function restore(){
  if(working||isBusy()||!pending)return;working=true;render();const current=++generation,selected=pending;
  try{
   const verified=await identity(true);if(current!==generation)return;if(!sameScope(scope,verified.scope))throw new Error('登入已變更，請重新載入。');
   const saved=await store.read(scope);if(!saved||saved.revision!==selected.revision)throw new Error('裝置草稿已變更，請重新讀取排班。');
   if(!actionAllowed(verified.access,saved.rowId===null?null:{}))throw new Error('目前沒有這份排班的編輯權限，不能續填。');
   const data=await latest();if(current!==generation)return;const row=saved.rowId===null?null:data.rows.find(r=>String(r.id)===String(saved.rowId));
   const allowed=new Set(['service_date','event',...data.preferences.filter(p=>p.is_visible).map(p=>p.role_key)]);
   if(!validFields(saved.fields,allowed))throw new Error('草稿欄位已不適用目前排班，請保留原頁並聯絡管理員。');
   if(saved.rowId!==null&&!row)throw new Error('原排班已不在目前清單中，草稿未套用。');
   if(saved.rowId===null&&saved.fields.service_date&&data.rows.some(r=>String(r.service_date).replaceAll('/','-')===saved.fields.service_date))throw new Error('這一天已有正式排班，草稿未套用，請先核對是否已儲存。');
   if(await scheduleDraftFingerprint(row,data.preferences)!==saved.baseHash)throw new Error('正式排班或服事項目已更新，舊草稿未套用；請先核對最新安排。');
   if(current!==generation)return;
   const claimed=await store.write(scope,saved.revision,{rowId:saved.rowId,baseHash:saved.baseHash,fields:saved.fields});if(current!==generation)return;pending=claimed;
   await onRestore(row,pending,data.preferences);if(current!==generation)return;host.hidden=true;
  }catch(error){if(current===generation)message(error.message||'草稿尚未載入，請稍後重試。','error');}
  finally{working=false;render();}
 }
 const subscription=db.auth?.onAuthStateChange?.((event,session)=>{
  if(!scope)return;const next=sessionScope(session,church);
  if(event==='SIGNED_OUT'||(['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)&&!sameScope(scope,next))){
   const previousScope=scope;generation++;if(active)active.enabled=false;active=null;pending=null;scope=null;pruned=false;host.hidden=true;host.replaceChildren();onIdentityLost();
   queue=queue.catch(()=>{}).then(()=>store.clearSession(previousScope)).catch(()=>{});
  }
 });
 return {refresh,beforeOpen,attach,async verify(form){const current=active;if(!current||current.form!==form)throw new Error('編輯狀態已變更，請重新開啟排班。');if(!current.restored)return;const epoch=generation,verified=await identity(true);if(epoch!==generation||!sameScope(scope,verified.scope)||!actionAllowed(verified.access,current.row))throw new Error('登入或排班權限已變更，尚未送出。');const data=await latest(),row=current.row?data.rows.find(r=>String(r.id)===String(current.row.id)):null;if(epoch!==generation||await scheduleDraftFingerprint(row,data.preferences)!==await current.fingerprint())throw new Error('正式排班或服事項目已更新，尚未送出。請核對最新安排。');},async discard(){try{await discardDraft();return true;}catch(error){report(error);return false;}},async saved(){try{await discardDraft();return true;}catch{active=null;return false;}},dispose(){generation++;subscription?.data?.subscription?.unsubscribe?.();},get working(){return working;}};
}
