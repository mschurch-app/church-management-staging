import {createAppIcon} from './app-icons.mjs?v=20261019-workflow1';
export const MPLUS_CENTERS={
church:{title:'教會',cards:[['會友與關懷',[['會友','members'],['新朋友','newcomer_care'],['代禱與關懷','private_prayers'],['關懷訊息','pastoral_chats']]],['小組與聚會',[['小組安排','groups'],['聚會出席','attendance'],['小組教材','website_group_resources']]],['信息與靈修',[['信息預備','sermon_preparation'],['生命樹與靈修','tree_reading_admin']]]]},
school:{title:'課輔',cards:[['課輔日常',[['課程與老師安排','school_schedules'],['課輔打卡','school_checkin'],['學生點名','school_rollcall']]],['學生與輔導',[['學生資料','school_students'],['個別輔導','school_counseling']]],['統計與報表',[['出席統計與列印','school_reports']]]]},
admin:{title:'行政',cards:[['場地與物品',[['場地預約','spaces'],['設備與物品借還','inventory']]],['同工行政',[['出勤紀錄','pastoral_workspace','pastoral/coworker-tools.html?tab=attendance#attendance-list'],['請假簽核','pastoral_workspace','pastoral/coworker-tools.html?tab=attendance#leave-list']]],['活動與其他',[['籃球營報名','heat_camp']]]]},
service:{title:'服事',cards:[['服事安排',[['主日服事總排','schedules']]],['調查與協調',[['意願自排','service_signups','service-signup.html?from=app'],['換班協調','service_signups','service-signup-admin.html#changePanel']]],['服事表輸出',[['列印服事表','schedules','schedules.html#export-title'],['發送服事表','schedules','schedules.html#export-title']]]]},
website:{title:'網站',cards:[['網站上稿',[['教會網站與週報','website_weekly'],['協會網站最新消息','association_news']]],['內容與發布',[['社群發布','media_publishing'],['牧養圖卡','pastoral_content'],['給今天的你','todays_message'],['把愛傳出去','love_share']]],['共用素材',[['照片資料庫','pastoral_workspace','pastoral/coworker-tools.html?tab=photos'],['字幕詞庫','subtitle_library']]]]}
};
export function visibleCenters(allowed){return Object.fromEntries(Object.entries(MPLUS_CENTERS).map(([key,center])=>[key,{...center,cards:center.cards.map(([title,links])=>[title,links.filter(([,permission])=>allowed.has(permission))]).filter(([,links])=>links.length)}]));}
export function mountMplusNavigation({allowed,hrefFor,openSchool}){
 const centers=visibleCenters(new Set(allowed)),main=document.querySelector('main'),oldNav=document.querySelector('.mobile-app-nav');
 document.body.classList.add('mplus-navigation');
 const style=document.createElement('link');style.rel='stylesheet';style.href='mplus-navigation.css?v=20261020-shell2';document.head.append(style);
 const panel=document.createElement('section');panel.className='mplus-center';panel.hidden=true;main.append(panel);
 const top=document.createElement('nav');top.className='mplus-top';top.setAttribute('aria-label','M+ 首頁與系統');
 const home=document.createElement('button');home.textContent='首頁';home.dataset.appControl='navigation';home.onclick=()=>show('home');top.append(home);
 const notice=document.createElement('button');notice.textContent='通知';notice.dataset.appControl='navigation';notice.onclick=()=>{show('home');document.querySelector('#notification-history')?.click();};top.append(notice);
 if(allowed.includes('church_settings')){const a=document.createElement('a');a.textContent='系統管理';a.href=hrefFor('church_settings');top.append(a);}
 main.querySelector('.page-header').after(top);const work=document.createElement('a');work.textContent='本週工作與協作';work.href='pastoral/workspace.html?church=M%2B&tab=tasks';work.className='mplus-work-entry';top.after(work);
 const dock=document.createElement('nav');dock.className='mobile-app-nav mplus-dock';dock.setAttribute('aria-label','M+ 五大入口');
 const icons={church:'people',school:'book',admin:'box',service:'calendar',website:'globe'};
 for(const [key,center]of Object.entries(centers)){const b=document.createElement('button');b.type='button';b.dataset.appControl='navigation';b.dataset.center=key;b.append(createAppIcon(icons[key],'mplus-icon module-bar-icon'),document.createTextNode(center.title));b.onclick=()=>show(key);dock.append(b);}
 oldNav.replaceWith(dock);
 const homeNodes=[...main.children].filter(n=>![panel,top].includes(n)&&!n.matches('.page-header,#churches,#status'));
 function show(key){for(const n of homeNodes){if(!n.dataset.mplusOriginalHidden)n.dataset.mplusOriginalHidden=String(n.hidden);n.hidden=key!=='home'||n.dataset.mplusOriginalHidden==='true';}panel.hidden=key==='home';dock.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.center===key?'page':'false'));home.classList.toggle('active',key==='home');if(key==='home'){window.scrollTo(0,0);return;}panel.replaceChildren();const center=centers[key];const h=document.createElement('h2');h.textContent=center.title;panel.append(h);for(const [title,links]of center.cards){const card=document.createElement('section');card.className='mplus-center-card';const heading=document.createElement('h3');heading.textContent=title;card.append(heading);for(const [label,permission,file]of links){const a=document.createElement('a');a.textContent=label+' ›';a.href=hrefFor(permission,file);if(permission.startsWith('school'))a.onclick=e=>openSchool(e,a.href);card.append(a);}panel.append(card);}if(!center.cards.length){const note=document.createElement('p');note.textContent='你目前沒有此區的功能權限，請聯繫管理同工。';panel.append(note);}if(key==='admin'){const note=document.createElement('p');note.className='muted';note.textContent='行政表單：目前尚未建立可用表單，待設定後開放。籃球隊維持獨立 App。';panel.append(note);}window.scrollTo(0,0);}
 show('home');
}
