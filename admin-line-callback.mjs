import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';

const status=document.querySelector('#status');
const back=document.querySelector('#back');
const params=new URLSearchParams(location.search);
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,storage:window.localStorage,detectSessionInUrl:false,persistSession:true,autoRefreshToken:true,flowType:'pkce'}});

function safeNext(){
  const raw=params.get('next')||'';
  try{
    const target=new URL(raw,location.origin);
    if(target.origin===location.origin&&target.pathname.endsWith('.html')&&!target.pathname.includes('..'))return target.pathname+target.search;
  }catch{}
  return '';
}

function cleanCallbackUrl(){
  history.replaceState({},'',location.pathname+(params.get('next')?'?next='+encodeURIComponent(params.get('next')):''));
}

async function hasLinkedLineSession(){
  const {data,error}=await db.auth.getUser();
  return !error&&Boolean(data.user?.identities?.some(identity=>identity.provider==='custom:line-web'));
}

async function start(){
  try{
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    const oauthError=params.get('error_description')||params.get('error')||hash.get('error_description')||hash.get('error');
    if(oauthError){
      if(/user profile from external provider/i.test(oauthError))throw new Error('LINE 已登入，但尚未取得可用的個人資料。請確認 Supabase 已開啟 Email optional，且 LINE 的 Email address permission 已核准。');
      throw new Error('LINE 登入未完成，請返回登入頁後重試。');
    }

    const code=params.get('code');
    if(code){
      const exchanged=await db.auth.exchangeCodeForSession(code);
      if(exchanged.error){
        const linked=params.get('flow')==='link'&&await hasLinkedLineSession();
        if(!linked)throw new Error('LINE 授權已完成，但手機瀏覽器未保留登入狀態。請返回後重新登入。');
      }
      cleanCallbackUrl();
    }else if(hash.get('access_token')&&hash.get('refresh_token')){
      const saved=await db.auth.setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')});
      if(saved.error)throw new Error('LINE 登入狀態無法儲存，請返回後重試。');
      cleanCallbackUrl();
    }

    let session=null;
    for(let attempt=0;attempt<30;attempt+=1){
      session=(await db.auth.getSession()).data.session;
      if(session)break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!session)throw new Error('LINE 登入未完成，請返回登入頁後再試一次。');

    status.textContent='LINE 身分已確認，正在載入管理權限…';
    const access=await db.rpc('get_my_church_access');
    if(access.error||!Array.isArray(access.data)||!access.data.length){
      status.textContent='權限尚未建立，正在通知管理員審核…';
      await db.functions.invoke('app-push',{body:{action:'request-admin-access-review'}});
      throw new Error('LINE 已登入，權限審核通知已送給管理員。核准後請重新登入。');
    }
    const churches=[...new Set(access.data.map(row=>row.church_id).filter(value=>['M+','SHiNE'].includes(value)))];
    if(!churches.length)throw new Error('帳號尚未設定可使用的堂會。');
    const destination=safeNext()||'admin-dashboard.html?church='+encodeURIComponent(churches[0]);
    if(params.get('return')==='app'&&window.opener&&!window.opener.closed){
      status.textContent='登入成功，正在返回教會 OS App…';
      const opener=window.opener;
      window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===opener&&event.data?.type==='church-os-line-auth-received')window.close();},{once:true});
      opener.postMessage({type:'church-os-line-auth-complete',access_token:session.access_token,refresh_token:session.refresh_token,target:destination},location.origin);
      back.textContent='關閉此頁，返回教會 OS App';
      back.href='#';
      back.hidden=false;
      back.addEventListener('click',event=>{event.preventDefault();window.close();},{once:true});
      setTimeout(()=>{status.textContent='登入已完成。若頁面沒有自動關閉，請按下方返回教會 OS App。';},1200);
      return;
    }
    status.textContent='登入成功，正在開啟管理首頁…';
    location.replace(destination);
  }catch(error){
    status.textContent=error.message||'LINE 登入暫時無法使用。';
    back.hidden=false;
  }
}

start();
