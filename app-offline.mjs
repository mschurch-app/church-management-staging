const retry=document.querySelector('#retry'),status=document.querySelector('#connection'),home=document.querySelector('#home');
const church=new URLSearchParams(location.search).get('church');if(['M+','SHiNE'].includes(church))home.href='/admin-dashboard.html?church='+encodeURIComponent(church);
if(/(?:callback|login|password-reset|auth-handoff)/.test(location.pathname)){home.href='/admin-login-v2.html';home.textContent='返回登入頁';}
function connection(){status.textContent=navigator.onLine===false?'目前沒有網路連線。連線恢復後再試。':'請按「重新開啟」，再次載入原頁面。';retry.disabled=false;}
retry.onclick=()=>{if(navigator.onLine===false){connection();return;}retry.disabled=true;status.textContent='正在重新開啟…';location.reload();};
window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
