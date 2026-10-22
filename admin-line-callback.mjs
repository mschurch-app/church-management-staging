import {encryptHandoff,handoffRequest,HANDOFF_STORAGE,pendingHandoff,scopeHandoffState,safeAppTarget} from './app-line-auth.mjs?v=20261022-line-sso1';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,ADMIN_AUTH_STORAGE_KEY} from './admin-auth-config.mjs';

const status=document.querySelector('#status');
const back=document.querySelector('#back');
const params=new URLSearchParams(location.search);
const callbackHash=new URLSearchParams(location.hash.replace(/^#/,''));
const standaloneFlow=params.getAll('return').includes('standalone');
history.replaceState({},'',location.pathname);
if(standaloneFlow){const visual=document.querySelector('.login-visual');visual.hidden=true;visual.style.display='none';const main=document.querySelector('.login-app');main.style.gridTemplateColumns='minmax(0,520px)';main.style.maxWidth='520px';document.querySelector('.login-panel .muted').textContent='請稍候，正在確認帳號與可使用的功能。';}
function createAuthClient(persist){
  return window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{global:{fetch:(input,options={})=>fetch(input,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})},auth:{storageKey:ADMIN_AUTH_STORAGE_KEY,...(persist?{storage:window.localStorage}:{}),detectSessionInUrl:false,persistSession:persist,autoRefreshToken:persist,flowType:'pkce'}});
}
// A scope-return callback must not refresh or reuse an old persisted session.
let db=createAuthClient(!standaloneFlow);

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

function sameStandaloneAttempt(pending){
  const current=pendingHandoff();
  return current?.mode==='standalone-web'&&current.id===pending.id&&current.secret===pending.secret&&
    current.expected_user===pending.expected_user&&current.next===pending.next&&current.expires>Date.now();
}

async function acceptStandaloneCallback(){
  const actualStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const pending=pendingHandoff();
  const id=params.get('handoff'),state=params.get('handoff_state');
  if(!actualStandalone||params.getAll('return').length!==1||params.getAll('handoff').length!==1||
     params.getAll('handoff_state').length!==1||!pending||pending.mode!=='standalone-web'||
     pending.id!==id||!/^[0-9a-f]{64}$/.test(state||'')||pending.expires<=Date.now()||
     await scopeHandoffState(pending.secret)!==state||!sameStandaloneAttempt(pending)){
    throw Error('LINE 登入沒有返回原本的教會 OS App，尚未完成登入。請回到登入頁重新開始。');
  }
  const accessToken=callbackHash.get('access_token'),refreshToken=callbackHash.get('refresh_token');
  if(params.has('code')||callbackHash.getAll('access_token').length!==1||
     callbackHash.getAll('refresh_token').length!==1||!accessToken||!refreshToken){
    throw Error('這次 LINE 登入未提供新的驗證資料，尚未登入。請重新開始。');
  }
  status.textContent='已返回教會 OS，正在安全核對 LINE 身分…';
  const verified=await db.auth.getUser(accessToken);
  const user=verified.data?.user;
  if(verified.error||typeof user?.id!=='string'||!user.id||!user.identities?.some(identity=>identity.provider==='custom:line-web')||
     pending.expected_user&&user.id!==pending.expected_user){
    throw Error('這次 LINE 身分無法核對，尚未登入。請重新開始。');
  }
  if(!sameStandaloneAttempt(pending))throw Error('這次 LINE 登入已取消或過期，尚未登入。請重新開始。');
  // Only the original App with the matching local capability may persist tokens.
  db=createAuthClient(true);
  const saved=await db.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
  if(saved.error||!saved.data?.session||saved.data.user?.id!==user.id){
    throw Error('App 未能儲存這次 LINE 登入，請重新開始。');
  }
  if(!sameStandaloneAttempt(pending)){
    await db.auth.signOut({scope:'local'});
    throw Error('這次 LINE 登入已取消，請重新開始。');
  }
  localStorage.removeItem(HANDOFF_STORAGE);
  return {session:saved.data.session,next:safeAppTarget(pending.next)};
}

async function start(){
  try{
    const hash=callbackHash;
    const oauthError=params.get('error_description')||params.get('error')||hash.get('error_description')||hash.get('error');
    if(oauthError){
      if(/user profile from external provider/i.test(oauthError))throw new Error('LINE 已登入，但尚未取得可用的個人資料。請確認 Supabase 已開啟 Email optional，且 LINE 的 Email address permission 已核准。');
      throw new Error('LINE 登入未完成，請返回登入頁後重試。');
    }

    let session=null,standaloneNext='';
    if(standaloneFlow){
      const accepted=await acceptStandaloneCallback();
      session=accepted.session;standaloneNext=accepted.next;
      cleanCallbackUrl();
    }else{
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

      for(let attempt=0;attempt<30;attempt+=1){
        session=(await db.auth.getSession()).data.session;
        if(session)break;
        await new Promise(resolve=>setTimeout(resolve,200));
      }
    }
    if(!session)throw new Error('LINE 登入未完成，請返回登入頁後再試一次。');

    if(params.get('return')==='app'){
      const id=params.get('handoff'),secret=params.get('handoff_key');
      if(!/^[0-9a-f-]{36}$/i.test(id||'')||!/^[0-9a-f]{64}$/.test(secret||''))throw Error('登入交接已失效，請返回 App 重新登入。');
      const cipher=await encryptHandoff(secret,{access_token:session.access_token,refresh_token:session.refresh_token});
      await handoffRequest({action:'complete',id,secret,cipher},session.access_token);
      try{window.opener?.postMessage({type:'church-os-line-handoff-ready',id},location.origin);}catch{}
      document.querySelector('.login-badge').textContent='正在確認登入';document.querySelector('.login-visual h2').textContent='正在確認 App 登入';
      document.querySelector('.login-panel h1').textContent='正在接續登入';document.querySelector('.login-panel .muted').textContent='登入結果須由原本的教會 OS App 確認。';
      back.hidden=true;
      status.textContent='LINE 驗證已送出，正在等待原本的 App 核對登入結果。';
      return;
    }
    // Account applications require a verified LINE identity, but no admin grants.
    const requestedTarget=standaloneNext||safeNext();
    if(requestedTarget&&new URL(requestedTarget,location.origin).pathname==='/coworker-apply.html'){
      const verified=await db.auth.getUser();
      if(verified.error||!verified.data?.user?.identities?.some(i=>i.provider==='custom:line-web'))throw Error('請先完成 LINE 身分驗證。');
      status.textContent='LINE 身分已確認，正在開啟申請頁…';location.replace('/coworker-apply.html');return;
    }
    status.textContent='LINE 身分已確認，正在載入管理權限…';
    const access=await Promise.race([db.rpc('get_my_church_access'),new Promise((_,reject)=>setTimeout(()=>reject(Error('權限載入逾時，請返回登入頁重試。')),15000))]);
    if(access.error||!Array.isArray(access.data))throw Error('管理權限暫時無法讀取，請稍後重試；尚未送出權限審核通知。');
    if(!access.data.length){
      status.textContent='尚未取得同工權限，正在開啟申請頁…';
      location.replace('/coworker-apply.html');return;
    }
    const churches=[...new Set(access.data.map(row=>row.church_id).filter(value=>['M+','SHiNE'].includes(value)))];
    if(!churches.length)throw new Error('帳號尚未設定可使用的堂會。');
    const destination=standaloneNext||safeNext()||'admin-dashboard.html?church='+encodeURIComponent(churches[0]);
    status.textContent='登入成功，正在開啟管理首頁…';
    location.replace(destination);
  }catch(error){
    document.querySelector('.login-visual h2').textContent='登入尚未完成';document.querySelector('.login-panel h1').textContent='請重新登入';status.textContent=error.message||'LINE 登入暫時無法使用。';
    if(standaloneFlow){
      document.querySelector('.login-panel .muted').textContent='這次登入尚未完成，請重新開始。';
      back.textContent='返回登入頁';
      const retry=new URL('admin-login-v2.html',location.href);if(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)retry.searchParams.set('source','app-v2');
      if(safeNext())retry.searchParams.set('next',safeNext());
      back.href=retry.href;
    }
    back.hidden=false;
  }
}

start();
