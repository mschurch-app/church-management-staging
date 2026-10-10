let installPrompt=null,registrationTask=null;
import {watchAppRegistration} from './app-runtime.mjs?v=20261009-stage4';
import {db} from './admin-db.mjs?v=20261009-stage4';
import {VAPID_PUBLIC_KEY} from './app-push-config.mjs';
const isStandalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent);
export async function registerChurchApp(){if(!('serviceWorker'in navigator))return;if(!registrationTask)registrationTask=navigator.serviceWorker.register('/church-os-sw.js?v=20261010-promo-cleanup1',{scope:'/',updateViaCache:'none'}).then(registration=>{watchAppRegistration(registration);setTimeout(()=>registration.update().catch(()=>{}),1500);return registration;}).catch(()=>{registrationTask=null;return null;});return registrationTask;}
const applicationServerKey=value=>{const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));};
let pushConnection=null;
async function connectPush(){
 if(pushConnection)return pushConnection;
 let timer;
 const operation=(async()=>{const registered=await registerChurchApp();if(!registered)throw new Error('通知服務尚未載入，請重新開啟 App。');const registration=await navigator.serviceWorker.ready;let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(VAPID_PUBLIC_KEY)});const {data,error}=await db.functions.invoke('app-push',{body:{action:'subscribe',subscription:subscription.toJSON(),user_agent:navigator.userAgent}});if(error||!data?.ok)throw new Error('裝置登記失敗，請稍後再試。');return subscription;})();
 pushConnection=Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('通知裝置連線逾時，請按「重新連接通知」。')),20000);})]);
 try{return await pushConnection;}finally{clearTimeout(timer);pushConnection=null;}
}
export function wireInstallButton(button,status){if(!button)return;if(isStandalone){button.textContent='已安裝在手機';button.disabled=true;return;}button.hidden=false;button.onclick=async()=>{if(installPrompt){installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice.outcome==='accepted'){button.textContent='安裝完成';button.disabled=true;}return;}status.textContent=isIos?'請按 Safari 下方「分享」，再選擇「加入主畫面」。':'請開啟瀏覽器選單，選擇「安裝應用程式」或「加入主畫面」。';};window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});}
export function wireNotificationButtons(enable,test,status){
 if(!enable||!test)return;
 let busy=false;
 const refresh=()=>{const granted='Notification'in window&&Notification.permission==='granted';enable.textContent=busy?'正在連接…':granted?'重新連接通知':'開啟通知';enable.disabled=busy;test.disabled=busy;test.hidden=!granted;};
 enable.onclick=async()=>{if(busy)return;if(!isStandalone&&isIos){status.textContent='iPhone 請先加入主畫面，再從桌面的「教會 OS」開啟通知。';return;}if(!('Notification'in window)||!('PushManager'in window)){status.textContent='這台裝置目前不支援背景推播。';return;}busy=true;refresh();try{const permission=await Notification.requestPermission();if(permission==='granted'){await connectPush();status.textContent='通知裝置已連接，可按「發送測試通知」確認手機是否顯示。';}else status.textContent='通知尚未允許；可到手機設定中開啟教會 OS 通知。';}catch(error){status.textContent=error.message;}finally{busy=false;refresh();}};
 test.onclick=async()=>{if(busy)return;busy=true;refresh();try{await connectPush();status.textContent='正在傳送背景測試通知…';const {data,error}=await db.functions.invoke('app-push',{body:{action:'test'}});if(error||!data?.ok){if(data?.error==='push_not_configured')throw new Error('伺服器推播金鑰尚未完成設定。');throw new Error('測試通知傳送失敗，請稍後再試。');}status.textContent=`推播服務已接受 ${data.sent} 台裝置的測試通知，請查看手機通知中心；尚未確認手機是否顯示。`;}catch(error){status.textContent=error.message;}finally{busy=false;refresh();}};
 refresh();
 // Refresh an already-authorized device after account changes; no new permission prompt.
 if('Notification'in window&&Notification.permission==='granted'&&'PushManager'in window&&(!isIos||isStandalone)){
  busy=true;refresh();void connectPush().catch(error=>{status.textContent=error.message;}).finally(()=>{busy=false;refresh();});
 }
}
registerChurchApp();
