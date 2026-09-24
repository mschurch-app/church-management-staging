export const SCRIPTURE_TREE_CONFIG=Object.freeze({
  launchDate:'2027-01-01T00:00:00+08:00',
  timeZone:'Asia/Taipei',
  previewEnabled:true,
  enabled:false,
  stageThresholds:Object.freeze({seed:1,sprout:3,growing:7,blooming:21,fruitful:null}),
});

const params=new URLSearchParams(location.search);
const church=['M+','SHiNE'].includes(params.get('church'))?params.get('church'):'M+';
if(church!=='M+')location.replace(`line-member.html?church=${encodeURIComponent(church)}&feature=menu`);
const brands={
  'M+':{name:'M＋大雅教會',logo:'assets/brands/mplus-logo-white.png'},
  SHiNE:{name:'火樂教會',logo:'assets/brands/shine-logo.png'},
};
const $=selector=>document.querySelector(selector);
const launchAt=new Date(SCRIPTURE_TREE_CONFIG.launchDate).getTime();
let countdownTimer=0;

function isScriptureTreeLaunched(now=Date.now()){
  return now>=launchAt;
}

function applyBrand(){
  const brand=brands[church];
  $('#brandName').textContent=brand.name;
  $('#brandLogo').src=brand.logo;
  $('#brandLogo').alt=brand.name;
  const home=`line-member.html?church=${encodeURIComponent(church)}&feature=menu`;
  for(const id of ['backLink','brandLink','footerBackLink'])$(`#${id}`).href=home;
  document.title=`讀經生命樹｜${brand.name}`;
}

function pad(value,length=2){return String(Math.max(0,value)).padStart(length,'0');}

function updateCountdown(){
  const distance=Math.max(0,launchAt-Date.now());
  if(isScriptureTreeLaunched()){
    $('#countdown').hidden=true;
    $('#launchState').hidden=false;
    clearInterval(countdownTimer);
    return;
  }
  const days=Math.floor(distance/86400000);
  const hours=Math.floor(distance%86400000/3600000);
  const minutes=Math.floor(distance%3600000/60000);
  const seconds=Math.floor(distance%60000/1000);
  $('#days').textContent=pad(days,3);
  $('#hours').textContent=pad(hours);
  $('#minutes').textContent=pad(minutes);
  $('#seconds').textContent=pad(seconds);
  $('#countdown').setAttribute('aria-label',`距離生命樹開始成長還有 ${days} 天 ${hours} 小時 ${minutes} 分鐘`);
}

function setupReveal(){
  const items=[...document.querySelectorAll('.reveal')];
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver'in window)){
    items.forEach(item=>item.classList.add('visible'));
    return;
  }
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  },{threshold:.12,rootMargin:'0px 0px -28px'});
  items.forEach(item=>observer.observe(item));
}

applyBrand();
updateCountdown();
countdownTimer=window.setInterval(updateCountdown,1000);
setupReveal();
window.addEventListener('pagehide',()=>clearInterval(countdownTimer),{once:true});
