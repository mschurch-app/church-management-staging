import {db} from './admin-db.mjs?v=20261008-line-link1';

const status=document.querySelector('#status');
const button=document.querySelector('#link-line');
const logout=document.querySelector('#logout');
const params=new URLSearchParams(location.search);

function safeNext(){
  const raw=params.get('next')||'admin-dashboard.html';
  try{
    const target=new URL(raw,location.origin);
    if(target.origin===location.origin&&target.pathname.endsWith('.html')&&!target.pathname.includes('..'))return target.pathname.replace(/^\//,'')+target.search+target.hash;
  }catch{}
  return 'admin-dashboard.html';
}

async function start(){
  const {data,error}=await db.auth.getUser();
  if(error||!data.user){location.replace('admin-login-v2.html');return;}
  if((data.user.identities||[]).some(identity=>identity.provider==='custom:line-web')){location.replace(safeNext());return;}
  const email=data.user.email||'目前的管理帳號';
  document.querySelector('#account').textContent=email;
  button.disabled=false;
}

button.addEventListener('click',async()=>{
  button.disabled=true;
  status.textContent='正在開啟 LINE 安全綁定…';
  const callback=new URL('admin-line-callback.html',location.href);
  callback.searchParams.set('next',safeNext());
  const {error}=await db.auth.linkIdentity({provider:'custom:line-web',options:{redirectTo:callback.href,scopes:'profile'}});
  if(error){status.textContent='目前無法啟動 LINE 綁定，請稍後再試。';button.disabled=false;}
});

logout.addEventListener('click',async()=>{await db.auth.signOut();location.replace('admin-login-v2.html');});
start();
