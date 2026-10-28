import {createAppIcon} from './app-icons.mjs?v=20261020-shell2';
export const CHURCH_ALBUM_URL='https://drive.google.com/drive/folders/0AObJt0sOLQz2Uk9PVA';
export const MPLUS_CENTERS={
church:{title:'教會',cards:[['會友與關懷',[['會友','members'],['新朋友','newcomer_care'],['代禱與關懷','private_prayers'],['關懷訊息','pastoral_chats']]],['小組與聚會',[['小組安排','groups'],['聚會出席','attendance'],['小組教材','website_group_resources']]],['信息與靈修',[['信息預備','sermon_preparation'],['生命樹與靈修','tree_reading_admin']]]]},
school:{title:'課輔',cards:[['課輔日常',[['課程與老師安排','school_schedules'],['課輔打卡','school_checkin'],['學生點名','school_rollcall']]],['學生與輔導',[['學生資料','school_students'],['個別輔導','school_counseling']]],['統計與報表',[['出席統計與列印','school_reports']]]]},
admin:{title:'行政',cards:[['場地與物品',[['場地預約','spaces'],['設備與物品借還','inventory']]],['出勤請假',[['出勤紀錄','pastoral_workspace','pastoral/mplus-coworker-tools.html?tab=attendance#attendance-list'],['請假簽核','pastoral_workspace','pastoral/mplus-coworker-tools.html?tab=attendance#leave-list']]],['奉獻與財務',[['主日奉獻登錄','finance_cash'],['支出記帳','finance_expenses'],['收據開立','finance_receipts']]],['相簿',[['教會相簿、課輔相簿','church_albums']]],['活動與其他',[['籃球營報名','heat_camp'],['讀經樹玩家列表','bibletree_players']]]]},
service:{title:'服事',cards:[['服事安排',[['主日服事總排','schedules']]],['調查與協調',[['意願自排','service_signups','service-signup.html?from=app'],['換班協調','service_signups','service-signup-admin.html#changePanel']]],['服事表輸出',[['列印服事表','schedules','schedules.html#export-title'],['發送服事表','schedules','schedules.html#export-title']]]]},
website:{title:'網站',cards:[['網站上稿',[['教會網站與週報','website_weekly'],['協會網站最新消息','association_news'],['雲彩見證投稿審核','testimony_review']]],['內容與發布',[['社群發布','media_publishing'],['牧養圖卡','pastoral_content'],['給今天的你','todays_message'],['把愛傳出去','love_share']]],['共用素材',[['字幕詞庫','subtitle_library']]]]}
};
export function visibleCenters(allowed){return Object.fromEntries(Object.entries(MPLUS_CENTERS).map(([key,center])=>[key,{...center,cards:center.cards.map(([title,links])=>[title,links.filter(([,permission])=>allowed.has(permission))]).filter(([,links])=>links.length)}]));}
const hubNotes={church:'陪伴人，也一起在信仰裡成長。',school:'今天的課務與孩子的需要，一起照顧。',admin:'場地、同工、奉獻與活動事務，集中處理。',service:'找到合適的位置，一起完成每次服事。',website:'從內容準備到上稿發布，集中在這裡。'};
const hubIcons={church:'home',school:'mplus-book',admin:'mplus-box',service:'mplus-calendar',website:'mplus-globe'};
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
export function mountMplusNavigation({allowed,hrefFor,openSchool}){
 const centers=visibleCenters(new Set(allowed)),main=document.querySelector('main');
 const positions=new Map();let activeCenter=null;
 const panel=document.querySelector('.mplus-center')||node('section','','mplus-center');panel.hidden=true;if(!panel.isConnected)main.append(panel);
 const top=document.querySelector('.mplus-top')||node('nav','','mplus-top');top.setAttribute('aria-label','M+ 首頁與系統');top.replaceChildren();
 const home=node('button','首頁');home.type='button';home.onclick=()=>show('home');top.append(home);
 const notice=node('button','通知');notice.type='button';notice.onclick=()=>{show('home');document.querySelector('#notification-history')?.click();};top.append(notice);
 if(allowed.includes('church_settings')){const a=node('a','系統管理');a.href=hrefFor('church_settings');top.append(a);}
 if(!top.isConnected)main.querySelector('.page-header').after(top);
 const dock=document.querySelector('.mobile-app-nav');dock.className='mobile-app-nav mplus-dock';dock.setAttribute('aria-label','M+ 五大入口');dock.replaceChildren();
 for(const [key,center]of Object.entries(centers)){const b=node('button');b.type='button';b.dataset.center=key;b.append(createAppIcon(hubIcons[key],'mplus-icon'),document.createTextNode(center.title));b.onclick=()=>show(key);dock.append(b);}
 const homeNodes=document.querySelector('#mplus-home')?[document.querySelector('#mplus-home')]:[...main.children].filter(n=>![panel,top].includes(n)&&!n.matches('.page-header,#churches,#status'));
 function openCategory(key,title,links){
  const dialog=node('dialog','','mplus-event-dialog');dialog.setAttribute('aria-label',title);const head=node('div','','mplus-dialog-header'),close=node('button','✕','mplus-dialog-close');close.type='button';close.setAttribute('aria-label','關閉視窗');head.append(node('h2',title),close);dialog.append(head,node('p','M+ · '+centers[key].title,'hub-kicker'));
  const list=node('div','','mplus-category-links');for(const [label,permission,file]of links){const a=node('a',label+' ›');a.href=hrefFor(permission,file);if(file?.startsWith('https://drive.google.com/')){a.target='_blank';a.rel='noopener noreferrer';}if(permission.startsWith('school'))a.onclick=e=>openSchool(e,a.href);list.append(a);}dialog.append(list);
  const dismiss=()=>{dialog.close();dialog.remove();};close.onclick=dismiss;dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();});dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
 }
 function show(key){
  if(activeCenter)positions.set(activeCenter,scrollY);activeCenter=key;const url=new URL(location.href);if(key==='home')url.searchParams.delete('center');else url.searchParams.set('center',key);history.replaceState(null,'',url);
  for(const n of homeNodes){if(!n.dataset.mplusOriginalHidden)n.dataset.mplusOriginalHidden=String(n.hidden);n.hidden=key!=='home'||n.dataset.mplusOriginalHidden==='true';}
  panel.hidden=key==='home';dock.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.center===key?'page':'false'));home.classList.toggle('active',key==='home');
  if(key==='home'){requestAnimationFrame(()=>window.scrollTo(0,positions.get(key)||0));return;}
  panel.replaceChildren();const center=centers[key],heading=node('div','','hub-heading');heading.append(node('p','M+ · 功能中心','hub-kicker'),node('h1',center.title),node('p',hubNotes[key]));panel.append(heading);
  const grid=node('div','','hub-grid');for(const [title,links]of center.cards){const direct=links.length===1&&(links[0][1]==='finance_cash'||links[0][1]==='church_albums'),tile=node(direct?'a':'button','','hub-tile'),symbol=node('span','','hub-symbol'),copy=node('span','','hub-copy');if(direct){tile.href=hrefFor(links[0][1],links[0][2]);if(links[0][2]===CHURCH_ALBUM_URL){tile.target='_blank';tile.rel='noopener noreferrer';}}else tile.type='button';symbol.append(createAppIcon(hubIcons[key],'mplus-icon'));copy.append(node('strong',title),node('small',links.map(([label])=>label).join('、')));tile.append(symbol,copy,node('b','›'));if(!direct)tile.onclick=()=>openCategory(key,title,links);grid.append(tile);}panel.append(grid);
  if(!center.cards.length)panel.append(node('p','你目前沒有此區的功能權限，請聯繫管理同工。','muted'));
  if(key==='admin')panel.append(node('p','行政功能逐步開放；籃球隊維持獨立 App。','hub-note'));
  requestAnimationFrame(()=>window.scrollTo(0,positions.get(key)||0));
 }
 const requestedCenter=new URLSearchParams(location.search).get('center');
 show(Object.hasOwn(centers,requestedCenter)?requestedCenter:'home');return {show};
}
