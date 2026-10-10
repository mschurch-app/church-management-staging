import {FESTIVALS,MONSTERS,festivalById,festivalForDate,decorationForDate,festivalDay} from './life-tree-festivals.mjs?v=20261010-festival1';
import {festivalSymbol,festivalScene,festivalEquipment} from './life-tree-festival-art.mjs?v=20261010-festival1';
import {applyAppIcon} from './app-icons.mjs?v=20261009-stage2';

// Standalone, public visual preview. All actions and collections are memory only.
const $=id=>document.getElementById('festival-'+id);
const params=new URL(location.href).searchParams;
const dated=festivalForDate(params.get('date'))||decorationForDate(params.get('date'));
const initial=festivalById(params.get('festival'))||dated||festivalById('thanksgiving');
const preference=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={item:initial,day:Math.round(Math.max(1,Math.min(7,Number(params.get('day'))|| (dated?festivalDay(dated,params.get('date')):1)))),phase:'idle',hits:0,completed:new Set(),sound:preference('lifeTreeSound','off')==='on',motion:preference('lifeTreeFestivalMotion','normal'),version:0};
let timers=new Set(),toastTimer,musicTask=0,musicBusy=false;
let soundWanted=state.sound;
const music=new Audio(),effect=new Audio();music.loop=true;music.volume=.27;effect.volume=.5;music.preload='none';effect.preload='none';
const spots={spring:[81,25],easter:[26,71],pentecost:[53,78],dragon:[76,73],moon:[23,79],light:[21,69],thanksgiving:[52,80],christmas:[79,18]};
const currentKey=()=>state.item.id+':'+state.day;
let decorationOnly=initial.id==='christmas'&&Boolean(decorationForDate(params.get('date')))&&!festivalForDate(params.get('date'));
const count=id=>[...state.completed].filter(key=>key.startsWith(id+':')).length;
const badgeCount=()=>FESTIVALS.filter(item=>count(item.id)===7).length;
const moving=()=>state.motion!=='reduced'&&!reduced.matches;
const wait=(duration,fn)=>{const version=state.version;const handle=setTimeout(()=>{timers.delete(handle);if(version===state.version)fn();},moving()?duration:30);timers.add(handle);};
function cancel(){state.version++;for(const handle of timers)clearTimeout(handle);timers.clear();}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function feedback(message){$('action-status').textContent=message;}
function renderArt(){
 const progress=state.phase==='complete'?state.day:state.day-1;
 $('scene').dataset.phase=state.phase;$('scene').dataset.day=state.day;$('scene').dataset.hits=state.hits;
 $('art').innerHTML=festivalScene(state.item,{day:state.day,progress,phase:state.phase,hits:state.hits,decorationOnly});
}
function renderControls(){
 const busy=['watering','acting','celebrating'].includes(state.phase),done=state.phase==='complete';
 $('action').disabled=busy;$('hotspot').disabled=busy||done;
 $('action').setAttribute('aria-busy',String(busy));
 $('action-label').textContent=state.phase==='idle'?'試試澆水，喚醒花園':state.phase==='watering'?'小樹正在喝水…':state.phase==='celebrating'?'收下今天的光！':done?(state.day<7?'走進第'+(state.day+1)+'天':'七天風景，再看一遍'):state.item.id==='light'?MONSTERS[state.day-1].verb:state.item.action;
 $('action-detail').textContent=done?'也可以繼續每日靈修，留下今天的亮光。':state.phase==='idle'?'先給小樹一點養分，再遇見節慶驚喜。':`點三下${state.item.target}，看看場景的變化 · ${state.hits} / 3`;
 $('action-icon').innerHTML=festivalSymbol(state.item.id);
 $('hotspot').setAttribute('aria-label',state.phase==='idle'?'為小樹澆水':state.item.action);
 $('hit-count').textContent=state.hits+' / 3';
 $('collection-count').textContent=String(badgeCount());
 $('days').querySelectorAll('button').forEach(button=>{button.setAttribute('aria-pressed',String(Number(button.dataset.day)===state.day));button.dataset.complete=String(state.completed.has(state.item.id+':'+button.dataset.day));});
}
function render(){
 const item=state.item,content=item.days[state.day-1];document.body.dataset.festival=item.id;
 document.body.style.setProperty('--fest-accent',item.accent);document.body.style.setProperty('--fest-paper',item.paper);
 $('kicker').textContent=item.name+' · '+item.subtitle;$('title').textContent=item.title;
 $('motif').textContent=decorationOnly?'十二月的小樹・聖誕燈串・彩球與星星':item.motif;$('period').textContent=decorationOnly?'12/01 — 12/31 · 聖誕佈置':item.start.slice(5).replace('-','/')+' — '+item.end.slice(5).replace('-','/');
 $('day-label').textContent='第 '+state.day+' 天';$('task-title').textContent=item.action;$('description').textContent='每天一點不同，七天慢慢走完這個季節。';
 $('day-title').textContent=content.title;$('ref').textContent=content.reference;$('reflection').textContent=content.reflection;$('journal-prompt').textContent=content.prompt;
 $('decoration-note').hidden=item.id!=='christmas';$('monster-card').hidden=item.id!=='light';
 $('monster-name').textContent=MONSTERS[state.day-1].name;$('equipment').textContent='今日裝備：'+MONSTERS[state.day-1].tool;$('equipment-art').innerHTML=festivalEquipment(state.day);
 const [x,y]=spots[item.id];$('hotspot').style.setProperty('--hot-x',x+'%');$('hotspot').style.setProperty('--hot-y',y+'%');
 $('chapters').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.festival===item.id)));
 renderArt();renderControls();
}
function select(id,day=1){
 const item=festivalById(id);if(!item)return;cancel();stopMusic();clearTimeout(toastTimer);$('toast').hidden=true;
 decorationOnly=false;state.item=item;state.day=Math.round(Math.max(1,Math.min(7,day)));state.hits=0;state.phase=state.completed.has(currentKey())?'complete':'idle';
 feedback(state.phase==='complete'?'這一天的試玩已完成，可以重看動畫或選其他日期。':'選好一天，就從澆水開始。');
 const url=new URL(location.href);url.searchParams.delete('date');url.searchParams.set('festival',id);url.searchParams.set('day',String(state.day));history.replaceState(null,'',url);
 render();if(state.sound)playMusic();
}
function celebrate(){
 state.completed.add(currentKey());state.phase='celebrating';renderArt();renderControls();playEffect('celebration');
 feedback(count(state.item.id)===7?state.item.complete+' 已收藏「'+state.item.badge+'」。':'今天的場景亮起來了！選下一天，繼續看看花園。');
 toast(count(state.item.id)===7?'已收藏 · '+state.item.badge:'今天的小小驚喜，完成！');
 wait(1700,()=>{state.phase='complete';renderArt();renderControls();});
}
function act(){
 if(['watering','acting','celebrating'].includes(state.phase))return;
 if(state.phase==='complete'){const restart=state.day===7;select(state.item.id,restart?1:state.day+1);if(restart){state.phase='idle';render();feedback('一起從第一天重新看一遍。收藏紀念會保留。');}return;}
 if(state.sound)playMusic();
 if(state.phase==='idle'){
  state.phase='watering';renderArt();renderControls();feedback('小樹接住養分，花園的驚喜快要醒來了。');playEffect('water');
  wait(1250,()=>{state.phase='ready';renderArt();renderControls();feedback('澆水完成！點點發光的'+state.item.target+'，或按下方按鈕。');toast('澆水完成，來看看節慶驚喜！');});return;
 }
 state.hits++;state.phase='acting';renderArt();renderControls();playEffect('open');
 feedback(state.item.id==='light'?MONSTERS[state.day-1].tool+'發出光芒 · '+state.hits+' / 3':state.item.target+'有了回應 · '+state.hits+' / 3');
 wait(700,()=>{if(state.hits>=3)celebrate();else{state.phase='ready';renderArt();renderControls();}});
}
function greet(){
 $('scene').classList.remove('is-patted');void $('scene').offsetWidth;$('scene').classList.add('is-patted');
 toast(state.item.id==='christmas'?'聖誕燈亮一亮，小樹也向你說平安！':'葉子搖搖，小樹很高興見到你！');playEffect('open');wait(1100,()=>$('scene').classList.remove('is-patted'));
}

// Native audio: no AudioContext required; retryable deadline, user preference only.
function syncSound(){
 $('sound').setAttribute('aria-pressed',String(state.sound));$('sound').setAttribute('aria-label',state.sound?'關閉音樂與音效':'開啟音樂與音效');
}
async function playMusic(){
 if(!state.sound||document.hidden||musicBusy)return;
 const src=new URL('assets/audio/life-tree/festivals/'+state.item.id+'.wav?v=20261010-festival1',import.meta.url).href;
 if(music.src===src&&!music.paused)return;
 musicBusy=true;const task=++musicTask;music.pause();if(music.src!==src)music.src=src;
 let timeout;
 try{
  await Promise.race([music.play(),new Promise((_,reject)=>timeout=setTimeout(()=>reject(new Error('audio timeout')),6000))]);
  if(task!==musicTask)return;if(!state.sound||document.hidden){music.pause();return;}
  $('audio-status').textContent='正在播放「'+state.item.name+'」的花園音樂。';
 }catch{
  if(task!==musicTask)return;music.pause();state.sound=false;syncSound();
  $('audio-status').textContent='音樂還沒開始，點一下上方喇叭就能重試。';
 }finally{clearTimeout(timeout);if(task===musicTask)musicBusy=false;}
}
function stopMusic(){musicTask++;musicBusy=false;music.pause();effect.pause();}
function playEffect(name){
 if(!state.sound||document.hidden)return;effect.pause();effect.src=new URL('assets/audio/life-tree/'+name+'.wav',import.meta.url).href;
 const promise=effect.play();promise?.catch(()=>{});
}
$('sound').addEventListener('click',()=>{state.sound=!state.sound;soundWanted=state.sound;remember('lifeTreeSound',state.sound?'on':'off');syncSound();if(state.sound)playMusic();else{stopMusic();$('audio-status').textContent='聲音已關閉。';}});
function syncMotion(){document.body.dataset.motion=(!moving()?'reduced':'normal');$('motion').setAttribute('aria-pressed',String(!moving()));$('motion').setAttribute('aria-label',moving()?'減少動態效果':'恢復動態效果');}
$('motion').addEventListener('click',()=>{state.motion=state.motion==='reduced'?'normal':'reduced';remember('lifeTreeFestivalMotion',state.motion);syncMotion();toast(moving()?'動畫已開啟。':'已減少動態，仍可完成所有互動。');});reduced.addEventListener('change',syncMotion);
document.addEventListener('visibilitychange',()=>{document.body.dataset.background=String(document.hidden);if(document.hidden)stopMusic();else if(state.sound)playMusic();});
function resumeMusic(event){if(!event.isTrusted||event.target.closest?.('#festival-sound')||event.type==='keydown'&&!['Enter',' '].includes(event.key))return;if(soundWanted&&music.paused){state.sound=true;syncSound();playMusic();}}
document.addEventListener('pointerdown',resumeMusic,{passive:true});document.addEventListener('keydown',resumeMusic);

for(const item of FESTIVALS){const button=document.createElement('button');button.type='button';button.className='festival-chapter';button.dataset.festival=item.id;button.setAttribute('aria-pressed',String(item===initial));button.innerHTML=festivalSymbol(item.id)+'<span>'+item.name+'<small>'+item.title+'</small></span>';button.addEventListener('click',()=>select(item.id));$('chapters').append(button);}
for(let day=1;day<=7;day++){const button=document.createElement('button');button.type='button';button.className='festival-day';button.dataset.day=day;button.textContent=String(day);button.setAttribute('aria-label','試看第'+day+'天');button.addEventListener('click',()=>select(state.item.id,day));$('days').append(button);}
document.querySelectorAll('[data-icon]').forEach(node=>applyAppIcon(node,node.dataset.icon));
$('action').addEventListener('click',act);$('hotspot').addEventListener('click',act);$('pat').addEventListener('click',greet);$('greet').addEventListener('click',greet);
$('replay').addEventListener('click',()=>{cancel();state.phase='idle';state.hits=0;render();feedback('從澆水開始重看；完成紀念不會重複增加。');});
let dialogFocus,dialogScroll='';
$('collection').addEventListener('click',()=>{
 $('badges').innerHTML=FESTIVALS.map(item=>`<article class="festival-badge" data-earned="${count(item.id)===7}">${festivalSymbol(item.id)}<strong>${item.badge}</strong><small>${count(item.id)} / 7 天${count(item.id)===7?' · 已收藏':''}</small></article>`).join('');
 dialogFocus=document.activeElement;dialogScroll=document.body.style.overflow;document.body.style.overflow='hidden';$('dialog').showModal();$('dialog-close').focus();
});
$('dialog-close').addEventListener('click',()=>$('dialog').close());
$('dialog').addEventListener('close',()=>{document.body.style.overflow=dialogScroll;dialogFocus?.focus({preventScroll:true});});
$('dialog').addEventListener('click',event=>{if(event.target===$('dialog')){const rect=$('dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('dialog').close();}});
window.addEventListener('pagehide',()=>{cancel();stopMusic();clearTimeout(toastTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted){state.phase=state.completed.has(currentKey())?'complete':state.hits?'ready':'idle';render();feedback('回到花園了，可以繼續今天的試玩。');if(state.sound)playMusic();}});
const mobile=matchMedia('(max-width:800px)');
function placeControls(){const destination=mobile.matches?$('mobile-controls'):$('replay').parentElement.parentElement;if(mobile.matches)destination.append($('controls'));else destination.insertBefore($('controls'),$('replay').parentElement);}
mobile.addEventListener('change',placeControls);placeControls();
syncSound();syncMotion();render();feedback('選好一天，就從澆水開始。');if(state.sound)playMusic();
