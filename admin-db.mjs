// Public client configuration; access is enforced by Auth and RLS.
import './action-feedback.mjs?v=20261008-toast-loop2';
import './ios-experience.mjs?v=20261008-ios3';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';
export {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './admin-auth-config.mjs';
const appMode=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(!localStorage.getItem(ADMIN_AUTH_STORAGE_KEY)&&sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY))localStorage.setItem(ADMIN_AUTH_STORAGE_KEY,sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY));
export const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:window.localStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
async function renewAppSession(){if(!appMode||document.visibilityState!=='visible')return;const {data}=await db.auth.getSession();const session=data.session;if(session&&session.expires_at*1000-Date.now()<15*60*1000)await db.auth.refreshSession().catch(()=>{});}
document.addEventListener('visibilitychange',()=>void renewAppSession());window.addEventListener('pageshow',()=>void renewAppSession());

function installPullToRefresh(){
  if(!appMode||!('ontouchstart' in window))return;
  const indicator=document.createElement('div');indicator.className='app-pull-refresh';indicator.setAttribute('aria-live','polite');indicator.textContent='↓ 下拉更新';document.body.append(indicator);
  const style=document.createElement('style');style.textContent='.app-pull-refresh{position:fixed;z-index:99999;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translate(-50%,-70px);padding:9px 15px;border-radius:999px;background:#173f37;color:#fff;font:700 14px/1 system-ui,-apple-system,"Noto Sans TC",sans-serif;box-shadow:0 8px 24px #0d2c2570;opacity:0;transition:transform .18s ease,opacity .18s ease;pointer-events:none}.app-pull-refresh.visible{opacity:1}.app-pull-refresh.ready{background:#d64c35}.app-pull-refresh.refreshing{transform:translate(-50%,0);opacity:1}';document.head.append(style);
  let start=0,distance=0,tracking=false;
  document.addEventListener('touchstart',event=>{const target=event.target;if(scrollY>0||event.touches.length!==1||target.closest('input,textarea,select,[contenteditable="true"]'))return;start=event.touches[0].clientY;distance=0;tracking=true;},{passive:true});
  document.addEventListener('touchmove',event=>{if(!tracking)return;distance=Math.max(0,Math.min(120,(event.touches[0].clientY-start)*.58));if(distance<=4)return;event.preventDefault();indicator.classList.add('visible');indicator.classList.toggle('ready',distance>=72);indicator.style.transform=`translate(-50%,${distance-58}px)`;indicator.textContent=distance>=72?'↻ 放開立即更新':'↓ 下拉更新';},{passive:false});
  document.addEventListener('touchend',async()=>{if(!tracking)return;tracking=false;if(distance>=72){indicator.className='app-pull-refresh refreshing';indicator.textContent='↻ 正在更新…';try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();}catch{}location.reload();return;}indicator.className='app-pull-refresh';indicator.style.removeProperty('transform');distance=0;},{passive:true});
  document.addEventListener('touchcancel',()=>{tracking=false;distance=0;indicator.className='app-pull-refresh';indicator.style.removeProperty('transform');},{passive:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installPullToRefresh,{once:true});else installPullToRefresh();
