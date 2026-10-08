let installPrompt=null;
import {db} from './admin-db.mjs?v=20261008-ios5';
import {VAPID_PUBLIC_KEY} from './app-push-config.mjs';
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent);
export async function registerChurchApp(){if('serviceWorker'in navigator)try{const registration=await navigator.serviceWorker.register('/church-os-sw.js?v=20261007-login1',{scope:'/',updateViaCache:'none'});setTimeout(()=>registration.update().catch(()=>{}),1500);}catch{} }
const applicationServerKey=value=>{const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));};
async function connectPush(){const registration=await navigator.serviceWorker.ready;let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(VAPID_PUBLIC_KEY)});const {data,error}=await db.functions.invoke('app-push',{body:{action:'subscribe',subscription:subscription.toJSON(),user_agent:navigator.userAgent}});if(error||!data?.ok)throw new Error('裝置登記失敗，請稍後再試。');return subscription;}
export function wireInstallButton(button,status){if(!button)return;if(isStandalone){button.textContent='已安裝在手機';button.disabled=true;return;}button.hidden=false;button.onclick=async()=>{if(installPrompt){installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice.outcome==='accepted'){button.textContent='安裝完成';button.disabled=true;}return;}status.textContent=isIos?'請按 Safari 下方「分享」，再選擇「加入主畫面」。':'請開啟瀏覽器選單，選擇「安裝應用程式」或「加入主畫面」。';};window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});}
export function wireNotificationButtons(enable,test,status){
 if(!enable||!test)return;
 const refresh=()=>{const granted='Notification'in window&&Notification.permission==='granted';enable.textContent=granted?'通知已開啟':'開啟通知';enable.disabled=granted;test.hidden=!granted;};
 enable.onclick=async()=>{if(!isStandalone&&isIos){status.textContent='iPhone 請先加入主畫面，再從桌面的「教會 OS」開啟通知。';return;}if(!('Notification'in window)||!('PushManager'in window)){status.textContent='這台裝置目前不支援背景推播。';return;}try{const permission=await Notification.requestPermission();if(permission==='granted'){await connectPush();status.textContent='背景通知已開啟，關閉教會 OS 後也能收到。';}else status.textContent='通知尚未允許；可到手機設定中開啟教會 OS 通知。';}catch(error){status.textContent=error.message;}refresh();};
 test.onclick=async()=>{try{await connectPush();status.textContent='正在傳送背景測試通知…';const {data,error}=await db.functions.invoke('app-push',{body:{action:'test'}});if(error||!data?.ok){if(data?.error==='push_not_configured')throw new Error('伺服器推播金鑰尚未完成設定。');throw new Error('測試通知傳送失敗，請稍後再試。');}status.textContent=`已傳送到 ${data.sent} 台已授權裝置，請查看手機通知中心。`;}catch(error){status.textContent=error.message;}};
 refresh();
}
registerChurchApp();
