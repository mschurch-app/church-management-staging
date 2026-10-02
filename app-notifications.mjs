import {db} from './admin-db.mjs';
const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;node.className=cls;return node;};
const time=value=>new Intl.DateTimeFormat('zh-TW',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Taipei'}).format(new Date(value));
export async function loadNotificationCenter(area,badge){
 const {data,error}=await db.rpc('list_my_app_notifications',{p_limit:30});if(error||!Array.isArray(data)){area.replaceChildren(el('p','通知中心暫時無法載入。','muted'));return;}
 const unread=data.filter(item=>!item.read_at).length;badge.textContent=unread?unread+' 則未讀':'全部已讀';const drawer=area.closest('details');if(drawer&&unread)drawer.open=true;area.replaceChildren();
 if(!data.length){area.append(el('p','目前還沒有系統通知。','muted'));return;}
 for(const item of data){const a=el('a','',`app-notification${item.read_at?'':' unread'}`);a.href=item.target_url;const copy=el('span');copy.append(el('strong',item.title),el('small',item.body),el('time',time(item.created_at)));a.append(copy);a.onclick=()=>db.rpc('mark_app_notification_read',{p_id:item.id});area.append(a);}
}
export async function createTestNotification(church){const result=await db.rpc('create_my_test_notification',{p_church:church});if(result.error)throw new Error('測試通知未建立。');return result.data;}
