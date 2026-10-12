import {festivalMusicURL} from '../../life-tree-festival-audio.mjs?v=20261012-goodfriday1';
import {loadScheduledChapters} from '../../bible-scripture-loader.mjs';
import {mountGardenScene} from './tree-game-scenes.mjs?v=20261012-scenes1';
import {iconMarkup} from '../../app-icons.mjs';
const API='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/tree-garden';
const OCTOBER_API='https://svwgfgyxxgbqabosriom.supabase.co/functions/v1/tree-reading-october-test';
const OCTOBER_LIFF='2011645391-9t2SxuSG';
const OCTOBER_MODE=document.body.dataset.octoberTest==='true';
export const MEMBER_MODE=document.body.dataset.memberGarden==='true';
export let memberData=null;
let readingGeneration=0;let token='',observer=null,track=null,currentTheme='',activeAudio=null,activePrefs=null,activeMode='garden';
const $=s=>document.querySelector(s);
const messages={login_required:'登入已到期，請重新從 LINE 開啟。',binding_required:'請先完成教會會友身分綁定，再回來開啟小樹。',conflict:'另一個畫面剛更新進度，請先重新整理再繼續。',unavailable:'連線暫時沒有完成，請先重新整理確認進度。',already_full:'目前已經補滿了，先把寶物留在裝備包吧。',item_unavailable:'這件小物還在收集中，累積讀經就能再取得。',rest_needed:'先回到花園休息，讀經或收到關懷可補充信心 HP。',mp_needed:'盼望 MP 不夠了，先讀經、澆水、寫手札或領取關懷。',group_required:'目前尚未編入小組，請同工協助設定後再組隊。',invite_invalid:'邀請已過期，或與你目前所屬的小組不同。',care_limit:'今天的關懷已送滿，或這位家人已收到三份關懷。',care_forbidden:'這位家人目前不在你的同行小組。',date_not_allowed:'只能完成今日或最近七天內可補讀的日期。',read_first:'先完成這一天的讀經，再澆水或寫手札。',stale_event:'事件進度已更新，請回花園開啟目前的事件。',content_empty:'這一天的教會讀經內容尚未發布，請稍後再來。'};
if(OCTOBER_MODE){messages.rest_needed='先回花園歇一歇，讀經或祝福小花能補充信心 HP。';messages.mp_needed='先讀經、澆水、寫手札，或使用暖光小燈補充盼望 MP。';}
function entryURL(){if(OCTOBER_MODE)return `https://liff.line.me/${OCTOBER_LIFF}`;const url=new URL('../../line-member.html',location.href);url.searchParams.set('church','M+');url.searchParams.set('feature','tree');const invite=new URLSearchParams(location.search).get('team');if(/^[0-9a-f-]{36}$/.test(invite||''))url.searchParams.set('team',invite);return url.href;}
export async function memberAPI(action,extra={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const r=await fetch(OCTOBER_MODE?OCTOBER_API:API,{method:'POST',cache:'no-store',credentials:'omit',signal:controller.signal,headers:{'content-type':'application/json',...(OCTOBER_MODE?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(OCTOBER_MODE?{...extra,action:'garden_game',command:action}:{action,idToken:token,...extra})});const data=await r.json().catch(()=>({}));if(!r.ok||data.ok!==true){const e=new Error(messages[data.error]||({join_required:'請輸入原本的同工邀請碼，加入箴言讀經測試。',test_closed:'十月箴言測試已結束，原有紀錄仍保留。'}[data.error])||'暫時無法完成，請重新整理後再試。');e.code=data.error;throw e;}if(data.state&&(!memberData||data.version>=memberData.version))memberData=data;return data;
 }catch(e){if(e.name==='AbortError')throw new Error('等待連線逾時，請先重新整理確認是否已保存。');throw e;}finally{clearTimeout(timer);}
}
export async function initMember(){
 if(!MEMBER_MODE)return null;
 if(OCTOBER_MODE){
  document.querySelector('.demo-note').textContent='十月箴言計畫 · 每天讀日期對應的一章。讀經、澆水與手札沿用原測試紀錄。';
  $('#reading-load-status').textContent='每天一章箴言，讀到最後即可完成；最近七天可補讀。';
  $('#member-login-status').textContent='正在確認同工測試 LINE 身分…';$('#member-login-link').href=entryURL();$('#member-login-link').textContent='從原本的 LINE 測試連結開啟';
  const info=document.createElement('p');info.className='muted';info.textContent='沿用同工測試身分與邀請碼，資料保存在原十月測試環境。';$('#member-gate').append(info);
  const oldLink=$('#member-gate a.secondary');oldLink.href=new URL('../../tree-reading-october-test.html?legacy=1',document.baseURI).href;oldLink.textContent='原版讀經與紀錄';
  const links=document.createElement('nav');links.className='october-reading-links';links.setAttribute('aria-label','箴言讀經計畫');
  for(const [label,query] of [['原版讀經與紀錄','?legacy=1'],['每日靈修試閱','?view=devotional&church=M%2B&preview=1&from=october-tree']]){const a=document.createElement('a');a.className='quiet-button';a.href=new URL('../../tree-reading-october-test.html'+query,document.baseURI).href;a.textContent=label;links.append(a);}
  document.querySelector('.garden-sidebar').append(links);
  try{await window.liff.init({liffId:OCTOBER_LIFF});if(!window.liff.isInClient()||!window.liff.isLoggedIn())throw Error('請從原本的 LINE 同工測試連結開啟新版。');token=window.liff.getIDToken()||'';if(!token)throw Error('LINE 登入尚未完成，請重新開啟同工測試連結。');}
  catch(e){$('#member-login-status').textContent=e.message;throw Error('member_login_required');}
 }else{
 try{token=sessionStorage.getItem('line-member-token:M+')||'';}catch{}
 }
 $('#member-login-link').href=entryURL();
 if(!token){$('#member-login-status').textContent='從 LINE 登入，才能保存你的花園與讀經進度。';throw Error('member_login_required');}
 try{const data=await memberAPI('me');document.body.dataset.memberReady='true';$('#member-gate').hidden=true;return data.state;}
 catch(e){$('#member-login-status').textContent=e.message;if(OCTOBER_MODE&&e.code==='join_required')octoberJoinForm();throw e;}
}
function octoberJoinForm(){
 const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button');
 label.textContent='同工邀請碼';input.type='password';input.autocomplete='one-time-code';input.required=true;input.maxLength=64;label.append(input);button.type='submit';button.className='primary';button.textContent='加入箴言讀經測試';form.append(label,button);$('#member-gate').append(form);
 form.onsubmit=async event=>{event.preventDefault();button.disabled=true;$('#member-login-status').textContent='正在加入同工測試…';try{const response=await fetch(OCTOBER_API,{method:'POST',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({action:'join',inviteCode:input.value.trim()})}),data=await response.json();if(!response.ok||data.ok!==true)throw Error(data.error==='invite_invalid'?'邀請碼不正確，請確認同工群組公告後再試。':'暫時無法加入，請稍後重試。');location.reload();}catch(e){$('#member-login-status').textContent=e.message;button.disabled=false;}};
}
export function preferences(){let p={};try{p=JSON.parse(localStorage.getItem('mplus-garden-audio')||'{}');}catch{}return {music:p.music===true,sound:p.sound===true,musicVolume:Number.isFinite(p.musicVolume)?p.musicVolume:.45,effectsVolume:Number.isFinite(p.effectsVolume)?p.effectsVolume:.65};}
export function savePreferences(s){try{localStorage.setItem('mplus-garden-audio',JSON.stringify({music:s.music,sound:s.sound,musicVolume:s.musicVolume,effectsVolume:s.effectsVolume}));}catch{}}
export function renderMember(s){
 if(!MEMBER_MODE||!memberData)return;
 $('#member-name').textContent=memberData.profile.name;$('#combat-life').textContent=`信心 HP ${s.life.hp}／100 · 盼望 MP ${s.life.mp}／100`;
 for(const kind of ['hp','mp']){$(`#life-${kind}`).value=s.life[kind];$(`#life-${kind}-value`).textContent=`${s.life[kind]}／100`;}
 $('#buff-status').textContent=s.buffs.reading?`已收藏 ${s.buffs.reading} 次讀經雙倍：20 → 40 XP`:'每天讀經補充信心 HP +40、盼望 MP +20。';
 $('#care-boost').textContent=OCTOBER_MODE?(s.buffs.care?`活水祝福 ${s.buffs.care} 次：下次澆水，HP、MP 各多補 10`:'澆水與拾光手札各補充 MP +10。'):s.buffs.care?`活水祝福 ${s.buffs.care} 次：下次收到關懷再補 HP、MP 各 10`:'澆水與拾光手札各補充 MP +10。';
 $('#rest-notice').hidden=s.life.hp>0;if(OCTOBER_MODE)$('#rest-notice').textContent='先在花園歇一歇，讀經或祝福小花能補充信心。你的等級、收藏和事件進度都會保留。';
 const daily=document.createElement('p'),reward=s.dailyGrace?.[memberData.today];daily.textContent=reward?`今天已獲得：${itemName(reward)}。明天讀經完成，再收集一件。`:'完成今天的讀經，隨機獲得一件恩典小物；每天一次，補讀不額外發放。';
 $('#next-collectibles').replaceChildren(daily,...['flower','lamp','bird','fountain','fruit'].map(id=>{const p=document.createElement('p');p.textContent=`${itemName(id)} · 背包 ${s.inventory[id]?.count||0} 份`;return p;}));
 const theme=memberData.theme;$('#festival-label').textContent=theme.name;
 const layer=$('#member-festival');
 mountGardenScene(layer,theme);
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
 const source=music?festivalMusicURL(memberData.theme):'';
 audio.configure({music:s.music&&(!music||mode!=='garden'),effects:s.sound,musicVolume:s.musicVolume,effectsVolume:s.effectsVolume});
 if(source&&currentTheme!==source){track?.pause();track=new Audio(source);track.loop=true;track.preload='none';currentTheme=source;}
 if(track){track.volume=s.musicVolume*.6;if(music&&s.music&&mode==='garden'&&!document.hidden)void track.play().catch(()=>{$('#audio-status').textContent='點一下開始播放節慶音樂。';});else track.pause();}
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
 $('#team-open').onclick=()=>{if(OCTOBER_MODE){openDialog('team-dialog');$('#team-name').textContent='同工箴言測試';$('#team-privacy').textContent='這裡沿用十月隔離測試身分。正式的小組邀請與彼此關懷，請從會友花園使用。';document.querySelector('#team-dialog .team-actions').hidden=true;$('#care-message').closest('label').hidden=true;$('#team-invite-url').hidden=true;$('#team-list').replaceChildren();$('#received-care').replaceChildren();const a=document.createElement('a');a.className='primary';a.href=new URL('../../line-member.html?church=M%2B&feature=tree',document.baseURI).href;a.textContent='開啟正式會友花園';$('#team-status').replaceChildren(a);return;}void show();};
 $('#team-join').onclick=()=>void show('join',{token:new URLSearchParams(location.search).get('team')});
 $('#team-leave').onclick=()=>void show('leave');
 $('#team-invite').onclick=async()=>{try{const r=await send('invite'),url=new URL('member.html',location.href);url.searchParams.set('team',r.team.invite);$('#team-invite-url').value=url.href;$('#team-invite-url').hidden=false;renderTeam(r.team);if(navigator.share){try{await navigator.share({title:'一起照顧生命樹',text:'因為有你，這個家更美好。一起讀經、彼此關懷。',url:url.href});return;}catch(e){if(e.name==='AbortError')return;}}await navigator.clipboard.writeText(url.href);$('#team-status').textContent='邀請連結已複製，貼到小組群組即可。七天內有效。';}catch(e){$('#team-status').textContent=$('#team-invite-url').value?'可長按上方連結複製分享。':e.message;}};
 $('#member-refresh').onclick=()=>void refresh();
 $('#makeup-open').onclick=()=>{const input=$('#makeup-date'),s=getState();input.max=memberData.today;input.min=[s.startDate,new Date(Date.parse(memberData.today+'T12:00:00Z')-7*864e5).toISOString().slice(0,10)].sort().at(-1);input.value=memberData.today;openDialog('makeup-dialog');};
 document.addEventListener('click',e=>{if(e.isTrusted&&activeAudio&&activePrefs)themeAudio(activeMode,activePrefs,activeAudio);},{capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopThemeAudio();else if(activeAudio&&activePrefs)themeAudio(activeMode,activePrefs,activeAudio);});
 const invite=new URLSearchParams(location.search).get('team');if(!OCTOBER_MODE&&/^[0-9a-f-]{36}$/.test(invite||''))void show();
}
