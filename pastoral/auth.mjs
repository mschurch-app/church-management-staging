import {LINE_LOGIN_CHANNEL_ID, PASTORAL_LIFF_ID, PASTORAL_AUTH_ENDPOINT} from './config.mjs?v=20260924-4';
import {db} from '../admin-db.mjs?v=20261009-app-audit1';

let initialization;
function timeout(promise,milliseconds,message){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),milliseconds);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
export function loginConfigured(){
  try{return PASTORAL_LIFF_ID.startsWith(`${LINE_LOGIN_CHANNEL_ID}-`)&&new URL(PASTORAL_AUTH_ENDPOINT).protocol==='https:';}
  catch{return false;}
}
async function initialize(){
  if(!loginConfigured())throw new Error('教會同工專用 LINE 入口尚在設定中，請等待管理者提供啟用通知。');
  if(!initialization)initialization=(async()=>{
    await timeout(new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://static.line-scdn.net/liff/edge/2/sdk.js';
      script.onload=resolve;
      script.onerror=()=>reject(new Error('LINE 登入服務無法載入，請稍後再試。'));
      document.head.append(script);
    }),12000,'LINE 登入服務載入逾時，請確認網路後再試。');
    await timeout(window.liff.init({liffId:PASTORAL_LIFF_ID}),12000,'LINE 登入服務初始化逾時，請重新整理後再試。');
  })();
  try{await initialization;}catch(error){initialization=undefined;throw error;}
}
export async function authenticateStaff({interactive=false,enrollmentCode='',returnUrl=''}={}){
  const session=await timeout(db.auth.getSession(),10000,'登入狀態查詢逾時，請重新整理後再試。');
  if(session.data.session){
    const profile=await timeout(db.rpc('get_my_pastoral_staff'),12000,'同工權限查詢逾時，請重新整理後再試。');
    if(!profile.error&&profile.data)return {id:profile.data.id,name:profile.data.name,role:profile.data.role,churches:(profile.data.entityKeys||[]).map(key=>key==='mplus'?'M+':key==='shine'?'SHiNE':'台灣基督教社會關懷協會')};
    throw new Error('這個教會 OS 帳號尚未設定同工身分，請由管理員在帳號權限中完成設定。');
  }
  const query=new URLSearchParams(location.search);
  const openedFromLine=query.has('liff.state')||query.has('liffClientId')||document.referrer.startsWith('https://liff.line.me/');
  if(!openedFromLine)throw new Error('請先使用教會 OS 帳號登入，即可進入同工協作平台。');
  await timeout(initialize(),15000,'LINE 登入初始化逾時，請重新整理後再試。');
  if(!window.liff.isLoggedIn()){
    if(interactive)window.liff.login({redirectUri:returnUrl||new URL('./',location.href).href});
    throw new Error('請先使用已獲授權的 LINE 帳號登入。');
  }
  const token=window.liff.getIDToken();
  if(!token)throw new Error('LINE 登入資訊已失效，請重新登入。');
  let response;
  try{
    response=await fetch(PASTORAL_AUTH_ENDPOINT,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify(enrollmentCode?{enrollment_code:enrollmentCode}:{}),
      credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000),
    });
  }catch{throw new Error('暫時無法確認教會同工權限，請稍後再試。');}
  if(response.status===202){
    const error=new Error('LINE 身分已登記並鎖定為待核實狀態；尚未開放工作台，請等待管理者確認。');
    error.code='identity_recorded';
    throw error;
  }
  if(response.status===401){
    if(window.liff.isLoggedIn())window.liff.logout();
    throw new Error('LINE 登入已失效，請重新登入。');
  }
  if(response.status===403){
    const result=await response.json().catch(()=>({}));
    if(result.error==='invite_invalid'){
      const error=new Error('邀請碼無效、已使用或已過期，請向牧師確認。');
      error.code='invite_invalid';
      throw error;
    }
    throw new Error('此 LINE 帳號尚未獲授權，請確認是否收到個人邀請碼。');
  }
  if(!response.ok)throw new Error('教會同工登入暫時無法使用，請稍後再試。');
  const {staff}=await response.json();
  if(!staff||!['pastor','secretary','admin'].includes(staff.role)||typeof staff.name!=='string'||
     !Array.isArray(staff.churches)||!staff.churches.length||
     staff.churches.some(church=>!['M+','SHiNE','台灣基督教社會關懷協會'].includes(church))){
    throw new Error('無法確認教會同工權限，請聯絡系統管理者。');
  }
  return staff;
}
export function signOut(){
  location.replace('../admin-dashboard.html');
}

export async function staffLineIdToken(){
  const session=await db.auth.getSession();
  if(session.data.session?.access_token)return session.data.session.access_token;
  await initialize();
  if(!window.liff.isLoggedIn())throw new Error('請先使用已獲授權的 LINE 帳號登入。');
  const token=window.liff.getIDToken();
  if(!token)throw new Error('LINE 登入資訊已失效，請重新登入。');
  return token;
}
