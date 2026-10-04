// Public client configuration; access is enforced by Auth and RLS.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';
export {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './admin-auth-config.mjs';
const appMode=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(appMode&&!localStorage.getItem(ADMIN_AUTH_STORAGE_KEY)&&sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY))localStorage.setItem(ADMIN_AUTH_STORAGE_KEY,sessionStorage.getItem(ADMIN_AUTH_STORAGE_KEY));
export const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:appMode?window.localStorage:window.sessionStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
async function renewAppSession(){if(!appMode||document.visibilityState!=='visible')return;const {data}=await db.auth.getSession();const session=data.session;if(session&&session.expires_at*1000-Date.now()<15*60*1000)await db.auth.refreshSession().catch(()=>{});}
document.addEventListener('visibilitychange',()=>void renewAppSession());window.addEventListener('pageshow',()=>void renewAppSession());
