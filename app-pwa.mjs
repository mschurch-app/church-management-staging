let installPrompt=null;
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent);
export async function registerChurchApp(){if('serviceWorker'in navigator)try{await navigator.serviceWorker.register('/church-os-sw.js',{scope:'/'});}catch{} }
export function wireInstallButton(button,status){if(!button)return;if(isStandalone){button.textContent='已安裝在手機';button.disabled=true;return;}button.hidden=false;button.onclick=async()=>{if(installPrompt){installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice.outcome==='accepted'){button.textContent='安裝完成';button.disabled=true;}return;}status.textContent=isIos?'請按 Safari 下方「分享」，再選擇「加入主畫面」。':'請開啟瀏覽器選單，選擇「安裝應用程式」或「加入主畫面」。';};window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});}
export function wireNotificationButtons(enable,test,status){
 if(!enable||!test)return;
 const refresh=()=>{const granted='Notification'in window&&Notification.permission==='granted';enable.textContent=granted?'通知已開啟':'開啟通知';enable.disabled=granted;test.hidden=!granted;};
 enable.onclick=async()=>{if(!isStandalone&&isIos){status.textContent='iPhone 請先加入主畫面，再從桌面的「教會 OS」開啟通知。';return;}if(!('Notification'in window)){status.textContent='這台裝置目前不支援網頁通知。';return;}const permission=await Notification.requestPermission();status.textContent=permission==='granted'?'通知已開啟，請按「發送測試通知」。':'通知尚未允許；可到手機設定中開啟教會 OS 通知。';refresh();};
 test.onclick=async()=>{const registration=await navigator.serviceWorker.ready;await registration.showNotification('教會 OS 通知測試',{body:'通知已經可以從教會 OS 顯示。下一步會接上新朋友、工作與服事提醒。',icon:'/assets/app/church-os-icon.svg',badge:'/assets/app/church-os-icon.svg',data:{url:'/admin-dashboard.html'}});status.textContent='測試通知已送出，請查看手機通知中心。';};
 refresh();
}
registerChurchApp();
