import { loadScheduledChapters } from './bible-scripture-loader.mjs?v=20261010-deadline1';
import { renderLifeTree } from './tree-reading-october-art.mjs?v=20261008-regressions';
import { OCTOBER_TEST_API, OCTOBER_TEST_LIFF_ID, OCTOBER_TEST_WINDOW } from './tree-reading-october-test-config.mjs?v=20260929-login-fallback';

const $ = (selector) => document.querySelector(selector);
const state = { idToken:'', participant:null, records:[], challenges:[], notes:[], leaderboard:[], garden:[], admin:false, view:'personal', passage:null, sound:musicPreference(),writeBusy:false, journalIndex:0, loadedScriptureDate:'',pendingWaterDate:'' };
let scriptureEndObserver=null, scriptureRequest=0, viewRequest=0;
let dismissedDevotionalKey='';
function devotionalDockKey(){return state.participant?.id?`october-devotional-dismissed:${state.participant.id}:${today()}`:'';}
function dismissDevotionalDock(){const key=devotionalDockKey();dismissedDevotionalKey=key;try{if(key)sessionStorage.setItem(key,'1');}catch{}syncDevotionalDock();}
function measureDevotionalDock(){const dock=$('#devotional-dock');if(!dock.hidden)document.body.style.setProperty('--devotional-dock-space',`${Math.ceil(dock.getBoundingClientRect().height)+32}px`);}
function syncDevotionalDock(){
  const key=devotionalDockKey();let dismissed=Boolean(key&&dismissedDevotionalKey===key);try{dismissed||=Boolean(key&&sessionStorage.getItem(key)==='1');}catch{}
  const available=Boolean(state.participant&&record()?.watered_at&&!dismissed);
  const editing=document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  const upper=$('#devotional-preview-link').getBoundingClientRect(),upperVisible=upper.height>0&&upper.top>=0&&upper.bottom<=innerHeight;
  $('#devotional-dock').hidden=!available||Boolean(editing)||upperVisible;document.body.classList.toggle('has-devotional-dock',available);measureDevotionalDock();
}
function musicPreference(){try{return localStorage.getItem('lifeTreeSound')!=='off';}catch{return true;}}
function restoreTreeScroll(){if(!state.participant)return;try{const value=sessionStorage.getItem('october-tree-return-scroll');if(value!==null){sessionStorage.removeItem('october-tree-return-scroll');requestAnimationFrame(()=>window.scrollTo({top:Number(value)||0,behavior:'instant'}));}}catch{}}
function draftKey(){return state.participant?.id?`october-tree-draft:${state.participant.id}`:'';}
function rememberMusic(){try{localStorage.setItem('lifeTreeSound',state.sound?'on':'off');}catch{}}
function scrollToSection(node){if(!node)return;node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function renderInvitation(){const visible=Boolean(record()?.watered_at);$('#devotional-invitation').hidden=!visible;syncDevotionalDock();$('#journey-date').textContent=`${fmt(today())} · 箴言 ${chapterDay(today())} 章`;$('#journey-passage').textContent=visible?'活水已澆灌，讓神的話繼續陪伴。':record()?'讀經完成，回到小樹澆水。':'今天，讓神的話滋養你。';$('#read-today').textContent=visible?'重讀今日經文':record()?'回到小樹澆水':'開始今日讀經';}

const today = () => {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=(type)=>parts.find((item)=>item.type===type)?.value||'';return `${part('year')}-${part('month')}-${part('day')}`;};
const fmt = (date) => `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
const chapterDay = (date) => Number(date.slice(8,10));
const isLaunch = () => today() >= OCTOBER_TEST_WINDOW.start && today() <= OCTOBER_TEST_WINDOW.end;
const prompt = (date=today()) => `🌳 根｜箴言 ${chapterDay(date)}　🌿 枝｜—　🍎 果｜—`;
const labels = {worm:{icon:'🐛',title:'小樹蟲來了',text:'嫩葉正遇到小小蟲害。陪它除蟲，保護剛長出的新芽。',button:'🪲 幫小樹除蟲',action:'pest'},wind:{icon:'💨',title:'一陣強風吹來',text:'枝葉被吹得搖晃，扶好枝條，陪小樹站穩。',button:'🌿 扶好枝條',action:'support'},typhoon:{icon:'🌧️',title:'風雨考驗',text:'雨勢和風讓樹根不太安穩，守護根部就能恢復。',button:'🛡️ 守護樹根',action:'guard'},trouble:{icon:'🪵',title:'樹枝需要整理',text:'掉落的枝條需要清理，整理後新芽就能再次生長。',button:'🌱 整理樹枝',action:'repair'}};
const weatherWords = {sunny:'晴朗', 'partly-cloudy':'多雲時晴', cloudy:'多雲', rain:'降雨', 'cold-rain':'降雨', storm:'雷雨', windy:'強風'};
let weather = {code:2,wind:8,temp:24,mood:'partly-cloudy',updated:''};

async function api(action, extra={}) {
  let response;try{response = await fetch(OCTOBER_TEST_API,{method:'POST',credentials:'omit',cache:'no-store',headers:{'content-type':'application/json',authorization:`Bearer ${state.idToken}`},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)});}catch{throw new Error('連線暫時中斷或等待過久，請確認網路後重試。');}
  let data;try{data=await response.json();}catch{throw new Error('回應不完整，請重新整理進度確認後再試。');}
  if(!data||typeof data!=='object')throw new Error('回應不完整，請重新整理進度確認後再試。');
  if (!response.ok||data.error||data.ok===false) { const messages={invite_invalid:'邀請碼不正確，請回同工群組確認。',not_authorized:'這個 LINE 帳號尚未獲邀參加測試。',test_closed:'十月測試目前未開放。',staff_required:'只有授權同工可以查看管理統計。',join_required:'請輸入同工邀請碼加入測試。',read_first:'請先記錄讀經，再回來澆水。',challenge_not_found:'這個挑戰已處理，請重新整理。',resolution_invalid:'請使用這個挑戰提供的處理方式。',date_not_allowed:'這個日期目前不能記錄。'}; const e=new Error(messages[data.error]||'連線暫時中斷，請稍後重試。'); e.code=data.error; throw e; }
  return data;
}
function record(date=today()){return state.records.find((r)=>r.reading_date===date)}
function progressStats(){const n=state.records.filter(r=>r.completion_type==='on_time').length,l=state.records.filter(r=>r.completion_type==='makeup').length; let streak=0; for(let i=30;i>=0;i--){const d=`2026-10-${String(i+1).padStart(2,'0')}`;if(d>today())continue;if(record(d))streak++;else break;}let misses=0;for(let i=Math.min(30,chapterDay(today())-2);i>=0;i--){if(record(`2026-10-${String(i+1).padStart(2,'0')}`))break;misses++;}return{onTime:n,late:l,streak,missedStreak:today()<'2026-10-01'?0:misses,growth:Math.round((n+l)/31*100),health:Math.max(20,100-misses*13),personalEvents:state.challenges.filter(c=>c.status==='active').map(c=>({type:c.challenge_type,impact:12})),blessingCount:state.notes.length,logs:Object.fromEntries(state.records.map(r=>[r.reading_date,{kind:r.completion_type}]))};}
function season(){const month=Number(today().slice(5,7));return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter'}
function challengeFx(type){const cls=type==='worm'?'care-pest-active':'care-water-active';const art=$('#tree-art');art.classList.add(cls);const fx=document.createElement('div');fx.className='care-animation';fx.setAttribute('aria-hidden','true');fx.innerHTML=type==='worm'?'<span class="pest-bug">🐛</span><span class="pest-spray">✨</span>':type==='celebration'?'<span class="celebration-piece celebration-one">🎉</span><span class="celebration-piece celebration-two">✨</span><span class="celebration-piece celebration-three">🌟</span><span class="celebration-piece celebration-four">🎊</span><span class="celebration-piece celebration-five">💛</span>':'<span class="water-drop drop-one">💧</span><span class="water-drop drop-two">💧</span><span class="water-drop drop-three">💧</span><span class="care-sparkle sparkle-one">✦</span><span class="care-sparkle sparkle-two">✦</span><span class="care-sparkle sparkle-three">✦</span>';art.append(fx);setTimeout(()=>{art.classList.remove(cls);fx.remove();},2600);}
function showStatus(text,where='#reading-status'){const node=$(where);if(node)node.textContent=text;}
function setReadingContext(date=today()){const isMakeup=date!==today();$('#reading-eyebrow').textContent=isMakeup?'MAKEUP READING':"TODAY'S READING";$('#reading-heading').textContent=isMakeup?'補讀經文':'今天的讀經';$('#reading-date').textContent=fmt(date);$('#passage-title').textContent=`箴言 ${today()<'2026-10-01'?1:chapterDay(date)} 章`;$('#passage-detail').textContent=today()<'2026-10-01'?'10 月 1 日開始；加入前日期已保送。':isMakeup?`${fmt(date)} · 補讀經文載入中…`:'完整讀完後回到樹下記錄，接著澆水。';}
function missedMessage(n){return n===1?'今天葉子開始泛黃，回來讀經就能恢復。':n===2?'兩天沒讀，葉片慢慢垂下；補讀就能重新照顧小樹。':n>=3?`連續漏讀 ${n} 天，樹的成長退回一步；補讀後就會恢復。`:''}
function renderTree(){const stats=progressStats(),active=state.challenges.find(c=>c.status==='active');const art=$('#tree-art');art.dataset.weather=weather.mood;art.dataset.season=season();art.dataset.health=stats.missedStreak>=3?'wilted':stats.missedStreak?'yellow':'healthy';art.innerHTML=renderLifeTree({id:'oct',name:state.participant?.display_name||'同工'},stats,today(),false,weather.mood,12,'test');$('.tree-card')?.setAttribute('data-weather',weather.mood);$('#tree-date-label').textContent=today()<'2026-10-01'?'COMING SOON · OCT 01':`OCTOBER · ${fmt(today())}`;$('#tree-title').textContent=`${state.participant?.display_name||'同工'}的生命樹`;if(!state.loadedScriptureDate)setReadingContext(today());
  const status=active?`${labels[active.challenge_type]?.title||'生命中的挑戰'} · 請幫小樹一起面對`:missedMessage(stats.missedStreak)||(state.records.length?'葉片翠綠，正在穩穩成長。':'小樹正在等候第一道活水 ✨');$('#tree-mood').textContent=status;
  $('#health-badge').textContent=active?'🌧️ 需要陪伴':stats.missedStreak>=3?'🍂 需要照料':stats.missedStreak?'🌿 回來就會好':'🌱 生長中';
  $('#tree-weather').textContent=`${weather.mood==='sunny'?'☀️':weather.mood.includes('rain')||weather.mood==='storm'?'🌧️':weather.mood==='windy'?'💨':'🌤️'} 台中市大雅區｜${weatherWords[weather.mood]||'多雲'} ${weather.temp}°C · 風速 ${Math.round(weather.wind)} km/h · 更新 ${weather.updated||'稍早'}`;
  $('#stat-on-time').textContent=stats.onTime;$('#stat-late').textContent=stats.late;$('#stat-streak').textContent=stats.streak;$('#stat-growth').textContent=`${stats.growth}%`;$('#growth-fill').style.width=`${stats.growth}%`;
  const r=record();$('#mark-read').disabled=state.writeBusy||!isLaunch()||Boolean(r)||state.scriptureReadDate!==today();$('#mark-read').textContent=r?'今天已記錄 ✓':isLaunch()?'讀完了，前往小樹':'10 月 1 日開跑 · 讀完經文解鎖';const waterRecord=waterTarget();$('#care-tree').hidden=!waterRecord;$('#tree-action-dock').hidden=!waterRecord;$('#care-tree').disabled=state.writeBusy||!waterRecord||Boolean(waterRecord.watered_at);$('#care-tree').textContent=waterRecord?.watered_at?'✓ 已完成澆水':'💧 澆水照顧生命樹';populateMakeupDates();$('#mark-late').disabled=state.writeBusy||!isLaunch()||!state.loadedScriptureDate||state.loadedScriptureDate===today()||state.loadedScriptureDate!==$('#late-date').value;$('#late-date').disabled=!isLaunch();
  renderChallenges();renderInvitation();
}
function forestSvg(isChurch){const trees=state.garden;const chunk=isChurch?Math.ceil(Math.max(1,trees.length)/3):Math.max(1,trees.length);const rows=isChurch?[trees.slice(0,chunk),trees.slice(chunk,chunk*2),trees.slice(chunk*2)]:[trees];const grove=(list,i)=>`<section class="garden-grove ${isChurch?'church-grove':''}">${isChurch?`<h3 class="grove-name">🌳 十月測試花園 ${String.fromCharCode(65+i)}</h3>`:''}<div class="garden-trees">${list.map((t,j)=>{const name=String(t.display_name||'同行同工');const safeName=esc(name);const stats={...progressStats(),onTime:t.on_time_count,late:Math.max(0,t.completed_count-t.on_time_count),growth:Math.round(t.completed_count/31*100),health:t.challenge_active?65:90,personalEvents:t.challenge_active?[{type:'wind',impact:12}]:[],blessingCount:t.completed_count,missedStreak:0};return `<div class="garden-tree-button"><span class="garden-tree-label">${safeName}</span>${renderLifeTree({id:`t${t.tree_number}`,name},stats,today(),true,weather.mood,12,'test').replace('<svg ','<svg class="garden-tree" ')}<span class="garden-tree-status">💧 ${t.completed_count} 天${t.challenge_active?' · 🌧️ 需要陪伴':''}</span></div>`}).join('')}</div></section>`;
  $('#forest-art').hidden=false;$('#tree-art').hidden=true;$('#tree-weather').hidden=true;$('#tree-action-dock').hidden=true;$('#reading-status').hidden=true;$('#forest-art').innerHTML=`<div class="garden-heading"><span>${isChurch?'THE CHURCH GROVE':'A SMALL GARDEN'}</span><h2>${isChurch?'M+大雅教會的大花園':'同工測試小花園'}</h2><p>${isChurch?'每一棵生命樹，都標示同行同工的名字。':'一起同行，每棵樹都有自己的讀經節奏。'}</p><span class="garden-weather-summary">${weatherWords[weather.mood]} ${weather.temp}°C · 大雅區</span></div><div class="garden-landscape-wrap" data-weather="${weather.mood}" data-season="autumn"><div class="garden-treescape">${rows.map(grove).join('')}</div></div><p class="garden-invite">🌿 ${trees.length} 棵樹，在大雅的陽光裡一起成長</p>`;
}
function renderView(){const collective=state.view!=='personal';document.querySelectorAll('.tree-view-button').forEach(b=>{b.classList.toggle('active',b.dataset.treeView===state.view);b.setAttribute('aria-pressed',String(b.dataset.treeView===state.view));});$('#tree-art').hidden=collective;$('#forest-art').hidden=!collective;$('#tree-weather').hidden=collective;$('#tree-action-dock').hidden=collective;$('#reading-status').hidden=collective;if(collective)forestSvg(state.view==='church');else renderTree();renderInvitation();}
function renderChallenges(){const box=$('#active-challenges');box.replaceChildren();const list=state.challenges.filter(c=>c.challenge_date<=today()).slice().reverse();const resolvedCount=list.filter(c=>c.status==='resolved').length;$('#challenge-count').textContent=String(list.filter(c=>c.status==='active').length);if(list.some(c=>c.status==='active'))$('#challenge-section').open=true;$('#challenge-reward-summary').textContent=resolvedCount?`🌟 已收藏 ${resolvedCount} 枚守護星光；每完成一次照顧，就看見小樹恢復一點。`:'🌟 每完成一次挑戰，就收藏 1 枚守護星光。';$('#challenge-empty').hidden=list.length>0;for(const c of list){const spec=labels[c.challenge_type];if(!spec)continue;const card=document.createElement('article');card.className=`challenge-item${c.status==='resolved'?' resolved':''}`;card.innerHTML=`<div class="challenge-copy"><strong>${spec.icon} ${spec.title} · ${fmt(c.challenge_date)}</strong><small>${c.status==='resolved'?`已完成照顧：${spec.button.replace(/^\S+\s/u,'')}`:spec.text}</small><span class="challenge-impact">${c.status==='resolved'?'✓ 樹正在恢復':'需要一點陪伴'}</span>${c.status==='resolved'?'<span class="challenge-reward">🌟 獲得 1 枚守護星光</span>':''}</div>`;if(c.status==='active'){const b=document.createElement('button');b.type='button';b.textContent=spec.button;b.onclick=()=>resolve(c,b);card.append(b);}box.append(card);}}
async function refreshViews(){
  const tasks=[];
  if($('.leaderboard-card').open)tasks.push(api('leaderboard').then(rank=>{state.leaderboard=rank.members||[];renderLeaderboard();}));
  if(state.view!=='personal')tasks.push(api('garden').then(garden=>{state.garden=garden.trees||[];}));
  await Promise.all(tasks).catch(()=>showStatus('花園或排行暫時無法更新，請再試一次。','#view-status'));
  renderView();
}
function renderLeaderboard(){const list=$('#leaderboard');list.replaceChildren();for(const [i,m] of state.leaderboard.entries()){const row=document.createElement('li');row.innerHTML=`<span class="rank-num">${i+1}</span><span class="leader-name">${esc(m.display_name||'同工')}</span><span class="leader-meta">準時讀經</span><span class="leader-score">${m.on_time_count} 天</span>`;list.append(row);}if(!list.children.length)list.innerHTML='<li class="empty-note">測試開始後，這裡會記錄準時同行的腳步。</li>';}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderJournal(){const n=state.notes.length;$('#reflection-book-count').textContent=`${n} 頁`;$('#reflection-reward').textContent=n?`🦋 已收藏 ${n} 頁・陪伴你的蝴蝶正在增加。`:'🦋 寫下亮光，收藏第一隻蝴蝶。';if(!n){$('#book-date').textContent='尚無收藏';$('#book-passage').textContent='每一份亮光，都值得被珍藏。';$('#book-note').textContent='寫下第一份拾光，讓這本手札開始記錄你的旅程。';$('#book-page-count').textContent='尚無頁面';$('#book-older').disabled=$('#book-newer').disabled=true;return;}state.journalIndex=Math.max(0,Math.min(state.journalIndex,n-1));const entry=state.notes[state.journalIndex];$('#book-date').textContent=entry.reading_date;$('#book-passage').textContent=entry.passage||`箴言 ${chapterDay(entry.reading_date)} 章`;( $('#book-note')).textContent=entry.note;$('#book-page-count').textContent=`第 ${state.journalIndex+1} / ${n} 頁`;$('#book-older').disabled=state.journalIndex===0;$('#book-newer').disabled=state.journalIndex===n-1;}
function pageTurn(direction){const spread=$('#book-spread');spread.classList.remove('page-turn-forward','page-turn-back');void spread.offsetWidth;spread.classList.add(direction==='older'?'page-turn-back':'page-turn-forward');renderJournal();}
async function refresh(){const result=await api('me');state.participant=result.participant;state.records=result.records||[];state.challenges=result.challenges||[];state.notes=result.notes||[];$('#signed-member-name').textContent=state.participant.display_name||'同工';$('#signed-member-id').textContent='LINE 身分已驗證 · 十月隔離測試';$('#line-login-gate').hidden=true;$('#member-view').hidden=false;renderView();renderJournal();try{const key=draftKey();if(key&&!$('#reflection-note').value)$('#reflection-note').value=sessionStorage.getItem(key)||'';}catch{}await refreshViews();}
async function loadScripture(requestedDate=''){const request=++scriptureRequest;state.loadedScriptureDate='';$('#mark-late').disabled=true;window.speechSynthesis?.cancel();const target=$('#scripture-text'),date=requestedDate||(isLaunch()?today():'2026-10-01'),isMakeup=date!==today();scriptureEndObserver?.disconnect();state.scriptureReadDate='';setReadingContext(date);$('#complete-reading-actions').hidden=true;$('#mark-read').disabled=true;target.replaceChildren();target.hidden=false;$('#audio-controls').hidden=true;$('#toggle-scripture').setAttribute('aria-expanded','true');$('#toggle-scripture').textContent='📖 收合完整經文';$('#passage-detail').textContent=isLaunch()?(isMakeup?`${fmt(date)} · 補讀經文載入中…`:`${fmt(date)} · 完整章節｜讀到最底後即可回樹下澆水`):'預覽十月首日完整經文；正式記錄自 10 月 1 日開始';const loading=document.createElement('p');loading.textContent='正在載入完整經文…';target.append(loading);try{const [chapter]=await loadScheduledChapters(prompt(date));if(request!==scriptureRequest)return;target.replaceChildren();const section=document.createElement('section');section.className='scripture-chapter';const h=document.createElement('h3');h.textContent=chapter.title;section.append(h);chapter.verses.forEach(v=>{const p=document.createElement('p');p.textContent=v;section.append(p)});target.append(section);const marker=document.createElement('span');marker.id='scripture-end';marker.className='scripture-end-marker';marker.setAttribute('aria-hidden','true');target.append(marker);state.passage=chapter.verses.join(' ');state.loadedScriptureDate=date;$('#audio-controls').hidden=false;$('#complete-reading-actions').hidden=isMakeup;if(isMakeup){$('#passage-detail').textContent=`${fmt(date)} · 補讀經文已載入｜按下「補讀完成」`;$('#mark-late').disabled=false;showStatus(`已載入 ${fmt(date)} 的箴言 ${chapterDay(date)} 章。`);}else{$('#scripture-read-hint').textContent='請滑到經文最後，解鎖讀完按鈕。';observeScriptureEnd(date);}play('open');}catch(e){if(request!==scriptureRequest)return;target.textContent='經文暫時無法載入，請確認網路後重試。';const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='重新載入經文';retry.onclick=()=>loadScripture(date);target.append(retry);}}
function observeScriptureEnd(date){const marker=$('#scripture-end');if(!marker)return;if(!('IntersectionObserver' in window)){state.scriptureReadDate=date;renderTree();$('#scripture-read-hint').textContent='讀完後，按下按鈕回到小樹。';return;}scriptureEndObserver?.disconnect();scriptureEndObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){state.scriptureReadDate=date;$('#mark-read').disabled=state.writeBusy||!isLaunch()||Boolean(record(date));$('#scripture-read-hint').textContent='讀到最後了！按下按鈕，帶你回小樹澆水 🌱';}}, {threshold:0.95});scriptureEndObserver.observe(marker);}
function sayScripture(){if(!window.speechSynthesis){showStatus('此瀏覽器不支援朗讀。');return;}const lines=[...$('#scripture-text').querySelectorAll('p')].map(p=>p.textContent.trim()).filter(Boolean);if(!lines.length){showStatus('先展開完整經文再開始朗讀。');return;}speechSynthesis.cancel();let index=0;const next=()=>{if(index>=lines.length){showStatus('朗讀完成，願神的話陪伴你。');return;}const u=new SpeechSynthesisUtterance(lines[index++]);u.lang='zh-TW';u.rate=.86;u.onend=next;speechSynthesis.speak(u);};next();showStatus('正在朗讀經文…');}
// Reuse native media elements: iOS authorizes each element during a trusted click.
// Keeping the effect element allows success sounds after asynchronous saves.
let backgroundAudio=null,effectAudio=null,musicVersion=0,musicStarting=false;
let effectVersion=0,effectStarting=false,effectsReady=false;
function musicPlaying(){return Boolean(state.sound&&backgroundAudio&&!backgroundAudio.paused&&!backgroundAudio.error&&backgroundAudio.readyState>=2);}
function updateMusicButton(){const button=$('#sound-toggle');button.textContent=musicStarting?'正在開啟聲音…':musicPlaying()?'關閉聲音':'開啟聲音';button.setAttribute('aria-pressed',String(musicPlaying()));button.disabled=musicStarting;}
function createAudio(kind){
  const audio=document.createElement('audio');audio.preload='none';audio.hidden=true;audio.dataset.lifeTreeAudio=kind;audio.setAttribute('playsinline','');document.body.append(audio);return audio;
}
function audioURL(name){return new URL(`./assets/audio/life-tree/${name}.wav?v=20261010-audio1`,import.meta.url).href;}
function ensureAudio(){
  if(!backgroundAudio){
    backgroundAudio=createAudio('music');backgroundAudio.src=audioURL('reading');backgroundAudio.loop=true;backgroundAudio.volume=.65;
    ['playing','pause','ended'].forEach(name=>backgroundAudio.addEventListener(name,updateMusicButton));
    backgroundAudio.addEventListener('error',()=>{updateMusicButton();if(state.sound)$('#music-status').textContent='音樂載入失敗，請按「開啟聲音」重試。';});
  }
  if(!effectAudio){effectAudio=createAudio('effect');effectAudio.volume=.85;}
}
async function boundedPlayback(audio){
  let deadline;
  try{await Promise.race([audio.play(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('audio_timeout')),6000);})]);}
  finally{clearTimeout(deadline);}
}
async function startBackgroundMusic(){
  if(!state.sound||document.hidden)return;
  ensureAudio();
  // Both play calls occur before any await in the user gesture, not after a fetch.
  if(!effectsReady&&!effectStarting)void play('open',true);
  if(musicStarting||musicPlaying())return;
  const version=++musicVersion;musicStarting=true;updateMusicButton();$('#music-status').textContent='正在載入音樂與音效…';
  try{
    if(backgroundAudio.error)backgroundAudio.load();
    await boundedPlayback(backgroundAudio);
    if(version!==musicVersion||!state.sound||document.hidden)return;
    if(!musicPlaying())throw Error('audio_paused');
    $('#music-status').textContent=effectsReady?'音樂與音效已開啟，可按「試聽音效」確認。':'背景音樂播放中；請按「試聽音效」啟用音效。';
  }catch{
    if(version===musicVersion){backgroundAudio.pause();$('#music-status').textContent='音樂尚未啟動，請按「開啟聲音」重試。';}
  }finally{if(version===musicVersion){musicStarting=false;updateMusicButton();}}
}
function stopBackgroundMusic(){
  ++musicVersion;++effectVersion;musicStarting=false;effectStarting=false;effectsReady=false;
  backgroundAudio?.pause();effectAudio?.pause();updateMusicButton();
}
async function play(type,fromGesture=false){
  if(!state.sound||document.hidden)return;
  if(!fromGesture&&!effectsReady){if(!effectStarting)$('#music-status').textContent='請按「試聽音效」啟用操作提示聲。';return;}
  ensureAudio();const version=++effectVersion;effectStarting=true;
  try{
    const name=['open','water','celebration','wind','journal'].includes(type)?type:'open';
    effectAudio.pause();effectAudio.src=audioURL(name);
    await boundedPlayback(effectAudio);
    if(version!==effectVersion||!state.sound||document.hidden)return;
    effectsReady=true;
    if(fromGesture)$('#music-status').textContent=musicPlaying()?'音樂與音效已開啟。':'音效已開啟；音樂尚未播放。';
  }catch{
    if(version===effectVersion){effectsReady=false;effectAudio.pause();$('#music-status').textContent='音效尚未啟動，請按「試聽音效」重試。';}
  }finally{if(version===effectVersion)effectStarting=false;}
}
async function markRead(date=today()){if(state.writeBusy||record(date))return;if(date===today()&&state.scriptureReadDate!==date){showStatus('請先滑到完整經文最下方，再按讀完。');return;}const b=$('#mark-read');state.writeBusy=true;b.disabled=true;b.textContent='正在記錄讀經…';$('#mark-late').disabled=true;showStatus('正在記錄讀經…');try{const out=await api('mark_read',{readingDate:date});state.records=out.records||state.records;if(!record(date))state.records=[...state.records,{reading_date:date,completion_type:out.completion_type,watered_at:null}];state.pendingWaterDate=date;state.view='personal';renderView();showStatus(out.completion_type==='on_time'?'📖 讀經完成！小樹已解鎖澆水，來照顧它吧 🌱':'✓ 補讀完成！來到樹下澆水吧 🌱');requestAnimationFrame(()=>scrollToSection($('.tree-card')));}catch(e){showStatus(e.message)}finally{state.writeBusy=false;renderView();}}
function waterTarget(){const pending=state.pendingWaterDate&&record(state.pendingWaterDate);if(pending&&!pending.watered_at)return pending;const current=record();if(current&&!current.watered_at)return current;return [...state.records].reverse().find(r=>r.completion_type==='makeup'&&!r.watered_at)||null;}
function populateMakeupDates(){const select=$('#late-date');if(!select)return;const previous=select.value;const start=state.participant?.reading_start_date||'2026-10-01';const dates=[];for(let offset=1;offset<=7;offset++){const d=new Date(Date.parse(`${today()}T12:00:00Z`)-offset*86400000).toISOString().slice(0,10);if(d>=start&&!record(d))dates.push(d);}select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=dates.length?'選擇未讀日期':'目前沒有可補讀日期';select.append(placeholder);dates.forEach(d=>{const option=document.createElement('option');option.value=d;option.textContent=fmt(d);select.append(option)});if(dates.includes(previous))select.value=previous;}
async function water(){
  if(state.writeBusy)return;const button=$('#care-tree'),target=waterTarget();
  if(!target){showStatus('先完成今天的讀經，才能為生命樹澆水。');return;}
  state.writeBusy=true;button.disabled=true;button.textContent='正在澆水…';showStatus('正在為生命樹澆水…');let saved=false;
  try{const result=await api('water_tree',{readingDate:target.reading_date});state.pendingWaterDate='';state.records=result.records||state.records;saved=true;showStatus('澆水完成！讓神的話繼續陪伴今天。');}
  catch(error){showStatus(error.message);}
  finally{state.writeBusy=false;renderView();if(saved){challengeFx('celebration');play('celebration');}}
}
async function resolve(challenge,button){
  if(state.writeBusy)return;state.writeBusy=true;button.disabled=true;button.textContent='正在照顧小樹…';let saved=false;
  try{const spec=labels[challenge.challenge_type],result=await api('resolve_challenge',{challengeId:challenge.id,resolutionAction:spec.action});state.challenges=result.challenges||state.challenges;saved=true;showStatus('挑戰完成！獲得 1 枚守護星光，小樹正在恢復。');}
  catch(error){showStatus(error.message);}
  finally{state.writeBusy=false;renderView();if(saved){challengeFx(challenge.challenge_type==='worm'?'worm':'water');play(challenge.challenge_type==='worm'?'worm':'wind');}}
}
async function saveJournal(){
  if(state.writeBusy)return;const note=$('#reflection-note').value.trim();
  if(!note){showStatus('先寫下一句今天的亮光，再把蝴蝶收藏起來吧。','#reflection-status');return;}
  if(!record()){showStatus('先完成今天的讀經，才可以收藏今天的拾光。','#reflection-status');return;}
  const button=$('#save-reflection');state.writeBusy=true;button.disabled=true;button.textContent='正在收藏…';
  try{
    await api('journal_save',{readingDate:today(),note});
    state.notes=state.notes.filter(row=>row.reading_date!==today()).concat({reading_date:today(),note});state.journalIndex=state.notes.length-1;
    try{const key=draftKey();if(key)sessionStorage.removeItem(key);}catch{}
    renderJournal();play('journal');challengeFx('butterfly');showStatus('拾光已收藏。','#reflection-status');
  }catch(error){showStatus(error.message,'#reflection-status');}
  finally{state.writeBusy=false;button.disabled=false;button.textContent='珍藏這份拾光 🦋';}
}
async function liveWeather(){try{const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude=24.229&longitude=120.653&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FTaipei',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error();const d=await r.json();weather.code=d.current.weather_code;weather.temp=Math.round(d.current.temperature_2m);weather.wind=d.current.wind_speed_10m;weather.updated=new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Taipei'}).format(new Date(d.current.time));const c=weather.code;weather.mood=[95,96,99].includes(c)?'storm':[51,53,55,56,57,61,63,65,66,67,80,81,82,71,73,75,77,85,86].includes(c)?'rain':[45,48,3].includes(c)?'cloudy':[1,2].includes(c)?'partly-cloudy':weather.wind>=30?'windy':'sunny';if(state.participant&&!state.writeBusy)renderView();}catch{weather.updated='即時資料暫時無法連線';}}
async function signIn(){if(!window.liff?.isLoggedIn()){$('#line-login-gate').hidden=false;showStatus('LINE 驗證尚未完成，請回到 LINE 群組重新開啟專用連結。','#login-status');return;}state.idToken=window.liff.getIDToken()||'';if(!state.idToken){$('#line-login-gate').hidden=false;$('#login-member').disabled=true;showStatus('LINE 登入資訊不完整，請重新從同工群組的測試連結開啟。','#login-status');return;}try{await refresh();}catch(e){$('#line-login-gate').hidden=false;if(e.code==='join_required'){$('#login-member').disabled=false;$('#login-member-id').textContent='LINE 身分已確認';showStatus('已確認 LINE 身分，輸入同工邀請碼加入測試。','#login-status');}else{$('#login-member').disabled=true;showStatus(`${e.message} 請確認網路後重新整理。`,'#login-status');}}}
async function join(){const b=$('#login-member');b.disabled=true;try{const result=await api('join',{inviteCode:$('#invite-code').value.trim()});state.participant=result.participant;await refresh();}catch(e){showStatus(e.message,'#login-status');}finally{b.disabled=false;}}
function setup(){
  updateMusicButton();$('#music-status').textContent=state.sound?'按「開啟聲音」，讓音樂與音效陪你讀經。':'音樂與音效已關閉';
  const resumeMusic=event=>{if(!event.isTrusted||event.target?.closest?.('#sound-toggle,#test-sound'))return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;if(state.sound)void startBackgroundMusic();};
  ['click','keydown'].forEach(name=>document.addEventListener(name,resumeMusic,{capture:true}));
  const pauseForBackground=()=>{stopBackgroundMusic();if(state.sound)$('#music-status').textContent='聲音已暫停，點一下頁面即可恢復。';};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseForBackground();});
  window.addEventListener('pagehide',pauseForBackground);
  window.addEventListener('pageshow',restoreTreeScroll);
  $('#sound-toggle').onclick=()=>{if(musicPlaying()){state.sound=false;stopBackgroundMusic();$('#music-status').textContent='音樂與音效已關閉';}else{state.sound=true;void startBackgroundMusic();}rememberMusic();};
  $('#test-sound')?.addEventListener('click',()=>{state.sound=true;rememberMusic();ensureAudio();void play('open',true);void startBackgroundMusic();});
  document.querySelectorAll('.tree-view-button').forEach(button=>button.addEventListener('click',async()=>{
    if(state.writeBusy){showStatus('目前正在儲存，請稍候再切換。','#view-status');return;}const requested=button.dataset.treeView,previous=state.view,request=++viewRequest;
    const controls=$('.tree-view-switch');controls.setAttribute('aria-busy','true');showStatus(requested==='personal'?'返回個人生命樹…':'正在載入花園…','#view-status');
    document.querySelectorAll('.tree-view-button').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
    try{if(requested!=='personal'){const result=await api('garden');if(request!==viewRequest)return;state.garden=result.trees||[];}if(request!==viewRequest)return;state.view=requested;renderView();showStatus(requested==='personal'?'已回到個人生命樹。':'花園已更新。','#view-status');}
    catch(error){if(request===viewRequest){state.view=previous;renderView();showStatus(error.message,'#view-status');}}
    finally{if(request===viewRequest)controls.setAttribute('aria-busy','false');}
  }));
  $('.leaderboard-card').addEventListener('toggle',async()=>{if(!$('.leaderboard-card').open)return;$('#leaderboard').textContent='正在載入同行進度…';try{const result=await api('leaderboard');state.leaderboard=result.members||[];renderLeaderboard();}catch{$('#leaderboard').textContent='暫時無法載入，請收合後再開啟重試。';}});
  $('#switch-member').onclick=async()=>{if(state.writeBusy)return;const button=$('#switch-member');if(button.disabled)return;state.writeBusy=true;button.disabled=true;button.textContent='正在更新…';showStatus('正在重新整理進度…','#progress-status');try{await refresh();showStatus('進度已更新。','#progress-status');}catch(error){showStatus(error.message,'#progress-status');}finally{state.writeBusy=false;renderView();button.disabled=false;button.textContent='重新整理進度';}};
  $('#read-today').onclick=async()=>{if(record()&&!record().watered_at){state.view='personal';renderView();scrollToSection($('.tree-card'));return;}scrollToSection($('.reading-card'));if($('#scripture-text').hidden||state.loadedScriptureDate!==today())await loadScripture(today());};
  document.querySelectorAll('.devotional-entry').forEach(link=>link.addEventListener('click',event=>{if(state.writeBusy){event.preventDefault();showStatus('請等目前的儲存完成，再進入靈修。');return;}try{sessionStorage.setItem('october-tree-return-scroll',String(window.scrollY));const key=draftKey();if(key)sessionStorage.setItem(key,$('#reflection-note').value);}catch{}dismissDevotionalDock();}));
  $('#dismiss-devotional-dock').onclick=()=>{dismissDevotionalDock();const tree=$('.tree-card');tree.tabIndex=-1;tree.focus({preventScroll:true});};
  document.addEventListener('focusin',syncDevotionalDock);document.addEventListener('focusout',()=>requestAnimationFrame(syncDevotionalDock));
  new ResizeObserver(measureDevotionalDock).observe($('#devotional-dock'));
  new IntersectionObserver(syncDevotionalDock,{threshold:[0,1]}).observe($('#devotional-preview-link'));
  $('#login-member').onclick=join;$('#mark-read').onclick=()=>markRead();$('#care-tree').onclick=water;
  $('#toggle-scripture').onclick=()=>$('#scripture-text').hidden?loadScripture(state.loadedScriptureDate||''):(()=>{++scriptureRequest;scriptureEndObserver?.disconnect();$('#scripture-text').hidden=true;$('#complete-reading-actions').hidden=true;$('#audio-controls').hidden=true;$('#toggle-scripture').setAttribute('aria-expanded','false');$('#toggle-scripture').textContent='📖 展開完整經文';window.speechSynthesis?.cancel();})();
  $('#read-aloud').onclick=sayScripture;$('#stop-reading').onclick=()=>{window.speechSynthesis?.cancel();showStatus('已停止朗讀。');};
  $('#late-date').addEventListener('change',()=>{const date=$('#late-date').value;$('#mark-late').disabled=true;if(!date){++scriptureRequest;state.loadedScriptureDate='';return;}void loadScripture(date);});
  $('#mark-late').onclick=()=>{const date=$('#late-date').value;if(!date||state.loadedScriptureDate!==date){showStatus('請先選擇並載入未讀日期。');return;}void markRead(date);};
  $('#save-reflection').onclick=saveJournal;$('#reflection-book-toggle').onclick=()=>{const book=$('#reflection-book');book.hidden=!book.hidden;$('#reflection-book-toggle').setAttribute('aria-expanded',String(!book.hidden));renderJournal();if(!book.hidden)scrollToSection(book);};
  $('#book-older').onclick=()=>{state.journalIndex=Math.max(0,state.journalIndex-1);pageTurn('older')};$('#book-newer').onclick=()=>{state.journalIndex=Math.min(state.notes.length-1,state.journalIndex+1);pageTurn('newer')};
}
async function start(){setReadingContext(today());setup();void liveWeather();window.setInterval(()=>{if(!document.hidden)void liveWeather();},15*60*1000);if(!OCTOBER_TEST_LIFF_ID||!OCTOBER_TEST_API){$('#line-login-gate').hidden=false;showStatus('測試頁尚未完成設定。','#login-status');return;}try{await window.liff.init({liffId:OCTOBER_TEST_LIFF_ID});if(!window.liff.isInClient()){$('#line-login-gate').hidden=false;showStatus('請從 LINE 聊天室的 LIFF 專用連結開啟，才能在 LINE 內完成登入。','#login-status');return;}if(!window.liff.isLoggedIn()){$('#line-login-gate').hidden=false;$('#login-member-id').textContent='LINE 驗證尚未完成';showStatus('LINE 內登入尚未完成，請關閉視窗，再從 LINE 群組的 LIFF 專用連結開啟。','#login-status');return;}await signIn();restoreTreeScroll();}catch(e){$('#line-login-gate').hidden=false;showStatus('LINE 登入暫時無法使用，請重新整理。','#login-status');}}
start();
