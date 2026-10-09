import {db} from './admin-db.mjs?v=20261009-stage2';
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
const time=value=>new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(value));
let tickerTimer=0,tickerResetTimer=0,pageScrollY=0,pageLocked=false;
function lockPage(){if(pageLocked)return;pageLocked=true;pageScrollY=window.scrollY;document.documentElement.classList.add('notification-modal-open');document.body.classList.add('notification-modal-open');document.body.style.top=`-${pageScrollY}px`;}
function unlockPageWhenClear(){requestAnimationFrame(()=>{if(document.querySelector('dialog.notification-modal[open]'))return;document.documentElement.classList.remove('notification-modal-open');document.body.classList.remove('notification-modal-open');document.body.style.removeProperty('top');if(pageLocked)window.scrollTo(0,pageScrollY);pageLocked=false;});}
function showModal(dialog){lockPage();dialog.showModal();}
const reportHeading=/【\s*今日討論摘要\s*】|[一二三四五][、．.]\s*(?:重點事項|已決定事項|待辦事項(?:（[^）]*）)?|需要追蹤|重要日期與提醒)/g;
const reportLabel=heading=>{
 if(heading.includes('重點事項'))return '重點事項';
 if(heading.includes('已決定事項'))return '已決定事項';
 if(heading.includes('待辦事項'))return '待辦事項';
 if(heading.includes('需要追蹤'))return '需要追蹤';
 if(heading.includes('重要日期'))return '重要日期與提醒';
 return '今日討論摘要';
};
function reportItems(value){
 return String(value||'').replace(/^\s*[－–—•●▪*-]\s*/,'').split(/(?:\r?\n)+|\s+[－–—]\s+|\s+[•●▪]\s+|\s+-\s+/).map(item=>item.replace(/^\s*[－–—•●▪*-]\s*/,'').trim()).filter(Boolean);
}
function renderDailyReport(value){
 const text=String(value||'').replace(/\r\n?/g,'\n').replace(/^【M\+\s*青年教會群組日報[^】]*】\s*/,'').trim();
 const matches=[...text.matchAll(reportHeading)];
 if(!matches.length)return null;
 const wrap=el('div','','app-notification-report');
 for(let index=0;index<matches.length;index+=1){
  const heading=matches[index][0],start=(matches[index].index||0)+heading.length,end=matches[index+1]?.index??text.length;
  const items=reportItems(text.slice(start,end));
  if(!items.length&&reportLabel(heading)==='今日討論摘要')continue;
  const section=el('section','','app-notification-section');
  section.append(el('h4',reportLabel(heading)));
  if(items.length){const list=el('ul');for(const item of items)list.append(el('li',item));section.append(list);}else section.append(el('p','無'));
  wrap.append(section);
 }
 return wrap.childElementCount?wrap:null;
}
let notificationDialog,notificationHistoryDialog;
function ensureNotificationDialog(){
 if(notificationDialog)return notificationDialog;
 const dialog=el('dialog','','notification-detail-dialog notification-modal');dialog.setAttribute('aria-labelledby','notification-detail-title');
 const shell=el('div','','notification-detail-shell');
 const header=el('header','','notification-detail-header');
 const heading=el('div','','notification-detail-heading'),title=el('h2','','notification-detail-title');title.id='notification-detail-title';heading.append(el('p','最新通知','eyebrow'),title,el('time','','notification-detail-time'));
 const close=el('button','×','notification-detail-close');close.type='button';close.setAttribute('aria-label','關閉通知');
 header.append(heading,close);
 const content=el('div','','notification-detail-content');
 const status=el('p','','notification-detail-status');status.setAttribute('role','status');
 const actions=el('footer','','notification-detail-actions');
 const dismiss=el('button','關閉','secondary notification-detail-dismiss');dismiss.type='button';
 const open=el('a','前往相關頁面','notification-detail-open');
 actions.append(dismiss,open);shell.append(header,content,status,actions);dialog.append(shell);document.body.append(dialog);
 close.onclick=()=>dialog.close();dismiss.onclick=()=>dialog.close();dialog.addEventListener('close',unlockPageWhenClear);
 notificationDialog={dialog,title:heading.querySelector('h2'),time:heading.querySelector('time'),content,status,close,open};
 return notificationDialog;
}
function ensureNotificationHistoryDialog(){
 if(notificationHistoryDialog)return notificationHistoryDialog;
 const dialog=el('dialog','','notification-history-dialog notification-modal');dialog.setAttribute('aria-labelledby','notification-history-title');
 const shell=el('div','','notification-history-shell'),header=el('header','','notification-detail-header'),heading=el('div','','notification-detail-heading'),title=el('h2','通知中心','notification-detail-title');title.id='notification-history-title';
 const summary=el('p','','notification-history-summary'),close=el('button','×','notification-detail-close');close.type='button';close.setAttribute('aria-label','關閉通知中心');heading.append(el('p','所有訊息','eyebrow'),title,summary);header.append(heading,close);
 const list=el('div','','notification-history-list'),footer=el('footer','','notification-detail-actions'),dismiss=el('button','關閉','secondary notification-detail-dismiss');dismiss.type='button';footer.append(dismiss);shell.append(header,list,footer);dialog.append(shell);document.body.append(dialog);
 close.onclick=()=>dialog.close();dismiss.onclick=()=>dialog.close();dialog.addEventListener('close',unlockPageWhenClear);
 notificationHistoryDialog={dialog,summary,list,close};return notificationHistoryDialog;
}
function showNotificationHistory(items,{area,badge,bell,updateBadge}={}){
 const modal=ensureNotificationHistoryDialog(),unread=items.filter(item=>!item.read_at).length;modal.summary.textContent=unread?`${unread} 則未讀・共 ${items.length} 則`:`全部已讀・共 ${items.length} 則`;modal.list.replaceChildren();
 if(!items.length)modal.list.append(el('p','目前沒有通知。','muted notification-history-empty'));
 for(const item of items){const button=el('button','','notification-history-item '+(item.read_at?'is-read':'is-unread')),copy=el('span','','notification-history-copy'),head=el('span','','notification-history-heading');button.type='button';head.append(el('strong',item.title||'通知'),el('small',item.read_at?'已讀':'未讀','notification-history-state'));copy.append(head,el('span',String(item.body||'').replace(/\s+/g,' ').trim()||'這則通知沒有附加內容。','notification-history-body'),el('time',time(item.created_at)));button.append(copy,el('b','›','notification-history-arrow'));button.onclick=()=>{modal.dialog.close();setTimeout(()=>showNotificationDetail(item,{onMarked:item.read_at?undefined:updateBadge,onClose:()=>loadNotificationCenter(area,badge,bell)}),0);};modal.list.append(button);}
 showModal(modal.dialog);setTimeout(()=>modal.close.focus(),0);
}
function showNotificationDetail(item,{onMarked,onClose}={}){
 const modal=ensureNotificationDialog();
 modal.title.textContent=item.title||'通知';modal.time.textContent=time(item.created_at);modal.time.dateTime=item.created_at||'';
 const report=item.event_key==='line_group_summary'?renderDailyReport(item.body):null;
 modal.content.replaceChildren(report||el('p',item.body||'這則通知沒有附加內容。','notification-detail-body'));
 const destination=String(item.target_url||'').trim();modal.open.hidden=!destination;modal.open.removeAttribute('href');if(destination)modal.open.href=destination;
 modal.status.textContent='正在更新未讀狀態…';
 let markedNotified=false;
 const markPromise=db.rpc('mark_app_notification_read',{p_id:item.id}).then(result=>{
  if(result.error)throw result.error;
  modal.status.textContent='已標示為已讀';
  if(!markedNotified){markedNotified=true;onMarked?.();}
  return true;
 }).catch(()=>{modal.status.textContent='暫時無法更新已讀狀態，關閉後仍可再次開啟。';return false;});
 modal.open.onclick=async event=>{event.preventDefault();await Promise.race([markPromise,new Promise(resolve=>setTimeout(resolve,500))]);location.assign(destination);};
 modal.dialog.addEventListener('close',async()=>{await markPromise;onClose?.();},{once:true});
 showModal(modal.dialog);setTimeout(()=>modal.close.focus(),0);
}
export async function loadNotificationCenter(area,badge,bell){
 const {data,error}=await db.rpc('list_my_app_notifications',{p_limit:30});if(error||!Array.isArray(data)){area.replaceChildren(el('p','最新通知暫時無法載入。','muted'));return;}
 clearInterval(tickerTimer);clearTimeout(tickerResetTimer);tickerTimer=0;tickerResetTimer=0;
 const unreadItems=data.filter(item=>!item.read_at);let unread=unreadItems.length;const updateBadge=()=>{badge.textContent=String(unread);badge.hidden=!unread;badge.setAttribute('aria-label',unread?`${unread} 則未讀通知`:'沒有未讀通知');};updateBadge();area.replaceChildren();area.classList.add('is-ticker');
 if(bell){bell.disabled=false;bell.onclick=()=>showNotificationHistory(data,{area,badge,bell,updateBadge:()=>{unread=Math.max(0,unread-1);updateBadge();}});}
 if(!unread){area.append(el('p','目前沒有未讀通知。','muted'));return;}
 const track=el('div','','notification-ticker-track');area.append(track);
 for(const item of unreadItems){
  const card=el('a','','notification-ticker-item');card.href=item.target_url||'#';card.dataset.notificationId=String(item.id);card.setAttribute('aria-label',`${item.title}。${item.body||''}`);
  const copy=el('span','','notification-ticker-copy');copy.append(el('strong',item.title),el('span',String(item.body||'').replace(/\s+/g,' ').trim(),'notification-ticker-body'));
  card.append(copy,el('time',time(item.created_at)),el('b','›','notification-ticker-arrow'));
  card.onclick=event=>{event.preventDefault();clearInterval(tickerTimer);tickerTimer=0;showNotificationDetail(item,{onMarked:()=>{unread=Math.max(0,unread-1);updateBadge();},onClose:()=>loadNotificationCenter(area,badge,bell)});};
  track.append(card);
 }
 const cards=[...track.children];let active=0;cards[0].classList.add('is-active');cards.forEach((card,index)=>card.setAttribute('aria-hidden',index?'true':'false'));
 if(cards.length>1)tickerTimer=setInterval(()=>{const current=cards[active],nextIndex=(active+1)%cards.length,next=cards[nextIndex];current.classList.remove('is-active');current.classList.add('is-leaving');current.setAttribute('aria-hidden','true');next.classList.add('is-active');next.setAttribute('aria-hidden','false');tickerResetTimer=setTimeout(()=>current.classList.remove('is-leaving'),720);active=nextIndex;},3000);
}
export async function createTestNotification(church){const result=await db.rpc('create_my_test_notification',{p_church:church});if(result.error)throw new Error('測試通知未建立。');return result.data;}
