import {db} from './admin-db.mjs?v=20261008-ios6';
import {readAccess} from './admin-access.mjs?v=20261008-shine-email1';

const status=document.querySelector('#status');
const button=document.querySelector('#link-line');
const logout=document.querySelector('#logout');
const params=new URLSearchParams(location.search);
const appMode=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||params.get('source')==='app-v2';
let lineAuthWindow=null;

function safeNext(){
  const raw=params.get('next')||'admin-dashboard.html';
  try{
    const target=new URL(raw,location.origin);
    if(target.origin===location.origin&&target.pathname.endsWith('.html')&&!target.pathname.includes('..'))return target.pathname.replace(/^\//,'')+target.search+target.hash;
  }catch{}
  return 'admin-dashboard.html';
}

window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.data?.type!=='church-os-line-auth-complete'||appMode&&event.source!==lineAuthWindow)return;
  try{
    const saved=await db.auth.setSession({access_token:event.data.access_token,refresh_token:event.data.refresh_token});
    if(saved.error)throw saved.error;
    event.source?.postMessage({type:'church-os-line-auth-received'},location.origin);
    status.textContent='LINE 綁定完成，正在返回教會 OS…';
    location.replace((()=>{try{const target=new URL(event.data.target||safeNext(),location.origin);if(target.origin===location.origin&&target.pathname.endsWith('.html')&&!target.pathname.includes('..'))return target.pathname.replace(/^\//,'')+target.search+target.hash;}catch{}return safeNext();})());
  }catch{
    status.textContent='LINE 已完成驗證，但 App 登入狀態同步失敗，請再試一次。';
    button.disabled=false;
  }
});

async function start(){
  const {data,error}=await db.auth.getUser();
  if(error||!data.user){location.replace('admin-login-v2.html');return;}
  if((data.user.identities||[]).some(identity=>identity.provider==='custom:line-web')){location.replace(safeNext());return;}
  try{
    const access=await readAccess(db,{user:data.user,fresh:true,retry:true});
    if(access.churches.includes('SHiNE')){
      status.textContent='已確認火樂教會管理權限，正在開啟管理首頁…';
      location.replace('admin-dashboard.html?church=SHiNE');
      return;
    }
  }catch{}
  const email=data.user.email||'目前的管理帳號';
  document.querySelector('#account').textContent=email;
  button.disabled=false;
}

button.addEventListener('click',async()=>{
  button.disabled=true;
  status.textContent=appMode?'正在開啟 LINE，完成後會自動回到 App…':'正在開啟 LINE 安全綁定…';
  lineAuthWindow=appMode?window.open('about:blank','church-os-line-auth'):null;
  const callback=new URL('admin-line-callback.html',location.href);
  callback.searchParams.set('next',safeNext());
  callback.searchParams.set('flow','link');
  if(appMode)callback.searchParams.set('return','app');
  const {data,error}=await db.auth.linkIdentity({provider:'custom:line-web',options:{redirectTo:callback.href,scopes:'profile',skipBrowserRedirect:appMode}});
  if(error||appMode&&!data?.url){try{lineAuthWindow?.close();}catch{}status.textContent='目前無法啟動 LINE 綁定，請稍後再試。';button.disabled=false;return;}
  if(appMode){if(lineAuthWindow)lineAuthWindow.location.replace(data.url);else location.assign(data.url);}
});

logout.addEventListener('click',async()=>{await db.auth.signOut();location.replace('admin-login-v2.html');});
start();
