import {db} from './admin-db.mjs';
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
const time=value=>new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(value));
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
 const {data,error}=await db.rpc('list_my_app_notifications',{p_limit:30});if(error||!Array.isArray(data)){area.replaceChildren(el('p','通知中心暫時無法載入。','muted'));return;}
 const unreadItems=data.filter(item=>!item.read_at),unread=unreadItems.length;badge.textContent=unread?unread+' 則未讀':'沒有未讀';const drawer=area.closest('details');if(drawer)drawer.open=Boolean(unread);area.replaceChildren();
 if(!unread){area.append(el('p','目前沒有未讀通知。','muted'));return;}
 for(const item of unreadItems){
  const a=el('a','','app-notification unread');a.href=item.target_url;
  const copy=el('div','','app-notification-copy'),report=item.event_key==='line_group_summary'?renderDailyReport(item.body):null;
  const heading=el('div','','app-notification-heading');
  heading.append(el('strong',item.title));
  heading.append(el('span','未讀','app-notification-unread-badge'));
  copy.append(heading);
  copy.append(report||el('p',item.body,'app-notification-body'));
  copy.append(el('time',time(item.created_at)));
  a.append(copy);a.onclick=async event=>{event.preventDefault();await db.rpc('mark_app_notification_read',{p_id:item.id});location.assign(a.href);};area.append(a);
 }
}
export async function createTestNotification(church){const result=await db.rpc('create_my_test_notification',{p_church:church});if(result.error)throw new Error('測試通知未建立。');return result.data;}
