// Public client configuration; access is enforced by Auth and RLS.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';
export {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './admin-auth-config.mjs';
export const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:window.sessionStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
