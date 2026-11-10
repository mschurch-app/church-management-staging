import {MEMBER_LIFF_IDS} from './line-config.mjs';
const endpoint='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/member-access';
const skipKey='church-os-newcomer-return-once-v1';
let sessionClient;
async function savedSessionCredentials(){
 if(!window.supabase?.createClient)return {};
 if(!sessionClient){const c=await import('./admin-auth-config.mjs');sessionClient=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:c.ADMIN_AUTH_STORAGE_KEY,storage:window.localStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});}
 const result=await sessionClient.auth.getSession();return result.data?.session?.access_token?{sessionToken:result.data.session.access_token}:{};
}
async function credentialScope(auth){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['idToken','accessToken','sessionToken'].map(k=>auth[k]||'')))))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function safeMemberReturn(raw,fallback='/line-member.html?church=M%2B'){
 try{const u=new URL(raw,location.origin);if(u.origin===location.origin&&u.pathname.endsWith('.html')&&!/newcomer|callback|login|launch/i.test(u.pathname)&&!u.username&&!u.password){u.hash='';return u.pathname+u.search;}}catch{}
 return fallback;
}
export async function onboardingCredentials(church,{initialize=false,sessionToken=''}={}){
 if(!Object.hasOwn(MEMBER_LIFF_IDS,church))throw Error('invalid_church');
 if(sessionToken)return {sessionToken};
 if(new URLSearchParams(location.search).get('identitySource')==='web')return savedSessionCredentials();
 const liff=window.liff;
 if(initialize&&liff?.init)await liff.init({liffId:MEMBER_LIFF_IDS[church]});
 if(liff?.isLoggedIn?.()){
  const idToken=liff.getIDToken?.()||'',accessToken=liff.getAccessToken?.()||'';
  if(idToken||accessToken)return {...(idToken?{idToken}:{}),...(accessToken?{accessToken}:{})};
 }
 const idToken=sessionStorage.getItem('line-member-token:'+church)||'',accessToken=sessionStorage.getItem('line-member-access-token:'+church)||'';
 if(idToken||accessToken)return {...(idToken?{idToken}:{}),...(accessToken?{accessToken}:{})};
 return savedSessionCredentials();
}
export async function ensureMemberOnboarding({church,credentials,returnTo=location.href}={}){
 const target=safeMemberReturn(returnTo,'/line-member.html?church='+encodeURIComponent(church));
 const auth=credentials||await onboardingCredentials(church);if(!Object.keys(auth).length)return false;
 const scope=await credentialScope(auth);
 // One use, only for this return route; this is never a registration or authorization flag.
 try{const skip=JSON.parse(sessionStorage.getItem(skipKey)||'null');sessionStorage.removeItem(skipKey);if(skip?.church===church&&skip.target===target&&skip.scope===scope&&skip.expires>Date.now())return false;}catch{}
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),body:JSON.stringify({action:'onboarding',church,...auth})});
 const data=await response.json();if(!response.ok||typeof data.registered!=='boolean')throw Error('身份確認暫時無法完成，請稍後重試。');
 if(data.registered)return false;
 for(const k of ['idToken','accessToken'])if(auth[k])sessionStorage.setItem((k==='idToken'?'line-member-token:':'line-member-access-token:')+church,auth[k]);
 const url=new URL('newcomer.html',location.href);url.searchParams.set('church',church);url.searchParams.set('onboarding','1');url.searchParams.set('identitySource',auth.sessionToken?'web':'line');url.searchParams.set('next',target);location.replace(url.href);return true;
}
export async function continueWithoutRegistration(church,raw){
 const target=safeMemberReturn(raw,'/line-member.html?church='+encodeURIComponent(church));
 const scope=await credentialScope(await onboardingCredentials(church));
 sessionStorage.setItem(skipKey,JSON.stringify({church,target,scope,expires:Date.now()+60000}));location.replace(target);
}
