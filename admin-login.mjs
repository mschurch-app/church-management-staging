import {db} from './admin-db.mjs';
import {readAccess,chooseChurch} from './admin-access.mjs?v=20260923-profile1';
const form=document.querySelector('#form'),status=document.querySelector('#status'),button=document.querySelector('#submit');
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;status.textContent='正在確認登入…';
 try{
  const {error}=await db.auth.signInWithPassword({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value});
  if(error)throw new Error('登入失敗，請確認帳號與密碼。');
  const access=await readAccess(db),church=chooseChurch(access);
  location.replace('admin-dashboard.html?church='+encodeURIComponent(church));
 }catch(error){await db.auth.signOut();status.textContent=error.message||'暫時無法登入，請稍後再試。';}
 finally{document.querySelector('#password').value='';button.disabled=false;}
});
