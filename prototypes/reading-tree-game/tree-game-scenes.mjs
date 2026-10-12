// Environment plates share the playable clearing; labels and actors remain live UI.
const sceneNames = {
  garden:'平日花園',newyear:'跨年星光庭園',spring:'新春蒙恩庭園',anniversary:'感恩同行庭院',
  'easter-1':'榮耀進城','easter-2':'禱告的殿','easter-3':'聖殿教導','easter-4':'心的選擇',
  'easter-5':'客西馬尼','easter-6':'十架的愛','easter-7':'安靜等候','easter-8':'復活晨光',
  pentecost:'聖靈降臨',dragon:'端午溪畔',moon:'中秋月庭',light:'光明勇士',
  thanksgiving:'豐收感恩',christmas:'聖誕盼望',birthday:'生日祝福庭園',
};
const nightScenes = new Set(['newyear','easter-4','easter-5','moon','light','christmas']);
const solemnScenes = new Set(['easter-6','easter-7']);
export const GARDEN_SCENES = Object.freeze(Object.fromEntries(Object.entries(sceneNames).map(([id,name])=>[id,Object.freeze({
  id,name,mood:solemnScenes.has(id)?'solemn':nightScenes.has(id)?'night':'day',
  source:id==='garden'?'assets/garden-dawn.png':`assets/scenes/${id}.png`,
})])));
export function sceneForTheme(theme={}) {
  const day=Math.min(8,Math.max(1,Math.trunc(Number(theme.day))||1));
  const key=theme.id==='easter'?`easter-${day}`:theme.id;
  return GARDEN_SCENES[key]||GARDEN_SCENES.garden;
}
export function mountGardenScene(layer,theme={}) {
  if(!layer)return;
  const scene=sceneForTheme(theme),stage=layer.closest('.garden-scene');
  if(!stage||layer.dataset.sceneKey===scene.id)return;
  layer.dataset.sceneKey=scene.id;layer.dataset.theme=theme.id||'garden';
  stage.dataset.scene=scene.id;stage.dataset.sceneMood=scene.mood;
  document.body.style.setProperty('--garden-environment',`url("${new URL(scene.source,import.meta.url).href}")`);
  stage.querySelector('.scene-retry')?.remove();
  const image=new Image();image.className='garden-environment';image.alt='';image.decoding='async';
  image.fetchPriority='high';image.draggable=false;
  const dust=document.createElement('div');dust.className='garden-atmosphere';
  for(let i=0;i<6;i++){const mote=document.createElement('i');mote.style.setProperty('--mote',i);dust.append(mote);}
  const current=()=>layer.dataset.sceneKey===scene.id&&image.parentElement===layer;
  image.onload=()=>{if(current()){image.classList.add('is-ready');stage.querySelector('.scene-retry')?.remove();}};
  image.onerror=()=>{
    if(!current()||stage.querySelector('.scene-retry'))return;
    const retry=document.createElement('button');retry.type='button';retry.className='scene-retry';
    retry.textContent='重試節慶背景';retry.setAttribute('aria-label',`${scene.name}背景未載入，點此重試`);
    retry.onclick=()=>{retry.remove();image.src=new URL(scene.source+'?retry='+Date.now(),import.meta.url).href;};
    stage.querySelector('.scene-top').append(retry);
  };
  layer.replaceChildren(image,dust);
  image.src=new URL(scene.source,import.meta.url).href;
}
