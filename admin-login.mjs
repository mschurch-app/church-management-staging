import {db} from './admin-db.mjs';
import {readAccess,canOpen} from './admin-access.mjs';
const form=document.querySelector('#form'),status=document.querySelector('#status'),button=document.querySelector('#submit');
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;status.textContent='正在確認登入…';
 try{
  const {error}=await db.auth.signInWithPassword({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value});
  if(error)throw new Error('登入失敗，請確認測試帳號與密碼。');
  const access=await readAccess(db),church=access.churches.find(c=>canOpen(access,c,'members'));
  if(!church)throw new Error('帳號尚未取得會員審核權限。');
  location.replace('members.html?church='+encodeURIComponent(church));
 }catch(error){await db.auth.signOut();status.textContent=error.message||'暫時無法登入，請稍後再試。';}
 finally{document.querySelector('#password').value='';button.disabled=false;}
});
