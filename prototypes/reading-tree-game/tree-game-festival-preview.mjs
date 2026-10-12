import {FESTIVALS,festivalById} from '../../life-tree-festivals.mjs';
import {festivalScene} from '../../life-tree-festival-art.mjs';
import {collectibleArt} from './tree-game-collectibles.mjs';
let current='garden',day=1,track=null,trackKey='',prefs=null,player=null,mode='garden';
export function previewThemeAudio(nextMode,state,audio){
 mode=nextMode;prefs=state;player=audio;const item=festivalById(current),music=current==='birthday'?'anniversary':item?.musicByDay?.[day-1]||current;
 const themed=current!=='garden';audio.configure({music:state.music&&(!themed||mode!=='garden'),effects:state.sound,musicVolume:state.musicVolume,effectsVolume:state.effectsVolume});
 if(themed&&trackKey!==music){track?.pause();track=new Audio(`../../assets/audio/life-tree/festivals/${music}.wav`);track.loop=true;trackKey=music;}
 if(track){track.volume=state.musicVolume*.6;if(themed&&mode==='garden'&&state.music&&!document.hidden)void track.play().catch(()=>{});else track.pause();}
}
export function setupFestivalPreview(onChange){
 const selector=document.querySelector('#demo-festival'),days=document.querySelector('#demo-holy-day'),layer=document.querySelector('#demo-festival-layer');if(!selector)return;
 const choices=[['garden','平日花園'],...FESTIVALS.map(f=>[f.id,f.name]),['birthday','生日 · 生日快樂歌']];
 selector.replaceChildren(...choices.map(([id,name])=>{const option=document.createElement('option');option.value=id;option.textContent=name;return option;}));
 function render(){current=selector.value;day=Number(days.value)||1;days.parentElement.hidden=current!=='easter';const item=festivalById(current);layer.innerHTML=current==='birthday'?`<div class="birthday-garden">${collectibleArt('cake')}<strong>生日快樂，願你蒙恩！</strong></div>`:item?festivalScene(item,{day,treeMarkup:'',progress:7}):'';layer.dataset.theme=current;document.querySelector('#demo-festival-status').textContent=current==='garden'?'平日原創花園配樂':`${choices.find(c=>c[0]===current)?.[1]} · 切換音樂需先開啟音樂設定`;onChange();}
 selector.onchange=render;days.onchange=render;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)track?.pause();else if(prefs&&player)previewThemeAudio(mode,prefs,player);});
 document.addEventListener('click',e=>{if(e.isTrusted&&prefs&&player)previewThemeAudio(mode,prefs,player);},{capture:true});
 render();
}
