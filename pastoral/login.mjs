import {authenticateStaff, loginConfigured} from './auth.mjs?v=20260924-5';
const button=document.querySelector('#line-login');
const status=document.querySelector('#login-status');
const codeInput=document.querySelector('#enrollment-code');
const CODE_KEY='pastoral-enrollment-code';
const savedCode=sessionStorage.getItem(CODE_KEY);
if(savedCode&&codeInput)codeInput.value=savedCode;
button.disabled=!loginConfigured();
status.textContent=button.disabled?'教會同工專用 LINE 入口尚在設定中，完成後將另行提供啟用通知。':'若收到同工邀請碼，先填入後使用 LINE 登錄身分；已核准同工可直接登入。';

async function login(interactive){
  const enrollmentCode=(codeInput?.value||sessionStorage.getItem(CODE_KEY)||'').trim().toUpperCase();
  if(interactive&&enrollmentCode)sessionStorage.setItem(CODE_KEY,enrollmentCode);
  button.disabled=true;
  status.textContent='正在確認 LINE 身分與教會同工權限…';
  try{
    await authenticateStaff({interactive,enrollmentCode});
    sessionStorage.removeItem(CODE_KEY);
    location.replace(new URL('workspace.html',location.href).href);
  }catch(error){
    if(error.code==='identity_recorded'){
      sessionStorage.removeItem(CODE_KEY);
      if(codeInput){codeInput.value='';codeInput.disabled=true;}
      button.disabled=true;
    }else{
      if(error.code==='invite_invalid')sessionStorage.removeItem(CODE_KEY);
      button.disabled=!loginConfigured();
    }
    status.textContent=error.message;
  }
}
button.addEventListener('click',()=>login(true));
if(loginConfigured())login(false);
