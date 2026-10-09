import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './admin-auth-config.mjs';
export const HANDOFF_STORAGE='church-os-line-handoff-v1';
const endpoint=SUPABASE_URL+'/functions/v1/app-auth-handoff';
export const appMode=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||new URLSearchParams(location.search).get('source')==='app-v2';
export function safeAppTarget(raw,fallback='admin-dashboard.html'){try{const url=new URL(raw||fallback,location.origin);if(url.origin===location.origin&&url.pathname.endsWith('.html')&&!url.pathname.includes('..'))return url.pathname+url.search+url.hash;}catch{}return '/'+fallback;}
const hexBytes=hex=>Uint8Array.from(hex.match(/../g)||[],pair=>parseInt(pair,16));
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function encryptHandoff(secret,value){const key=await crypto.subtle.importKey('raw',hexBytes(secret),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));return {iv:encode(iv),data:encode(new Uint8Array(data))};}
export async function decryptHandoff(secret,cipher){const key=await crypto.subtle.importKey('raw',hexBytes(secret),'AES-GCM',false,['decrypt']);const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(cipher.iv)},key,decode(cipher.data));return JSON.parse(new TextDecoder().decode(data));}
export async function handoffRequest(body,token){const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw Error('登入同步暫時無法完成，請返回 App 再試一次。');return data;}
export function pendingHandoff(){try{const value=JSON.parse(localStorage.getItem(HANDOFF_STORAGE)||'null');if(value&&value.expires>Date.now()&&/^[0-9a-f]{64}$/.test(value.secret))return value;}catch{}localStorage.removeItem(HANDOFF_STORAGE);return null;}
export function wireLineAuth(db,button,status,{flow='login',next='admin-dashboard.html',onResume}={}){
 let popup=null,polling=false,timer=null,resumed=false;
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary line-auth-cancel';cancel.textContent='取消這次 LINE 登入';cancel.hidden=true;status.after(cancel);
 cancel.onclick=()=>{localStorage.removeItem(HANDOFF_STORAGE);clearInterval(timer);try{popup?.close();}catch{}reset();status.textContent='已取消，可重新選擇登入方式。';};
 const reset=()=>{cancel.hidden=true;button.disabled=false;button.removeAttribute('aria-busy');};
 async function resume(){
  if(polling||resumed||document.visibilityState==='hidden')return;
  const pending=pendingHandoff();if(!pending){reset();return;}
  button.disabled=true;button.setAttribute('aria-busy','true');cancel.hidden=false;polling=true;
  try{
   const result=await handoffRequest({action:'read',id:pending.id,secret:pending.secret});
   if(!result.ready){status.textContent='請完成 LINE 登入，再回到教會 OS App；系統會接續登入。';return;}
   let session;try{session=await decryptHandoff(pending.secret,result.cipher);}catch{throw Object.assign(Error('登入交接資料無法驗證，請重新登入。'),{fatal:true});}
   const verified=await db.auth.getUser(session.access_token);
   if(verified.error)throw verified.error;
   if(!verified.data.user?.identities?.some(i=>i.provider==='custom:line-web')||pending.expected_user&&verified.data.user.id!==pending.expected_user)throw Object.assign(Error('綁定帳號與原登入帳號不符，請重新綁定。'),{fatal:true});
   const saved=await db.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});if(saved.error)throw saved.error;
   resumed=true;clearInterval(timer);localStorage.removeItem(HANDOFF_STORAGE);
   handoffRequest({action:'finish',id:pending.id,secret:pending.secret}).catch(()=>{});
   try{popup?.close();}catch{}
   status.textContent='登入成功，正在開啟教會 OS…';
   if(onResume)await onResume(session);else location.replace(safeAppTarget(pending.next));
  }catch(error){status.textContent=error.fatal?error.message:'連線暫時中斷，正在等待恢復；也可取消後重新登入。';if(error.fatal){localStorage.removeItem(HANDOFF_STORAGE);clearInterval(timer);reset();}}
  finally{polling=false;}
 }
 function watch(){clearInterval(timer);timer=setInterval(()=>{if(!pendingHandoff()){clearInterval(timer);if(!resumed){status.textContent='LINE 登入等待已結束，請再按一次登入。';reset();}return;}void resume();},2000);void resume();}
 window.addEventListener('pageshow',()=>{if(pendingHandoff())watch();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&pendingHandoff())watch();});
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='church-os-line-handoff-ready'&&event.data.id===pendingHandoff()?.id)void resume();});
 button.addEventListener('click',async()=>{
  if(button.disabled)return;
  const installed=appMode();
  // Open a real visible page synchronously; never leave an about:blank App window.
  popup=installed?window.open('admin-line-launch.html','church-os-line-auth'):null;
  if(installed&&!popup){status.textContent='請允許此網站開啟登入視窗，再按 LINE 登入；App 會保留目前頁面。';return;}
  button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='正在開啟 LINE 安全登入…';
  try{
   const callback=new URL('admin-line-callback.html',location.href);callback.searchParams.set('next',safeAppTarget(next));if(flow==='link')callback.searchParams.set('flow','link');
   if(installed){
    const current=flow==='link'?await db.auth.getUser():null;if(flow==='link'&&!current?.data.user)throw Error('原登入狀態已失效，請重新登入。');
    const pending={id:crypto.randomUUID(),secret:Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join(''),expires:Date.now()+300000,next:safeAppTarget(next),expected_user:current?.data.user?.id||null};
    localStorage.setItem(HANDOFF_STORAGE,JSON.stringify(pending));callback.searchParams.set('return','app');callback.searchParams.set('handoff',pending.id);callback.searchParams.set('handoff_key',pending.secret);
   }
   const operation=flow==='link'?db.auth.linkIdentity.bind(db.auth):db.auth.signInWithOAuth.bind(db.auth);
   const result=await Promise.race([operation({provider:'custom:line-web',options:{redirectTo:callback.href,scopes:'profile',skipBrowserRedirect:true}}),new Promise((_,reject)=>setTimeout(()=>reject(Error('連接 LINE 逾時，請重試。')),15000))]);
   if(result.error||!result.data?.url)throw result.error||Error('無法取得 LINE 登入頁。');
   if(installed){popup.location.replace(result.data.url);watch();}else location.assign(result.data.url);
  }catch(error){try{popup?.close();}catch{}localStorage.removeItem(HANDOFF_STORAGE);reset();status.textContent=error.message||'LINE 登入暫時無法使用。';}
 });
 if(pendingHandoff())watch();
 return {resume,hasPending:()=>Boolean(pendingHandoff())};
}
