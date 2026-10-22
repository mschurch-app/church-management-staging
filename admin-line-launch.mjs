import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';
import {safeAppTarget} from './app-line-auth.mjs?v=20261022-app-line1';
const fragment=new URLSearchParams(location.hash.slice(1)),status=document.querySelector('#status');
// The one-time capability is never included in this page's HTTP request/referrer.
async function start(){
 const id=fragment.get('handoff'),secret=fragment.get('handoff_key'),expires=Number(fragment.get('expires'));
 if(!id&&!secret)return; // Existing non-iOS launcher compatibility.
 history.replaceState(null,'',location.pathname);
 try{
  if(!/^[0-9a-f-]{36}$/i.test(id||'')||!/^[0-9a-f]{64}$/.test(secret||'')||!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+310000)throw Error('登入交接已過期，請回到教會 OS App 重新按 LINE 登入。');
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:localStorage,persistSession:true,detectSessionInUrl:false,autoRefreshToken:true,flowType:'implicit'}});
  const callback=new URL('admin-line-callback.html',location.href);callback.search=new URLSearchParams({return:'app',handoff:id,handoff_key:secret,next:safeAppTarget(fragment.get('next'))}).toString();
  const result=await Promise.race([db.auth.signInWithOAuth({provider:'custom:line-web',options:{redirectTo:callback.href,scopes:'profile',skipBrowserRedirect:true}}),new Promise((_,reject)=>setTimeout(()=>reject(Error('連接 LINE 逾時，請返回 App 重試。')),15000))]);
  if(result.error||!result.data?.url)throw result.error||Error('無法取得 LINE 登入頁，請返回 App 重試。');
  location.replace(result.data.url);
 }catch(error){status.textContent=error.message||'LINE 登入暫時無法開啟，請回到教會 OS App 重試。';document.querySelector('h1').textContent='請回到教會 OS App';}
}
void start();
