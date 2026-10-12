import {SceneMusicPlayer} from '../../life-tree-music-player.mjs?v=20261012-musicload1';
import {festivalMusicURL} from '../../life-tree-festival-audio.mjs?v=20261012-musicload1';
import {FESTIVALS,festivalById} from '../../life-tree-festivals.mjs';
import {mountGardenScene} from './tree-game-scenes.mjs?v=20261012-scenes1';
let current='garden',day=1,prefs=null,player=null,mode='garden';
const previewMusicPlayer=new SceneMusicPlayer();
export function previewThemeAudio(nextMode,state,audio){
 mode=nextMode;prefs=state;player=audio;const item=festivalById(current),music=current==='birthday'?'anniversary':item?.musicByDay?.[day-1]||current;
 const themed=current!=='garden',source=themed?festivalMusicURL({id:current,day,music}):'';audio.configure({music:state.music&&(!themed||mode!=='garden'),effects:state.sound,musicVolume:state.musicVolume,effectsVolume:state.effectsVolume});
 previewMusicPlayer.sync(source,themed&&mode==='garden'&&state.music,state.musicVolume*.6);
 if(navigator.userActivation?.isActive)previewMusicPlayer.gesture();
}
export function setupFestivalPreview(onChange){
 const selector=document.querySelector('#demo-festival'),days=document.querySelector('#demo-holy-day'),layer=document.querySelector('#demo-festival-layer');if(!selector)return;
 const choices=[['garden','平日花園'],...FESTIVALS.map(f=>[f.id,f.name]),['birthday','生日 · 生日快樂歌']];
 selector.replaceChildren(...choices.map(([id,name])=>{const option=document.createElement('option');option.value=id;option.textContent=name;return option;}));
 function render(){current=selector.value;day=Number(days.value)||1;days.parentElement.hidden=current!=='easter';const item=festivalById(current);mountGardenScene(layer,{id:current,day});document.querySelector('.scene-top .scene-tag').textContent=choices.find(c=>c[0]===current)?.[1]||'我的小小庭園';document.querySelector('#demo-festival-status').textContent=current==='garden'?'平日原創花園配樂':current==='easter'&&day===1?'棕樹主日・榮耀進城 · 〈和撒那〉伴奏，請開啟音樂設定':current==='easter'&&day===6?'受難日・十字架上的愛 · 〈微亞多勒羅沙〉伴奏，請開啟音樂設定':current==='easter'&&day===8?'復活主日・祂已復活 · 〈因祂活著〉純音樂，請開啟音樂設定':`${choices.find(c=>c[0]===current)?.[1]} · 切換音樂需先開啟音樂設定`;onChange();}
 const requested=new URLSearchParams(location.search);if(choices.some(([id])=>id===requested.get('scene')))selector.value=requested.get('scene');days.value=String(Math.min(8,Math.max(1,Math.trunc(Number(requested.get('day')))||1)));
 selector.onchange=render;days.onchange=render;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)previewMusicPlayer.pause();else if(prefs&&player)previewThemeAudio(mode,prefs,player);});
 document.addEventListener('click',e=>{if(e.isTrusted&&prefs&&player){previewThemeAudio(mode,prefs,player);previewMusicPlayer.gesture(Boolean(e.target.closest?.('#audio-start')));}},{capture:true});
 render();
}
