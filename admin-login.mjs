import {db} from './admin-db.mjs?v=20261009-stage4';
import {readAccess,chooseChurch} from './admin-access.mjs?v=20261009-stage1';
const form=document.querySelector('#form'),status=document.querySelector('#status'),button=document.querySelector('#submit');
const requestedNext=new URLSearchParams(location.search).get('next');
const timeout=(promise,milliseconds,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),milliseconds))]);
function safeNext(){if(!requestedNext)return '';try{const target=new URL(requestedNext,location.origin);if(target.origin!==location.origin||target.pathname.includes('..')||!target.pathname.endsWith('.html'))return '';return target.pathname.replace(/^\//,'')+target.search+target.hash;}catch{return '';}}
window.adminLoginReady=true;
status.textContent='';
window.performAdminLogin=async()=>{
 button.textContent='正在登入，請稍候…';status.textContent='正在安全驗證帳號…';
 try{
  const {data,error}=await timeout(db.auth.signInWithPassword({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value}),15000,'登入連線逾時，請確認網路後再按一次。');
  if(error)throw new Error('登入失敗，請確認帳號與密碼。');
  if(!data?.session||!data?.user)throw new Error('登入狀態尚未建立，請再試一次。');
  button.textContent='登入成功，正在開啟首頁…';status.textContent='密碼已驗證，正在載入管理權限…';
  const access=await timeout(readAccess(db,{user:data.user,retry:true}),15000,'登入成功，但權限載入逾時。請再按一次登入。'),church=chooseChurch(access);
  status.textContent='權限確認完成，正在切換頁面…';
  location.replace(safeNext()||'admin-dashboard.html?church='+encodeURIComponent(church));
  return true;
 }catch(error){document.querySelector('#password').value='';throw error;}
};
