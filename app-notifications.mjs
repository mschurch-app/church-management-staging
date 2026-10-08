import {db} from './admin-db.mjs?v=20261008-ios6';
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
const time=value=>new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(value));
let tickerTimer=0,tickerResetTimer=0;
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
export async function loadNotificationCenter(area,badge){
 const {data,error}=await db.rpc('list_my_app_notifications',{p_limit:30});if(error||!Array.isArray(data)){area.replaceChildren(el('p','最新通知暫時無法載入。','muted'));return;}
 clearInterval(tickerTimer);clearTimeout(tickerResetTimer);tickerTimer=0;tickerResetTimer=0;
 const unreadItems=data.filter(item=>!item.read_at);let unread=unreadItems.length;const updateBadge=()=>{badge.textContent=String(unread);badge.hidden=!unread;badge.setAttribute('aria-label',unread?`${unread} 則未讀通知`:'沒有未讀通知');};updateBadge();area.replaceChildren();area.classList.add('is-ticker');
 if(!unread){area.append(el('p','目前沒有未讀通知。','muted'));return;}
 const track=el('div','','notification-ticker-track');area.append(track);
 for(const item of unreadItems){
  const card=el('a','','notification-ticker-item');card.href=item.target_url||'#';card.dataset.notificationId=String(item.id);card.setAttribute('aria-label',`${item.title}。${item.body||''}`);
  const copy=el('span','','notification-ticker-copy');copy.append(el('strong',item.title),el('span',String(item.body||'').replace(/\s+/g,' ').trim(),'notification-ticker-body'));
  card.append(copy,el('time',time(item.created_at)),el('b','›','notification-ticker-arrow'));
  card.onclick=async event=>{event.preventDefault();const destination=item.target_url||'';if(destination){try{await Promise.race([db.rpc('mark_app_notification_read',{p_id:item.id}),new Promise(resolve=>setTimeout(resolve,500))]);}catch{}location.assign(destination);return;}try{const result=await db.rpc('mark_app_notification_read',{p_id:item.id});if(result.error)throw result.error;await loadNotificationCenter(area,badge);}catch{}};
  track.append(card);
 }
 const cards=[...track.children];let active=0;cards[0].classList.add('is-active');cards.forEach((card,index)=>card.setAttribute('aria-hidden',index?'true':'false'));
 if(cards.length>1)tickerTimer=setInterval(()=>{const current=cards[active],nextIndex=(active+1)%cards.length,next=cards[nextIndex];current.classList.remove('is-active');current.classList.add('is-leaving');current.setAttribute('aria-hidden','true');next.classList.add('is-active');next.setAttribute('aria-hidden','false');tickerResetTimer=setTimeout(()=>current.classList.remove('is-leaving'),720);active=nextIndex;},3000);
}
export async function createTestNotification(church){const result=await db.rpc('create_my_test_notification',{p_church:church});if(result.error)throw new Error('測試通知未建立。');return result.data;}
