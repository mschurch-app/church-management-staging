import {wireLineAuth,pendingHandoff} from './app-line-auth.mjs?v=20261009-app-audit2';
import {db} from './admin-db.mjs?v=20261009-app-audit2';
import {readAccess} from './admin-access.mjs?v=20261009-app-audit2';

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

async function start(){
  if(pendingHandoff())return;
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

wireLineAuth(db,button,status,{flow:'link',next:safeNext()});

logout.addEventListener('click',async()=>{await db.auth.signOut();location.replace('admin-login-v2.html');});
start();
