import {wireLineAuth,pendingHandoff,safeAppTarget} from './app-line-auth.mjs?v=20261022-coworker2';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';
const status=document.querySelector('#status'),line=document.querySelector('#line-login');
const next=safeAppTarget(new URLSearchParams(location.search).get('next'));
const boundedFetch=(input,options={})=>fetch(input,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
const bounded=(request)=>Promise.race([request,new Promise((_,reject)=>setTimeout(()=>reject(Error('登入確認逾時，請重試。')),15000))]);
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{global:{fetch:boundedFetch},auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:localStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true,flowType:'implicit'}});
wireLineAuth(db,line,status,{next,nativeButton:document.querySelector('#line-auto-login'),webDefault:true});
navigator.serviceWorker?.register('/church-os-sw.js?v=20261022-coworker2').then(reg=>reg.update()).catch(()=>{});
async function resume(){
 if(pendingHandoff())return;
 try{
  const current=await bounded(db.auth.getSession());if(!current.data?.session)return;
  status.textContent='正在恢復登入狀態…';
  const verified=await bounded(db.auth.getUser());if(verified.error||!verified.data?.user){status.textContent='請使用 LINE 重新登入。';return;}
  // The protected server capability includes explicitly verified canonical aliases.
  const capabilities=await db.rpc('get_my_app_capabilities');
  if(capabilities.error)throw Error('capabilities_unavailable');
  const hasLine=verified.data.user.identities?.some(i=>i.provider==='custom:line-web')||capabilities.data?.has_line===true;
  if(!hasLine){status.textContent='請使用 LINE 登入。';return;}
  const access=await db.rpc('get_my_church_access');if(access.error||!Array.isArray(access.data))throw Error('access_unavailable');
  const church=access.data.find(row=>['M+','SHiNE'].includes(row.church_id))?.church_id;
  if(!church){status.textContent='LINE 已登入；尚未取得同工權限，可按「申請同工帳號」填寫申請或查詢審核進度。';return;}
  if(pendingHandoff())return;
  location.replace(next==='/admin-dashboard.html'?'admin-dashboard.html?church='+encodeURIComponent(church):next);
 }catch{status.textContent='登入狀態暫時無法恢復，請使用 LINE 重試。';}
}
void resume();
