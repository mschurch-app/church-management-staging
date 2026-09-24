const validChurches=new Set(['M+','SHiNE']);
const requested=new URLSearchParams(location.search).get('church');
const church=validChurches.has(requested)?requested:null;
const brands={
  'M+':{name:'M＋大雅教會',short:'M＋',src:'assets/brands/mplus-logo-white.png'},
  SHiNE:{name:'火樂教會',short:'火樂',src:'assets/brands/shine-logo.png'}
};
const modules=[
  {key:'dashboard',file:'admin-dashboard.html',label:'管理首頁',icon:'🏠'},
  {key:'members',file:'members.html',label:'會友名冊',icon:'👥',permission:'members',also:['member-audit.html','binding-review.html']},
  {key:'groups',file:'groups.html',label:'小組／小家',icon:'🫶',permission:'groups',also:['group-members.html']},
  {key:'attendance',file:'attendance.html',label:'聚會點名',icon:'✅',permission:'attendance'},
  {key:'schedules',file:'schedules.html',label:'服事排班',icon:'📅',permission:'schedules'},
  {key:'prayers',file:'prayers.html',label:'代禱關懷',icon:'🙏',permission:'private_prayers'},
  {key:'spaces',file:'spaces.html',label:'場地預約',icon:'📍',permission:'spaces',also:['amenities.html']},
  {key:'pastoral_inbox',file:'pastoral-inbox.html',label:'牧養訊息',icon:'💬',permission:'pastoral_chats'},
  {key:'pastoral_content',file:'pastoral-content.html',label:'教牧內容',icon:'✨',permission:'pastoral_chats'},
  {key:'settings',file:'church-settings.html',label:'系統設定',icon:'⚙️',also:['customization-settings.html','welcome-settings.html','ministry-settings.html','admin-accounts.html','todays-message-settings.html','love-share-settings.html']}
];
const currentFile=location.pathname.split('/').pop()||'admin-dashboard.html';
document.documentElement.dataset.church=church||'';

function logo(key){const image=document.createElement('img');image.src=brands[key].src;image.alt=brands[key].name;image.decoding='async';return image;}
function lockup(key=church){const wrap=document.createElement('div');wrap.className='church-brand'+(key?'':' church-brand--pair');if(key){wrap.append(logo(key));return wrap;}wrap.append(logo('M+'));const divider=document.createElement('span');divider.className='church-brand-divider';divider.setAttribute('aria-hidden','true');wrap.append(divider,logo('SHiNE'));wrap.setAttribute('aria-label','M＋大雅教會與火樂教會');return wrap;}

function mountBrand(){
  const newcomer=document.querySelector('#headerIconWrapper');
  if(newcomer&&church){newcomer.replaceChildren(logo(church));newcomer.className='public-church-brand';newcomer.removeAttribute('style');return;}
  const login=document.querySelector('.login-visual');if(login){login.prepend(lockup());return;}
  const flow=document.querySelector('.flow-hero');if(flow){const badge=flow.querySelector('.badge');(badge||flow.firstChild)?.after(lockup());return;}
  const ministry=document.querySelector('.ministry-hero .hero-content');if(ministry){ministry.prepend(lockup());return;}
  const header=document.querySelector('.member-page>.page-header');if(header){const content=header.querySelector(':scope>div')||header;content.prepend(lockup());}
}
mountBrand();

function allowed(access,selected,module){return !module.permission||access.grants.some(row=>row.church_id===selected&&row.permission===module.permission);}
function moduleIsCurrent(module){return currentFile===module.file||(module.also||[]).includes(currentFile);}
function moduleUrl(file,selected){const url=new URL(file,location.href);url.searchParams.set('church',selected);return url.pathname.split('/').pop()+url.search;}

function cleanLegacyNavigation(){
  const moduleFiles=new Set(modules.flatMap(item=>[item.file,...(item.also||[])]));
  for(const nav of document.querySelectorAll('.page-nav')){
    if(nav.id==='churches'){nav.hidden=true;continue;}
    for(const link of [...nav.querySelectorAll('a')]){
      const url=new URL(link.href,location.href),file=url.pathname.split('/').pop(),target=url.searchParams.get('church');
      if(moduleFiles.has(file)||validChurches.has(target)&&file===currentFile)link.remove();
    }
    nav.classList.add('context-nav');
    if(!nav.querySelector('a,button'))nav.hidden=true;
  }
}

function mountModuleBar(access,selected,settings){
  if(currentFile==='admin-dashboard.html')return;
  const anchor=document.querySelector('.member-page>.page-header')||document.querySelector('.ministry-app>.ministry-hero');
  if(!anchor||document.querySelector('.module-bar'))return;
  const nav=document.createElement('nav');nav.className='module-bar';nav.setAttribute('aria-label','管理功能');
  const defaults=modules.slice(1,-1).map((module,index)=>({...module,enabled:true,navigation:true,navigation_order:(index+1)*10}));
  const configuredItems=Array.isArray(settings?.feature_modules)?settings.feature_modules:defaults;
  const configured=new Map(configuredItems.filter(item=>item.enabled&&item.navigation).sort((a,b)=>Number(a.navigation_order)-Number(b.navigation_order)).map(item=>[item.key,item])),visible=[modules[0],...modules.slice(1,-1).filter(module=>configured.has(module.key)).sort((a,b)=>Number(configured.get(a.key)?.navigation_order)-Number(configured.get(b.key)?.navigation_order)),modules.at(-1)];
  for(const module of visible.filter(item=>allowed(access,selected,item))){const setting=configured.get(module.key),link=document.createElement('a'),icon=document.createElement('span'),label=document.createElement('span');link.href=moduleUrl(module.file,selected);link.className=moduleIsCurrent(module)?'current':'';icon.className='module-bar-icon';icon.textContent=setting?.icon||module.icon;icon.setAttribute('aria-hidden','true');label.textContent=setting?.label||module.label;link.append(icon,label);nav.append(link);}
  anchor.after(nav);
}

function makeSwitcher(access,selected){
  if(access.churches.length<2)return null;
  const switcher=document.createElement('nav');switcher.className='church-switcher';switcher.setAttribute('aria-label','切換堂會');
  for(const key of access.churches){const link=document.createElement('a'),url=new URL(location.href);url.searchParams.set('church',key);link.href=url.pathname.split('/').pop()+url.search;link.textContent=brands[key].short;if(key===selected)link.className='current';switcher.append(link);}
  return switcher;
}

function mountHeaderTools(access,selected){
  const header=document.querySelector('.member-page>.page-header');
  if(header){const content=header.querySelector(':scope>div:not(.header-tools)')||header.firstElementChild;if(!content)return;let tools=header.querySelector(':scope>.header-tools');if(!tools){tools=document.createElement('div');tools.className='header-tools';const actions=[...header.children].filter(node=>node!==content&&node!==tools);for(const node of actions)tools.append(node);header.append(tools);}const switcher=makeSwitcher(access,selected);if(switcher)tools.prepend(switcher);if(!tools.children.length)tools.remove();return;}
  const ministryHero=document.querySelector('.ministry-app>.ministry-hero');if(ministryHero){const switcher=makeSwitcher(access,selected);if(switcher)ministryHero.append(switcher);}
}

async function mountManagement(){
  const managementRoot=document.querySelector('.member-page,.ministry-app');if(!managementRoot)return;
  try{
    const localPreview=location.hostname==='127.0.0.1'&&new URLSearchParams(location.search).get('preview')==='1';
    const [{db},{readAccess,chooseChurch},{loadChurchCustomizations}]=await Promise.all([import('./admin-db.mjs'),import('./admin-access.mjs?v=20260923-profile2'),import('./church-customizations.mjs?v=20260924-custom1')]);
    const allPermissions=['members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces'];
    const access=localPreview?{user:{name:'吳俊璋',title:'牧師'},churches:['M+','SHiNE'],grants:['M+','SHiNE'].flatMap(church_id=>allPermissions.map(permission=>({church_id,permission})))}:await readAccess(db),selected=chooseChurch(access,church);
    const settings=localPreview?null:await loadChurchCustomizations(db,selected);document.documentElement.dataset.church=selected;
    cleanLegacyNavigation();mountModuleBar(access,selected,settings);mountHeaderTools(access,selected);
    const header=document.querySelector('.member-page>.page-header'),content=header?.querySelector(':scope>div:not(.header-tools)');
    if(content){const existing=content.querySelector('#welcome');if(existing){existing.className='admin-identity';existing.textContent=access.user.name+'｜'+access.user.title;}else if(!content.querySelector('.admin-identity')){const chip=document.createElement('p'),name=document.createElement('strong'),title=document.createElement('span');chip.className='admin-identity';name.textContent=access.user.name;title.textContent=access.user.title;chip.append(name,document.createTextNode('｜'),title);content.append(chip);}}
  }catch{}
}
mountManagement();
