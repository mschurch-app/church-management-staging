let installPrompt=null;
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent);
export async function registerChurchApp(){if('serviceWorker'in navigator)try{await navigator.serviceWorker.register('/church-os-sw.js',{scope:'/'});}catch{} }
export function wireInstallButton(button,status){if(!button)return;if(isStandalone){button.textContent='已安裝在手機';button.disabled=true;return;}button.hidden=false;button.onclick=async()=>{if(installPrompt){installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice.outcome==='accepted'){button.textContent='安裝完成';button.disabled=true;}return;}status.textContent=isIos?'請按 Safari 下方「分享」，再選擇「加入主畫面」。':'請開啟瀏覽器選單，選擇「安裝應用程式」或「加入主畫面」。';};window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});}
registerChurchApp();
