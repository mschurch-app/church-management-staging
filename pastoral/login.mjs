import {authenticateStaff, loginConfigured} from './auth.mjs';
const button = document.querySelector('#line-login'), status = document.querySelector('#login-status');
button.disabled = !loginConfigured();
status.textContent = button.disabled ? '幕僚專用 LINE 入口尚在設定中，完成後將另行提供啟用通知。' : '使用教會既有 LINE 登入，進入專屬幕僚空間。';
async function login(interactive) {
  button.disabled = true;
  status.textContent = '正在確認 LINE 身分與幕僚權限…';
  try {
    await authenticateStaff({interactive});
    location.replace(new URL('workspace.html', location.href).href);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = !loginConfigured();
  }
}
button.addEventListener('click', () => login(true));
if (loginConfigured()) login(false);
