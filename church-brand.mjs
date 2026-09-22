const validChurches=new Set(['M+','SHiNE']);
const requested=new URLSearchParams(location.search).get('church');
const church=validChurches.has(requested)?requested:null;
const brands={
  'M+':{name:'M＋大雅教會',src:'assets/brands/mplus-logo-white.png'},
  SHiNE:{name:'火樂教會',src:'assets/brands/shine-logo.png'}
};

function logo(key){
  const image=document.createElement('img');
  image.src=brands[key].src;
  image.alt=brands[key].name;
  image.decoding='async';
  return image;
}

function lockup(key=church){
  const wrap=document.createElement('div');
  wrap.className='church-brand'+(key?'':' church-brand--pair');
  if(key){wrap.append(logo(key));return wrap;}
  wrap.append(logo('M+'));
  const divider=document.createElement('span');
  divider.className='church-brand-divider';divider.setAttribute('aria-hidden','true');
  wrap.append(divider,logo('SHiNE'));
  wrap.setAttribute('aria-label','M＋大雅教會與火樂教會');
  return wrap;
}

function mount(){
  const newcomer=document.querySelector('#headerIconWrapper');
  if(newcomer&&church){
    newcomer.replaceChildren(logo(church));
    newcomer.className='public-church-brand';
    newcomer.removeAttribute('style');
    return;
  }

  const login=document.querySelector('.login-visual');
  if(login){login.prepend(lockup());return;}

  const flow=document.querySelector('.flow-hero');
  if(flow){
    const badge=flow.querySelector('.badge');
    (badge||flow.firstChild)?.after(lockup());
    return;
  }

  const ministry=document.querySelector('.ministry-hero .hero-content');
  if(ministry){ministry.prepend(lockup());return;}

  const header=document.querySelector('.member-page>.page-header');
  if(header){
    const content=header.querySelector(':scope>div')||header;
    content.prepend(lockup());
  }
}

mount();

function filterChurchLinks(access){
  const groups=new Map();
  for(const link of document.querySelectorAll('.page-nav a')){
    const url=new URL(link.href,location.href),target=url.searchParams.get('church');
    if(!validChurches.has(target))continue;
    const key=url.pathname;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({link,target});
  }
  for(const [path,items] of groups){
    const wasSwitchSet=items.length>1;
    for(const item of items)if(!access.churches.includes(item.target))item.link.remove();
    if(access.churches.length===1&&wasSwitchSet&&path===location.pathname){
      for(const item of items)if(item.link.isConnected)item.link.remove();
    }
  }
}

async function mountAdminIdentity(){
  const header=document.querySelector('.member-page>.page-header');
  if(!header)return;
  try{
    const [{db},{readAccess}]=await Promise.all([import('./admin-db.mjs'),import('./admin-access.mjs?v=20260923-profile1')]);
    const access=await readAccess(db),content=header.querySelector(':scope>div')||header;
    filterChurchLinks(access);
    const existing=content.querySelector('#welcome');
    if(existing){existing.className='admin-identity';existing.textContent=access.user.name+'｜'+access.user.title;return;}
    if(content.querySelector('.admin-identity'))return;
    const chip=document.createElement('p'),name=document.createElement('strong'),title=document.createElement('span');
    chip.className='admin-identity';name.textContent=access.user.name;title.textContent=access.user.title;
    chip.append(name,document.createTextNode('｜'),title);content.append(chip);
  }catch{}
}

mountAdminIdentity();
