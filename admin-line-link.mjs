import {wireLineAuth,pendingHandoff} from './app-line-auth.mjs?v=20261009-stage4';
import {db} from './admin-db.mjs?v=20261009-stage4';
import {readAccess,hasVerifiedLine} from './admin-access.mjs?v=20261009-stage1';

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
  try{
  if(pendingHandoff())return;
  const {data,error}=await db.auth.getUser();
  if(error||!data.user){location.replace('admin-login-v2.html');return;}
  if(await hasVerifiedLine(db,data.user)){location.replace(safeNext());return;}
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
  }catch(error){
    status.textContent=error.message||'暫時無法確認帳號，請稍後重試。';
    const retry=document.createElement('button');retry.type='button';retry.textContent='重新確認';
    retry.addEventListener('click',()=>{retry.disabled=true;void start();},{once:true});status.append(retry);
  }
}

wireLineAuth(db,button,status,{flow:'link',next:safeNext()});

logout.addEventListener('click',async()=>{await db.auth.signOut();location.replace('admin-login-v2.html');});
start();
