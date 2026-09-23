import {db} from './admin-db.mjs';
import {readAccess,chooseChurch} from './admin-access.mjs?v=20260923-authfix1';
const form=document.querySelector('#form'),status=document.querySelector('#status'),button=document.querySelector('#submit');
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;status.textContent='正在確認登入…';
 let signedIn=false;
 try{
  const {data,error}=await db.auth.signInWithPassword({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value});
  if(error)throw new Error('登入失敗，請確認帳號與密碼。');
  if(!data?.session||!data?.user)throw new Error('登入狀態尚未建立，請再試一次。');
  signedIn=true;status.textContent='密碼已驗證，正在載入管理權限…';
  const access=await readAccess(db,{user:data.user,retry:true}),church=chooseChurch(access);
  location.replace('admin-dashboard.html?church='+encodeURIComponent(church));
 }catch(error){if(!signedIn)await db.auth.signOut({scope:'local'});status.textContent=error.message||'暫時無法登入，請稍後再試。';}
 finally{document.querySelector('#password').value='';button.disabled=false;}
});
