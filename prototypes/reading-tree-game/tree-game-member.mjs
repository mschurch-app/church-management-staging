import {loadScheduledChapters} from '../../bible-scripture-loader.mjs';
import {festivalById} from '../../life-tree-festivals.mjs';
import {festivalScene} from '../../life-tree-festival-art.mjs';
import {collectibleArt} from './tree-game-collectibles.mjs';
import {iconMarkup} from '../../app-icons.mjs';
const API='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/tree-garden';
export const MEMBER_MODE=document.body.dataset.memberGarden==='true';
export let memberData=null;
let readingGeneration=0;let token='',observer=null,track=null,currentTheme='',activeAudio=null,activePrefs=null,activeMode='garden';
const $=s=>document.querySelector(s);
const messages={login_required:'登入已到期，請重新從 LINE 開啟。',binding_required:'請先完成教會會友身分綁定，再回來開啟小樹。',conflict:'另一個畫面剛更新進度，請先重新整理再繼續。',unavailable:'連線暫時沒有完成，請先重新整理確認進度。',already_full:'目前已經補滿了，先把寶物留在裝備包吧。',item_unavailable:'這件小物還在收集中，累積讀經就能再取得。',rest_needed:'先回到花園休息，讀經或收到關懷可補充信心 HP。',mp_needed:'盼望 MP 不夠了，先讀經、澆水、寫手札或領取關懷。',group_required:'目前尚未編入小組，請同工協助設定後再組隊。',invite_invalid:'邀請已過期，或與你目前所屬的小組不同。',care_limit:'今天的關懷已送滿，或這位家人已收到三份關懷。',care_forbidden:'這位家人目前不在你的同行小組。',date_not_allowed:'只能完成今日或最近七天內可補讀的日期。',read_first:'先完成這一天的讀經，再澆水或寫手札。',stale_event:'事件進度已更新，請回花園開啟目前的事件。',content_empty:'這一天的教會讀經內容尚未發布，請稍後再來。'};
function entryURL(){const url=new URL('../../line-member.html',location.href);url.searchParams.set('church','M+');url.searchParams.set('feature','tree');const invite=new URLSearchParams(location.search).get('team');if(/^[0-9a-f-]{36}$/.test(invite||''))url.searchParams.set('team',invite);return url.href;}
export async function memberAPI(action,extra={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const r=await fetch(API,{method:'POST',cache:'no-store',credentials:'omit',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({action,idToken:token,...extra})});const data=await r.json().catch(()=>({}));if(!r.ok||data.ok!==true){const e=new Error(messages[data.error]||'暫時無法完成，請重新整理後再試。');e.code=data.error;throw e;}if(data.state&&(!memberData||data.version>=memberData.version))memberData=data;return data;
 }catch(e){if(e.name==='AbortError')throw new Error('等待連線逾時，請先重新整理確認是否已保存。');throw e;}finally{clearTimeout(timer);}
}
export async function initMember(){
 if(!MEMBER_MODE)return null;
 try{token=sessionStorage.getItem('line-member-token:M+')||'';}catch{}
 $('#member-login-link').href=entryURL();
 if(!token){$('#member-login-status').textContent='從 LINE 登入，才能保存你的花園與讀經進度。';throw Error('member_login_required');}
 try{const data=await memberAPI('me');document.body.dataset.memberReady='true';$('#member-gate').hidden=true;return data.state;}
 catch(e){$('#member-login-status').textContent=e.message;throw e;}
}
export function preferences(){let p={};try{p=JSON.parse(localStorage.getItem('mplus-garden-audio')||'{}');}catch{}return {music:p.music===true,sound:p.sound===true,musicVolume:Number.isFinite(p.musicVolume)?p.musicVolume:.45,effectsVolume:Number.isFinite(p.effectsVolume)?p.effectsVolume:.65};}
export function savePreferences(s){try{localStorage.setItem('mplus-garden-audio',JSON.stringify({music:s.music,sound:s.sound,musicVolume:s.musicVolume,effectsVolume:s.effectsVolume}));}catch{}}
export function renderMember(s){
 if(!MEMBER_MODE||!memberData)return;
 $('#member-name').textContent=memberData.profile.name;$('#combat-life').textContent=`信心 HP ${s.life.hp}／100 · 盼望 MP ${s.life.mp}／100`;
 for(const kind of ['hp','mp']){$(`#life-${kind}`).value=s.life[kind];$(`#life-${kind}-value`).textContent=`${s.life[kind]}／100`;}
 $('#buff-status').textContent=s.buffs.reading?`已收藏 ${s.buffs.reading} 次讀經雙倍：20 → 40 XP`:'每天讀經補充信心 HP +40、盼望 MP +20。';
 $('#care-boost').textContent=s.buffs.care?`活水祝福 ${s.buffs.care} 次：下次收到關懷再補 HP、MP 各 10`:'澆水與拾光手札各補充 MP +10。';
 $('#rest-notice').hidden=s.life.hp>0;
 const milestones=[['flower',1,3],['lamp',3,5],['bird',7,7],['fountain',14,14],['fruit',30,30]];
 $('#next-collectibles').replaceChildren(...milestones.map(([id,first,cycle])=>{const inv=s.inventory[id]||{start:0,earned:0,count:0},p=document.createElement('p');p.textContent=`${itemName(id)} · ${inv.count?'已在裝備包':`再讀 ${Math.max(0,(inv.earned?cycle:first)-(s.records.length-inv.start))} 天`}`;return p;}));
 const theme=memberData.theme;$('#festival-label').textContent=theme.name;
 const layer=$('#member-festival');
 if(theme.id!==layer.dataset.theme){layer.dataset.theme=theme.id;const item=festivalById(theme.id);layer.innerHTML=theme.id==='birthday'?`<div class="birthday-garden">${collectibleArt('cake')}<strong>生日快樂，願你蒙恩！</strong></div>`:item?festivalScene(item,{day:theme.day,treeMarkup:'',progress:7}):'';}
 const read=$('#read-open').querySelector('span:nth-child(2) small');read.textContent=memberData.today>='2027-01-01'?'教會每日讀經 · 根、枝、果完整經文':`箴言 ${Number(memberData.today.slice(-2))} 章 · 完整經文`;
 $('#read-open').querySelector('strong').textContent=s.records.some(r=>r.reading_date===memberData.today)?'已完成':s.buffs.reading?'+40 XP':'+20 XP';
 $('#garden-tab span').textContent=String(Object.values(s.inventory).reduce((n,i)=>n+(i.count||0),0));
 $('#collection-list').replaceChildren(...Object.entries(s.inventory).filter(([,v])=>v.earned>0).map(([id,v])=>{const p=document.createElement('p');p.textContent=`${$('#inventory')?.querySelector(`[data-item="${id}"] strong`)?.textContent||itemName(id)} · 累計取得 ${v.earned} 次`;return p;}));
}
const names={flower:'祝福小花',lamp:'暖光小燈',bird:'同行小鳥',fountain:'活水噴泉',fruit:'祝福果實',fireworks:'跨年煙火',redpacket:'春節紅包',cake:'生日蛋糕',donkey:'小驢',bread:'聖餅',chalice:'聖杯',cross:'十字架',egg:'復活蛋',dumpling:'粽子',mooncake:'月餅',turkey:'火雞',reindeer:'麋鹿'};
export const itemName=id=>names[id]||id;
export async function prepareReading(day,onReady){
 const generation=++readingGeneration;observer?.disconnect();$('#reading-title').textContent=`${day} · 箴言 ${Number(day.slice(-2))} 章`;
 const body=$('.scripture');body.replaceChildren();const status=$('#reading-load-status');status.textContent='正在準備完整經文…';$('#read-complete').disabled=true;$('#read-aloud').disabled=true;
 try{
  let passage=`🌳 根｜箴言 ${Number(day.slice(-2))} 章　🌿 枝｜—　🍎 果｜—`;
  if(day>='2027-01-01'){const result=await memberAPI('plan',{day});passage=result.plan.passage;$('#reading-title').textContent=`${day} · ${result.plan.title}`;}
  const chapters=await loadScheduledChapters(passage);if(generation!==readingGeneration||!$('#reading-dialog').open)return;
  for(const chapter of chapters){const h=document.createElement('h3');h.textContent=chapter.title;body.append(h);chapter.verses.forEach((verse,i)=>{const p=document.createElement('p'),n=document.createElement('sup');n.textContent=String(i+1);p.append(n,document.createTextNode(' '+verse));body.append(p);});}
  const end=document.createElement('p');end.className='reading-end';end.textContent='今天的經文到這裡，讓話語陪你回到生活。';body.append(end);$('#read-aloud').disabled=false;
  status.textContent='慢慢閱讀，讀到經文最後就能記錄完成。';
  observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){$('#read-complete').disabled=false;status.textContent='已讀到最後，可以記錄今天的同行。';onReady();observer.disconnect();}},{root:$('#reading-dialog'),threshold:.5});observer.observe(end);
 }catch(e){if(generation!==readingGeneration)return;status.textContent=`${e.message} 關閉後重新開啟即可重試。`;}
}
export function themeAudio(mode,s,audio){
 if(!MEMBER_MODE)return;
 activeAudio=audio;activePrefs=s;activeMode=mode;
 const music=memberData?.theme?.music||'';
 audio.configure({music:s.music&&(!music||mode!=='garden'),effects:s.sound,musicVolume:s.musicVolume,effectsVolume:s.effectsVolume});
 if(music&&currentTheme!==music){track?.pause();track=new Audio(`../../assets/audio/life-tree/festivals/${music}.wav`);track.loop=true;track.preload='none';currentTheme=music;}
 if(track){track.volume=s.musicVolume*.6;if(s.music&&mode==='garden'&&!document.hidden)void track.play().catch(()=>{$('#audio-status').textContent='點一下開始播放節慶音樂。';});else track.pause();}
}
export function stopThemeAudio(){track?.pause();}
export function cancelReading(){readingGeneration++;observer?.disconnect();}
export function duckTheme(value){if(track&&activePrefs)track.volume=activePrefs.musicVolume*(value?.08:.6);}
export function setupMemberControls({send,getState,openDialog,announce,refresh}){
 $('#team-open').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${iconMarkup('people')}</svg><span>我的同行小組</span>`;
 const show=async(action='team',extra={})=>{openDialog('team-dialog');$('#team-status').textContent='正在連接同行小組…';try{const r=await send(action,extra);renderTeam(r.team);$('#team-status').textContent=action==='join'?'已加入，一起陪伴彼此成長。':'';}catch(e){$('#team-status').textContent=e.message;}};
 function renderTeam(team){
  $('#team-name').textContent=team.group_name||'還沒有編入小組';$('#team-privacy').textContent=team.enabled?'已加入同行；同組家人會看到你的姓名，可以送你關懷。手札保持私人。':'加入後，同組家人會看到你的姓名並互送關懷，手札不分享。';
  $('#team-leave').hidden=!team.enabled;$('#team-join').hidden=team.enabled||!new URLSearchParams(location.search).get('team');
  $('#team-list').replaceChildren(...team.members.map(person=>{const card=document.createElement('div');card.className='team-person';const name=document.createElement('strong');name.textContent=person.name+(person.self?'（你）':'');const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=person.self?'一起同行':person.sent_today?'今天已送關懷':'送一份關懷 ♥';button.disabled=person.self||person.sent_today;button.onclick=async()=>{const note=$('#care-message').value;button.disabled=true;try{await send('care',{recipient:person.id,message:note});$('#team-status').textContent='關懷已送達，為家人補充 HP +10、MP +15。';await show();}catch(e){$('#team-status').textContent=e.message;button.disabled=false;}};card.append(name,button);return card;}));
  $('#received-care').replaceChildren(...team.received.map(c=>{const p=document.createElement('p');p.textContent=`${c.name} 送來關懷${c.message?'：'+c.message:' ♥'}`;return p;}));
 }
 $('#team-open').onclick=()=>void show();
 $('#team-join').onclick=()=>void show('join',{token:new URLSearchParams(location.search).get('team')});
 $('#team-leave').onclick=()=>void show('leave');
 $('#team-invite').onclick=async()=>{try{const r=await send('invite'),url=new URL('member.html',location.href);url.searchParams.set('team',r.team.invite);$('#team-invite-url').value=url.href;$('#team-invite-url').hidden=false;renderTeam(r.team);if(navigator.share){try{await navigator.share({title:'一起照顧生命樹',text:'因為有你，這個家更美好。一起讀經、彼此關懷。',url:url.href});return;}catch(e){if(e.name==='AbortError')return;}}await navigator.clipboard.writeText(url.href);$('#team-status').textContent='邀請連結已複製，貼到小組群組即可。七天內有效。';}catch(e){$('#team-status').textContent=$('#team-invite-url').value?'可長按上方連結複製分享。':e.message;}};
 $('#member-refresh').onclick=()=>void refresh();
 $('#makeup-open').onclick=()=>{const input=$('#makeup-date'),s=getState();input.max=memberData.today;input.min=[s.startDate,new Date(Date.parse(memberData.today+'T12:00:00Z')-7*864e5).toISOString().slice(0,10)].sort().at(-1);input.value=memberData.today;openDialog('makeup-dialog');};
 document.addEventListener('click',e=>{if(e.isTrusted&&activeAudio&&activePrefs)themeAudio(activeMode,activePrefs,activeAudio);},{capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopThemeAudio();else if(activeAudio&&activePrefs)themeAudio(activeMode,activePrefs,activeAudio);});
 const invite=new URLSearchParams(location.search).get('team');if(/^[0-9a-f-]{36}$/.test(invite||''))void show();
}
