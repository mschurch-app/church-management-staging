import {DEFAULTS,upsertAccount,notificationPreferences} from './personal-mail-assistant-core.mjs?v=20261106-mail-preview1';
// Intentional isolated preview: no fetch, OAuth redirect, storage, password input or push.
const principal={id:'preview-staff',isActive:true};
let accounts=[],step=1,counter=0,time=DEFAULTS.time,consent=false,skipped=false,appleHelp=false;
const panel=document.querySelector('#mail-workspace'),status=document.querySelector('#mail-status');
function el(tag,text='',className=''){const node=document.createElement(tag);node.textContent=text;node.className=className;return node;}
function announce(message,tone='neutral'){status.textContent=message;status.dataset.tone=tone;}
function button(label,handler,kind='secondary'){const node=el('button',label,kind);node.type='button';node.addEventListener('click',handler);return node;}
function go(value){step=value;appleHelp=false;announce('');render();panel.querySelector('h2').focus();}
function add(provider){counter++;accounts=upsertAccount(principal,accounts,{id:'preview-'+counter,ownerId:principal.id,provider,providerIdentity:provider+'-demo-'+counter,email:`coworker${counter}@example.invalid`,status:'connected'});appleHelp=false;skipped=false;render();panel.querySelector('h2').focus();announce('已加入一個示範信箱。這不是實際連線。');}
function renderAccounts(){const list=el('ul','','mail-accounts');for(const account of accounts){const item=el('li'),copy=el('div','','mail-account-copy');copy.append(el('strong',account.email),el('small',(account.provider==='gmail'?'Gmail':'iCloud Mail')+' · 示範帳號'));const remove=button('移除',()=>{accounts=accounts.filter(a=>a.id!==account.id);render();panel.querySelector('h2').focus();announce('已移除示範信箱，沒有更動任何實際帳號。');});remove.setAttribute('aria-label','移除示範信箱 '+account.email);item.append(copy,remove);list.append(item);}return list;}
function render(){
  panel.replaceChildren();document.querySelectorAll('#mail-steps li').forEach((node,i)=>{if(i+1===step)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
  const heading=el('h2',step===1?'先加入一個信箱就好':step===2?'每天一份，傳給你自己':'這就是你的個人郵件工作台');heading.id='mail-step-title';heading.tabIndex=-1;panel.append(heading);
  if(step===1){
    panel.append(el('p','可以加入多個自己的信箱。先從最常用的一個開始，之後隨時再加。','mail-copy'));
    if(accounts.length){panel.append(el('h3',`已加入 ${accounts.length} 個示範信箱`),renderAccounts(),el('p','還有其他信箱？繼續選擇下方服務；已經夠了，就前往下一步。','mail-copy'));}
    const grid=el('div','','mail-provider-grid');
    const gmail=button('',()=>add('gmail'),'provider');gmail.setAttribute('aria-label',accounts.length?'再加入一個 Gmail（示範）':'加入 Gmail（示範）');gmail.append(el('strong',accounts.length?'再加入一個 Gmail（示範）':'加入 Gmail（示範）'),el('span','正式版由 Google 登入，系統只要求讀取郵件。'));
    const apple=button('',()=>{appleHelp=!appleHelp;render();(panel.querySelector('.mail-note h3')||panel.querySelector('h2')).setAttribute('tabindex','-1');(panel.querySelector('.mail-note h3')||panel.querySelector('h2')).focus();},'provider');apple.append(el('strong','加入 iCloud Mail（示範）'),el('span','一步一步引導，使用 Apple 支援的授權方式。'));apple.setAttribute('aria-label','加入 iCloud Mail（示範）');grid.append(gmail,apple);panel.append(grid);
    if(appleHelp){const note=el('section','','mail-note');note.append(el('h3','iCloud 會另外帶你完成授權'),el('p','採 App 專用密碼時，會先引導你到 Apple 帳號建立，再回到安全頁面連接。不要提供 Apple 帳號的主要密碼。'),el('p','這個預覽不收取任何密碼，也沒有連線到 Apple。'),button('加入 iCloud 示範帳號',()=>add('icloud')));panel.append(note);}
    const actions=el('div','','mail-actions'),next=button('下一步：確認通知',()=>go(2),'primary');next.disabled=!accounts.length;
    actions.append(next,button('稍後再連接',()=>{skipped=true;go(3);}));panel.append(actions);
  }else if(step===2){
    panel.append(el('p',`已選擇 ${accounts.length} 個示範信箱，整合成一份摘要，不會每個信箱各發一則。`,'mail-copy'));
    const note=el('div','','mail-note');note.append(el('h3','LINE 個人通知'),el('p',`每天 ${time}（台灣時間）`),el('p','正式版將確認你在教會 OS 綁定的個人 LINE；不發送至群組，也不發送給管理員。'));panel.append(note);
    const label=el('label','','mail-check'),check=document.createElement('input');check.type='checkbox';check.checked=consent;check.id='mail-consent';label.append(check,el('span','我已了解：正式啟用前，需確認信箱授權、AI 分析說明與個人 LINE。此處僅預覽，不會啟用通知。'));panel.append(label);
    const details=el('details');details.append(el('summary','調整時間（選填）'));const timeLabel=el('label','每日摘要時間'),input=document.createElement('input');input.type='time';input.value=time;input.id='mail-time';timeLabel.htmlFor=input.id;input.addEventListener('change',()=>{try{time=notificationPreferences({time:input.value}).time;announce('預覽時間已改為 '+time+'，尚未儲存排程。');}catch{input.value=time;announce('請選擇有效時間。','error');}});timeLabel.append(input);details.append(timeLabel);panel.append(details);
    const actions=el('div','','mail-actions'),next=button('查看摘要示範',()=>go(3),'primary');next.disabled=!consent;check.addEventListener('change',()=>{consent=check.checked;next.disabled=!consent;});actions.append(button('返回信箱',()=>go(1)),next);panel.append(actions);
  }else{
    panel.append(el('p',skipped?'可以稍後回來新增信箱。現在沒有啟用任何郵件分析或 LINE 通知。':'以下是虛構內容，展示多信箱合併後的樣子；不是你的真實郵件。','mail-copy'));
    const grid=el('div','','mail-summary-grid'),summary=el('section','','mail-summary-box'),settings=el('section','','mail-summary-box');
    summary.append(el('span','示範內容 · 尚未讀取郵件','mail-badge'),el('h3','今日重要事項'));
    if(skipped){summary.append(el('p','尚未啟用。完成授權後才會產生你的摘要。'));}
    else{summary.append(el('p','活動場地回覆待確認（示例）'),el('p','來源信箱：'+accounts[0].email),el('p','建議行動：確認時間後，由本人決定是否回覆。'),el('p','分類：重要待辦／教會／協會／個人／系統警示'));}
    settings.append(el('h3','我的信箱與通知'),el('p',`${accounts.length} 個示範信箱 · 一份個人摘要`),el('p',`偏好時間：${time} · Asia/Taipei`),el('p','實際推播狀態：未啟用'),el('p','一般廣告排除；遇到連線失敗會註明，不會說成沒有重要郵件。'));
    grid.append(summary,settings);panel.append(grid);const actions=el('div','','mail-actions');actions.append(button('繼續新增信箱',()=>go(1),'primary'),button('重新開始預覽',()=>{accounts=[];counter=0;consent=false;skipped=false;time=DEFAULTS.time;go(1);}));panel.append(actions);
  }
}
render();
