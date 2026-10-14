import {SceneMusicPlayer} from '../../life-tree-music-player.mjs?v=20261012-musicload1';
import {festivalMusicURL} from '../../life-tree-festival-audio.mjs?v=20261012-musicload1';
import {loadScheduledChapters} from '../../bible-scripture-loader.mjs';
import {mountGardenScene} from './tree-game-scenes.mjs?v=20261012-scenes1';
import {iconMarkup} from '../../app-icons.mjs';
const API='https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/tree-garden';
const OCTOBER_API='https://svwgfgyxxgbqabosriom.supabase.co/functions/v1/tree-reading-october-test';
const OCTOBER_LIFF='2011645391-9t2SxuSG';
const OCTOBER_MODE=document.body.dataset.octoberTest==='true';
export const MEMBER_MODE=document.body.dataset.memberGarden==='true';
const TEAM_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM_INVITE_KEY='mplus-october-team-invite';
function urlTeamInvite(){
 const params=new URLSearchParams(location.search);
 const direct=params.get('team');if(TEAM_UUID.test(direct||''))return direct.toLowerCase();
 // LINE may carry the query in liff.state before its second redirect.
 try{const nested=new URL(params.get('liff.state')||'',location.origin).searchParams.get('team');if(TEAM_UUID.test(nested||''))return nested.toLowerCase();}catch{}
 return '';
}
let pendingInvite=urlTeamInvite();
if(OCTOBER_MODE){try{if(pendingInvite)sessionStorage.setItem(TEAM_INVITE_KEY,pendingInvite);else{const saved=sessionStorage.getItem(TEAM_INVITE_KEY);if(TEAM_UUID.test(saved||''))pendingInvite=saved.toLowerCase();}}catch{}}
function clearTeamInvite(){
 pendingInvite='';if(OCTOBER_MODE){try{sessionStorage.removeItem(TEAM_INVITE_KEY);}catch{}}
 const url=new URL(location.href);url.searchParams.delete('team');
 try{const nested=new URL(url.searchParams.get('liff.state')||'',location.origin);if(nested.searchParams.has('team')){nested.searchParams.delete('team');if(nested.search)url.searchParams.set('liff.state',nested.pathname+nested.search);else url.searchParams.delete('liff.state');}}catch{}
 try{history.replaceState(history.state,'',url.href);}catch{}
}
export let memberData=null;
let readingGeneration=0;let token='',observer=null,activeAudio=null,activePrefs=null,activeMode='garden';
const $=s=>document.querySelector(s);
const themePlayer=new SceneMusicPlayer();
const messages={login_required:'登入已到期，請重新從 LINE 開啟。',binding_required:'請先完成教會會友身分綁定，再回來開啟小樹。',conflict:'另一個畫面剛更新進度，請先重新整理再繼續。',unavailable:'連線暫時沒有完成，請先重新整理確認進度。',already_full:'目前已經補滿了，先把寶物留在裝備包吧。',item_unavailable:'這件小物還在收集中，累積讀經就能再取得。',rest_needed:'先回到花園休息，讀經或收到關懷可補充信心 HP。',mp_needed:'盼望 MP 不夠了，先讀經、澆水、寫手札或領取關懷。',group_required:'目前尚未編入小組，請同工協助設定後再組隊。',invite_invalid:'邀請已過期，或與你目前所屬的小組不同。',care_limit:'今天的關懷已送滿，或這位家人已收到三份關懷。',care_forbidden:'這位家人目前不在你的同行小組。',date_not_allowed:'只能完成今日或最近七天內可補讀的日期。',read_first:'先完成這一天的讀經，再澆水或寫手札。',stale_event:'事件進度已更新，請回花園開啟目前的事件。',content_empty:'這一天的教會讀經內容尚未發布，請稍後再來。'};
if(OCTOBER_MODE){messages.rest_needed='先回花園歇一歇，讀經、祝福小花或同工的關懷能補充信心 HP。';messages.mp_needed='先讀經、澆水、寫手札，或收到同工關懷，補充盼望 MP。';messages.invite_invalid='這份組隊邀請已失效，請邀請你的同工重新分享連結。';messages.team_already_joined='你已在另一個隊伍。請先離開目前隊伍，再接受這份邀請。';messages.care_forbidden='這位同工目前不在你的測試隊伍，請重新整理隊伍。';messages.invalid_message='鼓勵的話請保持在 120 字內。';messages.mission_wrong='再看看這段經文，換一個答案試試；不會扣信心或盼望。';messages.mission_answer_first='先完成今日的經文題，再來進行花園行動。';messages.mission_unavailable='今天沒有節慶任務，請查看目前的花園。';}
function entryURL(){const url=OCTOBER_MODE?new URL(`https://liff.line.me/${OCTOBER_LIFF}`):new URL('../../line-member.html',location.href);if(!OCTOBER_MODE){url.searchParams.set('church','M+');url.searchParams.set('feature','tree');}if(pendingInvite)url.searchParams.set('team',pendingInvite);return url.href;}
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
  if(pendingInvite){const notice=document.createElement('p');notice.className='muted';notice.textContent='你收到一份同工組隊邀請。須先具備同工測試資格；組隊連結不能取代原本的同工邀請碼。登入後再由你確認加入。';$('#member-gate').append(notice);}
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
 $('#care-boost').textContent=OCTOBER_MODE?(s.buffs.care?`活水祝福 ${s.buffs.care} 次：下次澆水，HP、MP 各多補 10；同工關懷補 HP +10、MP +15。`:'澆水與拾光手札各補 MP +10；同工關懷補 HP +10、MP +15。'):s.buffs.care?`活水祝福 ${s.buffs.care} 次：下次收到關懷再補 HP、MP 各 10`:'澆水與拾光手札各補充 MP +10。';
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
 themePlayer.sync(source,!!music&&s.music&&mode==='garden',s.musicVolume*.6);
 if(navigator.userActivation?.isActive)themePlayer.gesture();
}
export function stopThemeAudio(){themePlayer.pause();}
export function cancelReading(){readingGeneration++;observer?.disconnect();}
export function duckTheme(value){themePlayer.duck(value);}
export function setupMemberControls({send,getState,openDialog,announce,refresh,isOnboarding=()=>false}){
 const teamLabel=OCTOBER_MODE?'同工組隊':'我的同行小組';
 $('#team-open').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${iconMarkup('people')}</svg><span>${teamLabel}</span>`;
 if(OCTOBER_MODE){$('#team-title').textContent='同工同行小隊';$('#team-invite').textContent='邀請同工組隊';$('#team-leave').textContent='離開目前隊伍';$('#team-invite-url').setAttribute('aria-label','同工組隊連結，可複製分享');}
 const teamRefresh=document.createElement('button');teamRefresh.id='team-refresh';teamRefresh.type='button';teamRefresh.className='quiet-button';teamRefresh.textContent='更新隊伍與關懷';$('#team-list').before(teamRefresh);
 let teamBusy=false,confirmedTeam=null;
 const setTeamBusy=value=>{teamBusy=value;$('#team-dialog').setAttribute('aria-busy',String(value));$('#team-dialog').querySelectorAll('.team-actions button,#team-list button,#team-refresh').forEach(button=>{button.disabled=value||button.dataset.unavailable==='true';});};
 const show=async(action='team',extra={})=>{
  if(teamBusy)return;openDialog('team-dialog');setTeamBusy(true);$('#team-status').textContent='正在連接同行隊伍…';
  try{const r=await send(action,extra);if(action==='join')clearTeamInvite();if(action==='leave'){$('#team-invite-url').value='';$('#team-invite-url').hidden=true;}renderTeam(r.team);$('#team-status').textContent=action==='join'?'已加入，一起陪伴彼此成長。':action==='leave'?'已離開隊伍。讀經與花園進度都保留。':'';}
  catch(e){if(action==='join'&&e.code==='invite_invalid'){clearTeamInvite();renderTeam(confirmedTeam);}$('#team-status').textContent=e.message;}finally{setTeamBusy(false);}
 };
 function renderTeam(team){
  team=team||{enabled:false,members:[],received:[]};
  confirmedTeam=team;
  $('#team-name').textContent=team.enabled?team.group_name:OCTOBER_MODE?'邀請熟悉的同工，一起測試彼此關懷':'還沒有編入小組';
  $('#team-privacy').textContent=OCTOBER_MODE?(team.enabled?'這是同工測試隊伍。隊友會看到你的姓名，可互送關懷；手札保持私人。':'只有已加入箴言同工測試的人才能接受邀請。加入後隊友會看到姓名，手札不分享。'):(team.enabled?'已加入同行；同組家人會看到你的姓名，可以送你關懷。手札保持私人。':'加入後，同組家人會看到你的姓名並互送關懷，手札不分享。');
  if(pendingInvite)$('#team-privacy').textContent+=team.enabled?' 你另有一份組隊邀請；若屬不同隊伍，須先離開目前隊伍。':' 你收到一份組隊邀請，按「接受邀請」即可加入。';
  $('#team-leave').hidden=!team.enabled;$('#team-join').hidden=!pendingInvite;$('#team-invite').hidden=!!pendingInvite&&!team.enabled;
  $('#care-message').closest('label').hidden=!team.enabled;
  const members=Array.isArray(team.members)?team.members:[];
  $('#team-list').replaceChildren(...members.map(person=>{
   const card=document.createElement('div');card.className='team-person';const name=document.createElement('strong');name.textContent=person.name+(person.self?'（你）':'');
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=person.self?'一起同行':person.sent_today?'今天已送關懷':'送一份關懷 ♥';button.dataset.unavailable=String(person.self||person.sent_today);button.disabled=teamBusy||person.self||person.sent_today;
   button.onclick=async()=>{
    if(teamBusy)return;const note=$('#care-message').value;setTeamBusy(true);$('#team-status').textContent='正在送出這份關懷…';
    try{const r=await send('care',{recipient:person.id,message:note});renderTeam(r.team);const care=r.care;$('#team-status').textContent=care?.already_sent?'今天已向這位同工送過關懷，不會重複補充。':care?`關懷已送達，補充信心 HP +${care.hp_delta}、盼望 MP +${care.mp_delta}（最高 100）。`:'關懷已送達，為家人補充 HP +10、MP +15。';}
    catch(e){$('#team-status').textContent=e.message;}finally{setTeamBusy(false);}
   };card.append(name,button);return card;
  }));
  if(OCTOBER_MODE&&team.enabled&&members.length===1){const p=document.createElement('p');p.className='muted';p.textContent='隊伍已準備好。把邀請連結傳給另一位同工，對方接受後，就能互送關懷。';$('#team-list').append(p);}
  $('#received-care').replaceChildren(...(team.received||[]).map(c=>{const p=document.createElement('p');p.textContent=`${c.name} 送來關懷${c.message?'：'+c.message:' ♥'}`;return p;}));
 }
 $('#team-open').onclick=()=>void show();
 teamRefresh.onclick=()=>void show();
 $('#team-join').onclick=()=>void show('join',{token:pendingInvite});
 $('#team-leave').onclick=()=>void show('leave');
 $('#team-invite').onclick=async()=>{
  if(teamBusy)return;setTeamBusy(true);$('#team-invite-url').value='';$('#team-invite-url').hidden=true;$('#team-status').textContent='正在準備組隊邀請…';
  try{
   const r=await send('invite');if(!TEAM_UUID.test(r.team?.invite||''))throw Error('邀請連結暫時未能產生，請再試一次。');
   const url=OCTOBER_MODE?new URL(`https://liff.line.me/${OCTOBER_LIFF}`):new URL('member.html',location.href);url.searchParams.set('team',r.team.invite);$('#team-invite-url').value=url.href;$('#team-invite-url').hidden=false;renderTeam(r.team);
   const expires=OCTOBER_MODE?'七天內有效，最晚十月底到期；產生新連結會使你上一份連結失效。':'七天內有效。';
   $('#team-status').textContent=`邀請已準備好，可長按上方連結複製。${expires}`;
   if(navigator.share){try{await navigator.share({title:OCTOBER_MODE?'同工箴言讀經 · 一起組隊':'一起照顧生命樹',text:OCTOBER_MODE?'邀請已加入同工測試的你，一起讀經、彼此關懷。':'因為有你，這個家更美好。一起讀經、彼此關懷。',url:url.href});return;}catch(e){if(e.name==='AbortError')return;}}
   await navigator.clipboard.writeText(url.href);$('#team-status').textContent=`邀請連結已複製，貼到${OCTOBER_MODE?'同工':'小組'}群組即可。${expires}`;
  }catch(e){$('#team-status').textContent=$('#team-invite-url').value?'可長按上方連結複製分享。':e.message;}finally{setTeamBusy(false);}
 };
 $('#member-refresh').onclick=()=>void refresh();
 $('#makeup-open').onclick=()=>{const input=$('#makeup-date'),s=getState();input.max=memberData.today;input.min=[s.startDate,new Date(Date.parse(memberData.today+'T12:00:00Z')-7*864e5).toISOString().slice(0,10)].sort().at(-1);input.value=memberData.today;openDialog('makeup-dialog');};
 document.addEventListener('click',e=>{if(e.isTrusted&&activeAudio&&activePrefs){themeAudio(activeMode,activePrefs,activeAudio);themePlayer.gesture(Boolean(e.target.closest?.('#audio-start')));}},{capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopThemeAudio();else if(activeAudio&&activePrefs)themeAudio(activeMode,activePrefs,activeAudio);});
 const offerInvite=()=>{if(pendingInvite&&!isOnboarding()&&!document.querySelector('dialog[open]'))void show();};
 if(pendingInvite){document.addEventListener('garden-opening-complete',()=>setTimeout(offerInvite,0),{once:true});if(!getState().avatarId)$('#avatar-dialog').addEventListener('close',offerInvite,{once:true});queueMicrotask(offerInvite);}
}
