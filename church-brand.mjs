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
