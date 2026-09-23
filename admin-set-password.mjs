import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';

const auth=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:window.sessionStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
const form=document.querySelector('#password-form'),status=document.querySelector('#status'),button=document.querySelector('#submit'),recovery=document.querySelector('#recovery-link');
let ready=false;

function cleanUrl(){history.replaceState({},document.title,location.pathname);}
function fail(message='此連結無效、已使用或已過期。請重新取得一封密碼設定信。'){ready=false;form.hidden=true;recovery.hidden=false;status.textContent=message;}

async function establishSession(){
  try{
    const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.replace(/^#/,'')),code=query.get('code'),accessToken=hash.get('access_token'),refreshToken=hash.get('refresh_token');
    if(code){const {error}=await auth.auth.exchangeCodeForSession(code);if(error)throw error;cleanUrl();}
    else if(accessToken&&refreshToken){const {error}=await auth.auth.setSession({access_token:accessToken,refresh_token:refreshToken});if(error)throw error;cleanUrl();}
    const {data,error}=await auth.auth.getUser();if(error||!data?.user)throw error||new Error('missing_session');
    ready=true;form.hidden=false;recovery.hidden=true;status.textContent='連結驗證成功，請設定新密碼。';
  }catch{fail();}
}

form.addEventListener('submit',async event=>{
  event.preventDefault();if(!ready)return;
  const password=document.querySelector('#password').value,confirm=document.querySelector('#confirm').value;
  if(password!==confirm){status.textContent='兩次輸入的密碼不一致。';return;}
  if(password.length<10){status.textContent='密碼至少需要 10 個字元。';return;}
  button.disabled=true;status.textContent='正在安全儲存…';
  try{
    const {error}=await auth.auth.updateUser({password});if(error)throw error;
    const accepted=await auth.rpc('accept_my_admin_invitation');if(accepted.error&&!String(accepted.error.message||'').includes('invitation_not_found'))throw accepted.error;
    status.textContent='密碼設定完成，管理員帳號已啟用。即將前往登入頁。';form.hidden=true;recovery.hidden=true;
    setTimeout(()=>location.replace('admin-login.html'),1200);
  }catch{fail('密碼未更新。連結可能已使用或過期，請重新取得密碼設定信。');button.disabled=false;}
});

establishSession();
