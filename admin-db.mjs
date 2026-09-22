// Public client key for staging only; access is enforced by Auth and RLS.
export const db=window.supabase.createClient('https://aqanuwilmvdtlzuqlrau.supabase.co','sb_publishable_-on9uPxVvSaERBEpkoc_xg_CYuANexJ',{auth:{storageKey:'church-staging-admin-v1',storage:window.sessionStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
