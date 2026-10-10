import { loadScheduledChapters } from './bible-scripture-loader.mjs?v=20261010-deadline1';
import { renderLifeTree } from './tree-reading-october-art.mjs?v=20261010-playful-care1';
import { createAppIcon } from './app-icons.mjs?v=20261010-playful-care1';
import { OCTOBER_TEST_API, OCTOBER_TEST_LIFF_ID, OCTOBER_TEST_WINDOW } from './tree-reading-october-test-config.mjs?v=20260929-login-fallback';

const $ = (selector) => document.querySelector(selector);
function guideSeen(){try{return localStorage.getItem('october-life-tree-guide-v1')==='1';}catch{return false;}}
function musicPreference(){try{return guideSeen()&&localStorage.getItem('lifeTreeSound')==='on';}catch{return false;}}
function rememberMusic(){try{localStorage.setItem('lifeTreeSound',state.sound?'on':'off');}catch{}}
const state = { idToken:'', participant:null, records:[], challenges:[], notes:[], leaderboard:[], garden:[], admin:false, view:'personal', passage:null, sound:musicPreference(),writeBusy:false,  loadedScriptureDate:'',readingContextDate:'',readingSaveDate:'',readingSaveError:'',pendingWaterDate:'' };
let scriptureEndObserver=null, scriptureRequest=0, viewRequest=0;
let dismissedDevotionalKey='';
function devotionalDockKey(){return state.participant?.id?`october-devotional-dismissed:${state.participant.id}:${today()}`:'';}
function dismissDevotionalDock(){const key=devotionalDockKey();dismissedDevotionalKey=key;try{if(key)sessionStorage.setItem(key,'1');}catch{}syncDevotionalDock();}
function measureDevotionalDock(){const dock=$('#devotional-dock');if(!dock.hidden)document.body.style.setProperty('--devotional-dock-space',`${Math.ceil(dock.getBoundingClientRect().height)+32}px`);}
function syncDevotionalDock(){
  const key=devotionalDockKey();let dismissed=Boolean(key&&dismissedDevotionalKey===key);try{dismissed||=Boolean(key&&sessionStorage.getItem(key)==='1');}catch{}
  const contextDate=state.pendingWaterDate||state.readingContextDate;
  const makeupInProgress=contextDate&&contextDate!==today()&&!record(contextDate)?.watered_at;
  const available=Boolean(state.participant&&record()?.watered_at&&!dismissed&&!makeupInProgress&&!state.writeBusy);
  const editing=document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  $('#devotional-dock').hidden=!available||Boolean(editing);document.body.classList.toggle('has-devotional-dock',available);measureDevotionalDock();
}
function restoreTreeScroll(){if(!state.participant)return;try{const value=sessionStorage.getItem('october-tree-return-scroll');if(value!==null){sessionStorage.removeItem('october-tree-return-scroll');requestAnimationFrame(()=>window.scrollTo({top:Number(value)||0,behavior:'instant'}));}}catch{}}
function scrollToSection(node){if(!node)return;node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function renderInvitation(){const visible=Boolean(record()?.watered_at);syncDevotionalDock();$('#journey-date').textContent=`${fmt(today())} · 箴言 ${chapterDay(today())} 章`;$('#journey-passage').textContent=visible?'活水已澆灌，讓神的話繼續陪伴。':record()?'讀經完成，回到小樹澆水。':'今天，讓神的話滋養你。';$('#read-today').innerHTML=`<span>${visible?'重讀今日經文':record()?'回小樹澆水':'今日讀經'}</span><small>${visible?'今日已澆水 ✓':record()?'還差一點活水':'開始今日讀經'}</small>`;$('#step-reading').dataset.done=String(Boolean(record()));$('#step-watering').dataset.done=String(visible);}

const today = () => {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=(type)=>parts.find((item)=>item.type===type)?.value||'';return `${part('year')}-${part('month')}-${part('day')}`;};
const fmt = (date) => `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
const chapterDay = (date) => Number(date.slice(8,10));
const isLaunch = () => today() >= OCTOBER_TEST_WINDOW.start && today() <= OCTOBER_TEST_WINDOW.end;
const prompt = (date=today()) => `🌳 根｜箴言 ${chapterDay(date)}　🌿 枝｜—　🍎 果｜—`;
const labels = {worm:{icon:'🐛',title:'小樹蟲來了',text:'嫩葉正遇到小小蟲害。陪它除蟲，保護剛長出的新芽。',button:'拿噴瓶除蟲',tool:'tree-spray',action:'pest'},wind:{icon:'💨',title:'一陣強風吹來',text:'風吹得有點大，讓我們搭著肩、彼此扶持，陪小樹一起站穩。',button:'彼此扶持',tool:'tree-support',action:'support'},typhoon:{icon:'🌧️',title:'風雨考驗',text:'雨勢和風讓樹根不太安穩，守護根部就能恢復。',button:'穿雨衣防風雨',tool:'tree-raincoat',action:'guard'},trouble:{icon:'🪵',title:'樹枝需要整理',text:'掉落的枝條需要清理，整理後新芽就能再次生長。',button:'拿掃把整理',tool:'tree-broom',action:'repair'}};
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
function activeChallenges(){return state.challenges.filter(c=>c.status==='active'&&c.challenge_date<=today());}
function primaryChallenge(){const active=activeChallenges();return ['typhoon','wind','worm','trouble'].map(type=>active.find(c=>c.challenge_type===type)).find(Boolean);}
function renderCareTools(){
  const box=$('#tree-care-tools'),active=activeChallenges();box.replaceChildren();box.hidden=!active.length||state.view!=='personal';
  for(const type of ['typhoon','worm','wind','trouble']){
    const matching=active.filter(c=>c.challenge_type===type),challenge=matching[0],spec=labels[type];if(!challenge)continue;
    const button=document.createElement('button');button.type='button';button.className=`tree-tool tree-tool-${type}`;button.dataset.careId=challenge.id;button.dataset.careType=type;button.disabled=state.writeBusy;button.setAttribute('aria-label',`${spec.title}：${spec.button}${matching.length>1?`，還有 ${matching.length} 項`:''}`);
    button.append(createAppIcon(spec.tool,'tree-tool-icon'));const caption=document.createElement('strong');caption.textContent=spec.button;button.append(caption);
    if(matching.length>1){const count=document.createElement('small');count.textContent=`${matching.length} 項待照顧`;button.append(count);}
    button.onclick=()=>resolve(challenge,button,true);box.append(button);
  }
  $('#care-short-count').textContent=active.length?`${active.length} 項等你幫忙`:'小樹平安';$('#go-tree-care').dataset.attention=String(Boolean(active.length));
}
function goCareTools(){++viewRequest;$('.tree-view-switch').setAttribute('aria-busy','false');state.view='personal';renderView();const target=$('#tree-care-tools button')||$('#care-tree:not([hidden])')||$('#tree-title');target.tabIndex=target.matches('button')?0:-1;target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});if(!activeChallenges().length&&!waterTarget())showStatus('小樹目前平安。完成讀經後，就能為它澆水。','#tree-care-feedback');}
function careToolSuccess(type){const spec=labels[type],fx=document.createElement('div');fx.className='care-tool-success';fx.setAttribute('aria-hidden','true');fx.append(createAppIcon(spec.tool,'tree-tool-icon'));const text=document.createElement('span');text.textContent=type==='worm'?'噴噴！嫩葉受到保護了':type==='typhoon'?'雨衣穿好了！謝謝你的守護':type==='wind'?'搭著肩！我們一起站穩了':'乾淨了！新芽有空間生長';fx.append(text);$('#tree-scene').append(fx);setTimeout(()=>fx.remove(),2600);}

function renderChallengeNotice(){
  const active=activeChallenges(),notice=$('#tree-challenge-notice');
  if(!notice)return;
  notice.hidden=!active.length||state.view!=='personal';
  const names=[...new Set(active.map(c=>labels[c.challenge_type]?.title||'新的挑戰'))];
  $('#tree-challenge-title').textContent=active.length===1?`${names[0]}，需要你幫忙`:`小樹有 ${active.length} 項挑戰，等你來照顧`;
  $('#tree-challenge-description').textContent=active.length===1?(labels[active[0].challenge_type]?.text||'請展開生命中的風雨，查看需要的照顧。'):`${names.join('、')}。按下方按鈕，逐一幫小樹度過風雨。`;
  $('#challenge-summary').textContent=active.length?`生命中的風雨 · ${active.length} 項待照顧`:'生命中的風雨與守護星光';
}
function progressStats(){const n=state.records.filter(r=>r.completion_type==='on_time').length,l=state.records.filter(r=>r.completion_type==='makeup').length; let streak=0; for(let i=30;i>=0;i--){const d=`2026-10-${String(i+1).padStart(2,'0')}`;if(d>today())continue;if(record(d))streak++;else break;}let misses=0;for(let i=Math.min(30,chapterDay(today())-2);i>=0;i--){if(record(`2026-10-${String(i+1).padStart(2,'0')}`))break;misses++;}return{onTime:n,late:l,streak,missedStreak:today()<'2026-10-01'?0:misses,growth:Math.round((n+l)/31*100),health:Math.max(20,100-misses*13),personalEvents:activeChallenges().map(c=>({type:c.challenge_type,impact:12})),blessingCount:state.notes.length,logs:Object.fromEntries(state.records.map(r=>[r.reading_date,{kind:r.completion_type}]))};}
function season(){const month=Number(today().slice(5,7));return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter'}
function challengeFx(type){const cls=type==='worm'?'care-pest-active':'care-water-active';const art=$('#tree-art');art.classList.add(cls);const fx=document.createElement('div');fx.className='care-animation';fx.setAttribute('aria-hidden','true');fx.innerHTML=type==='worm'?'<span class="pest-bug">🐛</span><span class="pest-spray">✨</span>':type==='celebration'?'<span class="celebration-piece celebration-one">🎉</span><span class="celebration-piece celebration-two">✨</span><span class="celebration-piece celebration-three">🌟</span><span class="celebration-piece celebration-four">🎊</span><span class="celebration-piece celebration-five">💛</span>':'<span class="water-drop drop-one">💧</span><span class="water-drop drop-two">💧</span><span class="water-drop drop-three">💧</span><span class="care-sparkle sparkle-one">✦</span><span class="care-sparkle sparkle-two">✦</span><span class="care-sparkle sparkle-three">✦</span>';art.append(fx);setTimeout(()=>{art.classList.remove(cls);fx.remove();},2600);}
function showStatus(text,where='#reading-status'){const node=$(where);if(node)node.textContent=text;}
function setReadingContext(date=today()){state.readingContextDate=date;const isMakeup=date!==today();$('#reading-eyebrow').textContent=isMakeup?'MAKEUP READING':"TODAY'S READING";$('#reading-heading').textContent=isMakeup?'補讀經文':'今天的讀經';$('#reading-date').textContent=fmt(date);$('#passage-title').textContent=`箴言 ${today()<'2026-10-01'?1:chapterDay(date)} 章`;$('#passage-detail').textContent=today()<'2026-10-01'?'10 月 1 日開始；加入前日期已保送。':isMakeup?`${fmt(date)} · 補讀經文載入中…`:'完整讀完後回到樹下記錄，接著澆水。';syncDevotionalDock();}
function missedMessage(n){return n===1?'今天葉子開始泛黃，回來讀經就能恢復。':n===2?'兩天沒讀，葉片慢慢垂下；補讀就能重新照顧小樹。':n>=3?`連續漏讀 ${n} 天，樹的成長退回一步；補讀後就會恢復。`:''}
function renderTree(){const stats=progressStats(),active=primaryChallenge();const art=$('#tree-art');art.dataset.challenge=active?.challenge_type||'none';$('.tree-card').dataset.needsCare=String(Boolean(active));art.setAttribute('aria-label',active?`生命樹有 ${activeChallenges().length} 項待照顧的挑戰`:'生命樹，目前沒有待照顧的風雨');art.dataset.weather=weather.mood;art.dataset.season=season();art.dataset.health=stats.missedStreak>=3?'wilted':stats.missedStreak?'yellow':'healthy';art.innerHTML=renderLifeTree({id:'oct',name:state.participant?.display_name||'同工'},stats,today(),false,weather.mood,12,'test');$('.tree-card')?.setAttribute('data-weather',weather.mood);$('#tree-date-label').textContent=today()<'2026-10-01'?'COMING SOON · OCT 01':`OCTOBER · ${fmt(today())}`;$('#tree-title').textContent=`${state.participant?.display_name||'同工'}的生命樹`;if(!state.readingContextDate)setReadingContext(today());
  const status=active?`${labels[active.challenge_type]?.title||'生命中的挑戰'} · 請幫小樹一起面對`:missedMessage(stats.missedStreak)||(state.records.length?'葉片翠綠，正在穩穩成長。':'小樹正在等候第一道活水 ✨');$('#tree-mood').textContent=status;
  $('#health-badge').textContent=active?`待照顧 ${activeChallenges().length} 項`:stats.missedStreak>=3?'🍂 需要照料':stats.missedStreak?'🌿 回來就會好':'🌱 生長中';
  $('#tree-weather').textContent=`${weather.mood==='sunny'?'☀️':weather.mood.includes('rain')||weather.mood==='storm'?'🌧️':weather.mood==='windy'?'💨':'🌤️'} 大雅｜${weatherWords[weather.mood]||'多雲'} ${weather.temp}°C · 風速 ${Math.round(weather.wind)} km/h · ${weather.updated||'稍早'}`;
  $('#stat-on-time').textContent=stats.onTime;$('#stat-late').textContent=stats.late;$('#stat-streak').textContent=stats.streak;$('#stat-growth').textContent=`${stats.growth}%`;$('#growth-fill').style.width=`${stats.growth}%`;
  const waterRecord=waterTarget();$('#care-tree').hidden=!waterRecord;$('#tree-action-dock').hidden=!waterRecord;$('#care-tree').disabled=state.writeBusy||!isLaunch()||!waterRecord||Boolean(waterRecord.watered_at);$('#care-tree').textContent=waterRecord?`💧 ${fmt(waterRecord.reading_date)} ${waterRecord.reading_date===today()?'今日':'補讀'}澆水照顧生命樹`:'💧 澆水照顧生命樹';populateMakeupDates();renderReadingAction();$('#late-date').disabled=state.writeBusy||!isLaunch();
  renderChallenges();renderChallengeNotice();renderCareTools();renderInvitation();
}
function forestSvg(isChurch){const trees=state.garden;const chunk=isChurch?Math.ceil(Math.max(1,trees.length)/3):Math.max(1,trees.length);const rows=isChurch?[trees.slice(0,chunk),trees.slice(chunk,chunk*2),trees.slice(chunk*2)]:[trees];const grove=(list,i)=>`<section class="garden-grove ${isChurch?'church-grove':''}">${isChurch?`<h3 class="grove-name">🌳 十月測試花園 ${String.fromCharCode(65+i)}</h3>`:''}<div class="garden-trees">${list.map((t,j)=>{const name=String(t.display_name||'同行同工');const safeName=esc(name);const stats={...progressStats(),onTime:t.on_time_count,late:Math.max(0,t.completed_count-t.on_time_count),growth:Math.round(t.completed_count/31*100),health:t.challenge_active?65:90,personalEvents:t.challenge_active?[{type:'wind',impact:12}]:[],blessingCount:t.completed_count,missedStreak:0};return `<div class="garden-tree-button"><span class="garden-tree-label">${safeName}</span>${renderLifeTree({id:`t${t.tree_number}`,name},stats,today(),true,weather.mood,12,'test').replace('<svg ','<svg class="garden-tree" ')}<span class="garden-tree-status">💧 ${t.completed_count} 天${t.challenge_active?' · 🌧️ 需要陪伴':''}</span></div>`}).join('')}</div></section>`;
  $('#forest-art').hidden=false;$('#tree-art').hidden=true;$('#tree-weather').hidden=true;$('#tree-action-dock').hidden=true;$('#reading-status').hidden=true;$('#forest-art').innerHTML=`<div class="garden-heading"><span>${isChurch?'THE CHURCH GROVE':'A SMALL GARDEN'}</span><h2>${isChurch?'M+大雅教會的大花園':'同工測試小花園'}</h2><p>${isChurch?'每一棵生命樹，都標示同行同工的名字。':'一起同行，每棵樹都有自己的讀經節奏。'}</p><span class="garden-weather-summary">${weatherWords[weather.mood]} ${weather.temp}°C · 大雅區</span></div><div class="garden-landscape-wrap" data-weather="${weather.mood}" data-season="autumn"><div class="garden-treescape">${rows.map(grove).join('')}</div></div><p class="garden-invite">🌿 ${trees.length} 棵樹，在大雅的陽光裡一起成長</p>`;
}
function renderView(){const collective=state.view!=='personal';$('#tree-scene').hidden=collective;document.querySelectorAll('.tree-view-button').forEach(b=>{b.classList.toggle('active',b.dataset.treeView===state.view);b.setAttribute('aria-pressed',String(b.dataset.treeView===state.view));});$('#tree-art').hidden=collective;$('#forest-art').hidden=!collective;$('#tree-weather').hidden=collective;$('#tree-action-dock').hidden=collective;$('#reading-status').hidden=collective;if(collective)forestSvg(state.view==='church');else renderTree();renderChallengeNotice();renderCareTools();renderInvitation();renderReadingAction();syncSceneMusic();}
function renderChallenges(){const box=$('#active-challenges');box.replaceChildren();const list=state.challenges.filter(c=>c.challenge_date<=today()).slice().reverse();const resolvedCount=list.filter(c=>c.status==='resolved').length;$('#challenge-count').textContent=String(list.filter(c=>c.status==='active').length);if(list.some(c=>c.status==='active'))$('#challenge-section').open=true;$('#challenge-reward-summary').textContent=resolvedCount?`🌟 已收藏 ${resolvedCount} 枚守護星光；每完成一次照顧，就看見小樹恢復一點。`:'🌟 每完成一次挑戰，就收藏 1 枚守護星光。';$('#challenge-empty').hidden=list.length>0;for(const c of list){const spec=labels[c.challenge_type];if(!spec)continue;const card=document.createElement('article');card.dataset.challengeId=c.id;card.className=`challenge-item${c.status==='resolved'?' resolved':''}`;card.innerHTML=`<div class="challenge-copy"><strong>${spec.icon} ${spec.title} · ${fmt(c.challenge_date)}</strong><small>${c.status==='resolved'?`已完成照顧：${spec.button.replace(/^\S+\s/u,'')}`:spec.text}</small><span class="challenge-impact">${c.status==='resolved'?'✓ 樹正在恢復':'需要一點陪伴'}</span>${c.status==='resolved'?'<span class="challenge-reward">🌟 獲得 1 枚守護星光</span>':''}</div>`;if(c.status==='active'){const b=document.createElement('button');b.type='button';b.disabled=state.writeBusy;b.textContent=spec.button;b.onclick=()=>resolve(c,b);card.append(b);}box.append(card);}}
async function refreshViews(){
  const tasks=[];
  if($('.leaderboard-card').open)tasks.push(api('leaderboard').then(rank=>{state.leaderboard=rank.members||[];renderLeaderboard();}));
  if(state.view!=='personal')tasks.push(api('garden').then(garden=>{state.garden=garden.trees||[];}));
  await Promise.all(tasks).catch(()=>showStatus('花園或排行暫時無法更新，請再試一次。','#view-status'));
  renderView();
}
function renderLeaderboard(){const list=$('#leaderboard');list.replaceChildren();for(const [i,m] of state.leaderboard.entries()){const row=document.createElement('li');row.innerHTML=`<span class="rank-num">${i+1}</span><span class="leader-name">${esc(m.display_name||'同工')}</span><span class="leader-meta">準時讀經</span><span class="leader-score">${m.on_time_count} 天</span>`;list.append(row);}if(!list.children.length)list.innerHTML='<li class="empty-note">測試開始後，這裡會記錄準時同行的腳步。</li>';}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function refresh(){const result=await api('me');showStatus('','#challenge-feedback');showStatus('','#tree-care-feedback');showStatus('');state.participant=result.participant;state.records=result.records||[];state.readingSaveError='';state.challenges=result.challenges||[];state.notes=result.notes||[];try{sessionStorage.removeItem('october-journal-updated');}catch{}$('#signed-member-name').textContent=state.participant.display_name||'同工';$('#signed-member-id').textContent='LINE 身分已驗證 · 十月隔離測試';$('#line-login-gate').hidden=true;$('#member-view').hidden=false;renderView();await refreshViews();}
async function loadScripture(requestedDate=''){const request=++scriptureRequest;state.loadedScriptureDate='';state.readingSaveError='';$('#mark-late').disabled=true;window.speechSynthesis?.cancel();const target=$('#scripture-text'),date=requestedDate||(isLaunch()?today():'2026-10-01'),isMakeup=date!==today();scriptureEndObserver?.disconnect();state.scriptureReadDate='';setReadingContext(date);$('#complete-reading-actions').hidden=true;$('#mark-read').disabled=true;target.replaceChildren();target.hidden=false;$('#audio-controls').hidden=true;$('#toggle-scripture').setAttribute('aria-expanded','true');$('#toggle-scripture').textContent='📖 收合完整經文';$('#passage-detail').textContent=isLaunch()?(isMakeup?`${fmt(date)} · 補讀經文載入中…`:`${fmt(date)} · 完整章節｜讀到最底後即可回樹下澆水`):'預覽十月首日完整經文；正式記錄自 10 月 1 日開始';const loading=document.createElement('p');loading.textContent='正在載入完整經文…';target.append(loading);try{const [chapter]=await loadScheduledChapters(prompt(date));if(request!==scriptureRequest)return;target.replaceChildren();const section=document.createElement('section');section.className='scripture-chapter';const h=document.createElement('h3');h.textContent=chapter.title;section.append(h);chapter.verses.forEach(v=>{const p=document.createElement('p');p.textContent=v;section.append(p)});target.append(section);const marker=document.createElement('span');marker.id='scripture-end';marker.className='scripture-end-marker';marker.setAttribute('aria-hidden','true');target.append(marker);state.passage=chapter.verses.join(' ');state.loadedScriptureDate=date;$('#audio-controls').hidden=false;$('#complete-reading-actions').hidden=false;$('#mark-read').hidden=isMakeup;$('#mark-late').hidden=!isMakeup;$('#mark-late').textContent=`讀完 ${fmt(date)}，回小樹澆水`;if(isMakeup){$('#passage-detail').textContent=`${fmt(date)} · 補讀經文已載入｜讀到最後再回小樹澆水`;$('#mark-late').disabled=true;showStatus(`正在補讀 ${fmt(date)} · 箴言 ${chapterDay(date)} 章。讀到最後，再回小樹澆水。`);}$('#scripture-read-hint').textContent='請滑到經文最後，解鎖讀完按鈕。';observeScriptureEnd(date);play('open');}catch(e){if(request!==scriptureRequest)return;target.textContent='經文暫時無法載入，請確認網路後重試。';const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='重新載入經文';retry.onclick=()=>loadScripture(date);target.append(retry);}}
function observeScriptureEnd(date){const marker=$('#scripture-end');if(!marker)return;const complete=()=>{if(state.loadedScriptureDate!==date)return;state.scriptureReadDate=date;scriptureEndObserver?.disconnect();renderTree();};if(!('IntersectionObserver' in window)){complete();return;}scriptureEndObserver?.disconnect();scriptureEndObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))complete();},{threshold:0.95});scriptureEndObserver.observe(marker);}
function sayScripture(){if(!window.speechSynthesis){showStatus('此瀏覽器不支援朗讀。');return;}const lines=[...$('#scripture-text').querySelectorAll('p')].map(p=>p.textContent.trim()).filter(Boolean);if(!lines.length){showStatus('先展開完整經文再開始朗讀。');return;}speechSynthesis.cancel();let index=0;const next=()=>{if(index>=lines.length){showStatus('朗讀完成，願神的話陪伴你。');return;}const u=new SpeechSynthesisUtterance(lines[index++]);u.lang='zh-TW';u.rate=.86;u.onend=next;speechSynthesis.speak(u);};next();showStatus('正在朗讀經文…');}
// Reuse native media elements: iOS authorizes each element during a trusted click.
// Keeping the effect element allows success sounds after asynchronous saves.
let backgroundAudio=null,effectAudio=null,musicVersion=0,musicStarting=false,musicStartFromGesture=false;
let effectVersion=0,effectStarting=false,effectsReady=false,effectsFailed=false;
function sceneMusic(){const kind=state.view==='personal'?primaryChallenge()?.challenge_type:'';return kind==='typhoon'||kind==='wind'?'storm':kind==='worm'||kind==='trouble'?'care':'reading';}
function syncSceneMusic(){const wanted=sceneMusic();$('#scene-music-label').textContent=state.sound?`♪ ${wanted==='storm'?'風雨中的陪伴':wanted==='care'?'小樹照顧時間':'安靜讀經時光'}`:'音樂與音效已關閉';if(state.sound&&backgroundAudio&&(!backgroundAudio.paused||musicStarting)&&backgroundAudio.dataset.track!==wanted)void startBackgroundMusic();}
function musicPlaying(){return Boolean(state.sound&&backgroundAudio&&!backgroundAudio.paused&&!backgroundAudio.error&&backgroundAudio.readyState>=2);}
function updateMusicButton(){
  const button=$('#sound-toggle'),playing=musicPlaying();
  const label=musicStarting?'正在開啟聲音':effectsFailed?'重新啟用音效':playing?'關閉音樂與音效':state.sound?'聲音已開啟，點一下開始播放':'開啟音樂與音效';
  button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(playing));button.dataset.enabled=String(state.sound);button.dataset.loading=String(musicStarting);button.disabled=musicStarting;const wanted=sceneMusic();$('#scene-music-label').textContent=state.sound?`♪ ${wanted==='storm'?'風雨中的陪伴':wanted==='care'?'小樹照顧時間':'安靜讀經時光'}`:'音樂與音效已關閉';
}
function createAudio(kind){
  const audio=document.createElement('audio');audio.preload='none';audio.hidden=true;audio.dataset.lifeTreeAudio=kind;audio.setAttribute('playsinline','');document.body.append(audio);return audio;
}
function audioURL(name){return new URL(`./assets/audio/life-tree/${name}.wav?v=20261010-audio1`,import.meta.url).href;}
function ensureAudio(){
  if(!backgroundAudio){
    backgroundAudio=createAudio('music');backgroundAudio.src=audioURL(sceneMusic());backgroundAudio.dataset.track=sceneMusic();backgroundAudio.loop=true;backgroundAudio.volume=.65;
    ['playing','pause','ended'].forEach(name=>backgroundAudio.addEventListener(name,updateMusicButton));
    backgroundAudio.addEventListener('error',()=>{updateMusicButton();if(state.sound)$('#music-status').textContent='音樂載入失敗，請點喇叭重試。';});
  }
  if(!effectAudio){effectAudio=createAudio('effect');effectAudio.volume=.85;}
}
async function boundedPlayback(audio){
  let deadline;
  try{await Promise.race([audio.play(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('audio_timeout')),6000);})]);}
  finally{clearTimeout(deadline);}
}
async function startBackgroundMusic(fromGesture=false){
  if(!state.sound||document.hidden)return;
  ensureAudio();
  // A trusted touch can supersede a pending autoplay attempt without waiting for its deadline.
  const track=sceneMusic(),sameTrack=backgroundAudio.dataset.track===track;
  if(sameTrack&&musicStarting&&(!fromGesture||musicStartFromGesture))return;
  if(!effectsReady&&(!effectStarting||fromGesture))void play('open',true);
  if(sameTrack&&musicPlaying())return;
  const version=++musicVersion;
  if(backgroundAudio.dataset.track!==track){backgroundAudio.pause();backgroundAudio.src=audioURL(track);backgroundAudio.dataset.track=track;}musicStarting=true;musicStartFromGesture=fromGesture;updateMusicButton();$('#music-status').textContent='正在載入音樂與音效…';
  try{
    if(backgroundAudio.error)backgroundAudio.load();
    await boundedPlayback(backgroundAudio);
    if(version!==musicVersion||!state.sound||document.hidden)return;
    if(!musicPlaying())throw Error('audio_paused');
    $('#music-status').textContent=effectsReady?'':'音效尚未啟動，請點喇叭重試。';
  }catch(error){
    if(version===musicVersion){backgroundAudio.pause();$('#music-status').textContent=error.name==='NotAllowedError'?'已記住音效設定，輕觸頁面即可播放。':'音樂尚未啟動，請點喇叭重試。';}
  }finally{if(version===musicVersion){musicStarting=false;musicStartFromGesture=false;updateMusicButton();}}
}
function stopBackgroundMusic(){
  ++musicVersion;++effectVersion;musicStarting=false;musicStartFromGesture=false;effectStarting=false;effectsReady=false;effectsFailed=false;
  backgroundAudio?.pause();effectAudio?.pause();updateMusicButton();
}
async function play(type,fromGesture=false){
  if(!state.sound||document.hidden)return;
  if(!fromGesture&&!effectsReady){if(!effectStarting)$('#music-status').textContent='請點喇叭啟用操作提示聲。';return;}
  ensureAudio();const version=++effectVersion;effectStarting=true;
  try{
    const name=['open','water','celebration','wind','journal'].includes(type)?type:'open';
    effectAudio.pause();effectAudio.src=audioURL(name);
    await boundedPlayback(effectAudio);
    if(version!==effectVersion||!state.sound||document.hidden)return;
    effectsReady=true;effectsFailed=false;updateMusicButton();
    if(fromGesture)$('#music-status').textContent=musicPlaying()?'':'音效已開啟；音樂尚未播放。';
  }catch(error){
    if(version===effectVersion){effectsReady=false;effectsFailed=error.name!=='NotAllowedError';effectAudio.pause();updateMusicButton();$('#music-status').textContent=error.name==='NotAllowedError'?'已記住音效設定，輕觸頁面即可播放。':'音效尚未啟動，請點喇叭重試。';}
  }finally{if(version===effectVersion)effectStarting=false;}
}
function renderReadingAction(){
  const loaded=state.loadedScriptureDate;
  for(const [selector,date] of [['#mark-read',today()],['#mark-late',loaded&&loaded!==today()?loaded:'']]){
    const button=$(selector),saved=date?record(date):null,busy=Boolean(date&&state.readingSaveDate===date&&state.writeBusy);
    const valid=date&&(date===today()||makeupWindowDates().includes(date));
    button.disabled=state.writeBusy||!isLaunch()||!valid||loaded!==date||(!saved&&state.scriptureReadDate!==date);
    button.textContent=busy?'正在記錄讀經…':saved?(saved.watered_at?`${fmt(date)} 已澆水，回到生命樹`:`${fmt(date)} 已記錄，前往澆水`):state.readingSaveError&&loaded===date?`重試記錄 ${fmt(date)}`:selector==='#mark-late'?(date?`讀完 ${fmt(date)}，回小樹澆水`:'補讀完成，回小樹澆水'):isLaunch()?'讀完了，前往小樹':'10 月 1 日開跑 · 讀完經文解鎖';
  }
  const busy=Boolean(loaded&&state.readingSaveDate===loaded&&state.writeBusy),saved=loaded?record(loaded):null;
  $('#complete-reading-actions').setAttribute('aria-busy',String(busy));
  $('#scripture-read-hint').textContent=busy?`${fmt(loaded)} 正在記錄，請稍候。`:state.readingSaveError?state.readingSaveError:saved?(saved.watered_at?`${fmt(loaded)} 的讀經與澆水已完成，可以回到生命樹。`:`${fmt(loaded)} 讀經已記錄，接著為小樹澆水。`):loaded&&state.scriptureReadDate===loaded?'讀到最後了！按下按鈕，帶你回小樹澆水 🌱':'請滑到經文最後，解鎖讀完按鈕。';
}
function returnToTree(date){
  const saved=record(date);if(!saved)return;
  ++viewRequest;$('.tree-view-switch').setAttribute('aria-busy','false');state.pendingWaterDate=saved.watered_at?'':date;state.view='personal';renderView();
  showStatus(saved.watered_at?`${fmt(date)} 讀經與澆水已完成，回到你的生命樹。`:`${fmt(date)} 讀經已記錄！接著為小樹澆水 🌱`);
  requestAnimationFrame(()=>scrollToSection(saved.watered_at?$('#tree-title'):$('#tree-water-stage')));
}
async function markRead(date=today()){
  if(state.writeBusy)return;
  if(record(date)){returnToTree(date);return;}
  if(state.scriptureReadDate!==date){state.readingSaveError='請先滑到完整經文最下方，再按讀完。';renderReadingAction();return;}
  state.writeBusy=true;state.readingSaveDate=date;state.readingSaveError='';++viewRequest;$('.tree-view-switch').setAttribute('aria-busy','false');renderView();showStatus('正在記錄讀經…');let saved=false;
  try{
    const out=await api('mark_read',{readingDate:date});
    if(!Array.isArray(out.records)||!out.records.some(row=>row.reading_date===date))throw Error('尚未確認讀經記錄，請重試或重新整理進度確認。');
    state.records=out.records;saved=true;
  }catch(error){state.readingSaveError=error.message;showStatus(error.message);}
  finally{state.writeBusy=false;state.readingSaveDate='';renderView();if(saved)returnToTree(date);}
}

function makeupWindowDates(){const start=state.participant?.reading_start_date||OCTOBER_TEST_WINDOW.start,dates=[];for(let offset=1;offset<=7;offset++){const d=new Date(Date.parse(`${today()}T12:00:00Z`)-offset*86400000).toISOString().slice(0,10);if(d>=start&&d>=OCTOBER_TEST_WINDOW.start&&d<=OCTOBER_TEST_WINDOW.end)dates.push(d);}return dates;}
function waterTarget(){const allowed=new Set([today(),...makeupWindowDates()]),valid=r=>r&&!r.watered_at&&allowed.has(r.reading_date);const pending=state.pendingWaterDate&&record(state.pendingWaterDate);if(valid(pending))return pending;const current=record();if(valid(current))return current;return [...state.records].sort((a,b)=>b.reading_date.localeCompare(a.reading_date)).find(valid)||null;}
function populateMakeupDates(){
  const select=$('#late-date');if(!select)return;const previous=select.value,dates=makeupWindowDates().filter(d=>!record(d)),pending=waterTarget();select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=dates.length?'選日期':'已讀完';select.append(placeholder);
  const box=$('#makeup-dates');box.replaceChildren();for(const d of dates){const option=document.createElement('option');option.value=d;option.textContent=`${fmt(d)} · 箴言 ${chapterDay(d)} 章`;select.append(option);const button=document.createElement('button');button.type='button';button.className='makeup-date';button.disabled=state.writeBusy||!isLaunch();button.setAttribute('aria-pressed',String(previous===d));const strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=fmt(d);small.textContent=`箴言 ${chapterDay(d)} 章`;button.append(strong,small);button.onclick=()=>chooseMakeup(d);box.append(button);}if(dates.includes(previous))select.value=previous;
  $('#makeup-short-count').textContent=dates.length?`${dates.length} 天待補讀`:pending?'有待澆水':'近 7 天已讀完';$('#go-makeup').dataset.attention=String(Boolean(dates.length||pending));$('#makeup-count').textContent=`${dates.length} 天可補讀`;$('#makeup-summary').textContent=dates.length?`還有 ${dates.length} 天的養分可以找回來，選一天開始吧。`:pending?'經文讀完了，還有活水等你澆灌。':'最近 7 天的經文都已讀過，繼續今天的同行。';
  const resume=$('#resume-watering');resume.hidden=!pending;resume.disabled=state.writeBusy||!isLaunch();if(pending)resume.textContent=`💧 ${fmt(pending.reading_date)} 已讀完，繼續澆水`;
  const start=state.participant?.reading_start_date||OCTOBER_TEST_WINDOW.start,cutoff=new Date(Date.parse(`${today()}T12:00:00Z`)-7*86400000).toISOString().slice(0,10);let expired=0;for(let day=1;day<=31;day++){const d=`2026-10-${String(day).padStart(2,'0')}`;if(d>=start&&d<cutoff&&d<today()&&!record(d))expired++;}$('#makeup-expired').textContent=expired?`另有 ${expired} 天已超過最近 7 天的補讀期限。先從仍可補讀的日期繼續，不用一次追完。`:'';
}
async function chooseMakeup(date){if(state.writeBusy||!isLaunch()||!makeupWindowDates().includes(date)||record(date))return;$('#late-date').value=date;scrollToSection($('.reading-card'));await loadScripture(date);}
async function water(){
  if(state.writeBusy)return;const button=$('#care-tree'),target=waterTarget();
  if(!target){showStatus('先完成今天的讀經，才能為生命樹澆水。');return;}
  state.writeBusy=true;button.disabled=true;button.textContent='正在澆水…';showStatus('正在為生命樹澆水…');let saved=false;
  try{const result=await api('water_tree',{readingDate:target.reading_date});state.pendingWaterDate='';state.records=result.records||state.records;saved=true;showStatus('澆水完成！讓神的話繼續陪伴今天。');}
  catch(error){showStatus(error.message);}
  finally{state.writeBusy=false;renderView();if(saved){challengeFx('celebration');play('celebration');}}
}
async function resolve(challenge,button,nearTree=false){
  if(!state.challenges.some(row=>String(row.id)===String(challenge.id)&&row.status==='active'))return;
  if(state.writeBusy){showStatus('目前正在儲存，請稍候再照顧小樹。','#challenge-feedback');return;}state.writeBusy=true;document.querySelectorAll('#tree-care-tools button,#active-challenges button').forEach(b=>b.disabled=true);button.textContent='正在照顧小樹…';showStatus('正在照顧小樹…','#challenge-feedback');showStatus('正在照顧小樹…','#tree-care-feedback');let saved=false;
  try{const spec=labels[challenge.challenge_type],result=await api('resolve_challenge',{challengeId:challenge.id,resolutionAction:spec.action});state.challenges=result.challenges||state.challenges;saved=true;const message=activeChallenges().length?`已完成這次照顧！還有 ${activeChallenges().length} 項，繼續陪小樹面對。`:'照顧完成！所有風雨都已處理，小樹恢復了。獲得 1 枚守護星光。';showStatus(message);showStatus(message,'#challenge-feedback');showStatus(message,'#tree-care-feedback');}
  catch(error){showStatus(error.message);showStatus(error.message,'#challenge-feedback');showStatus(error.message,'#tree-care-feedback');}
  finally{state.writeBusy=false;renderView();const feedback=$(nearTree?'#tree-care-feedback':'#challenge-feedback');const retry=nearTree?[...document.querySelectorAll('#tree-care-tools button')].find(b=>b.dataset.careId===String(challenge.id)):[...$('#active-challenges').children].find(card=>card.dataset.challengeId===challenge.id)?.querySelector('button');if(saved){feedback.tabIndex=-1;feedback.focus({preventScroll:true});}else retry?.focus({preventScroll:true});if(saved){careToolSuccess(challenge.challenge_type);challengeFx(challenge.challenge_type==='worm'?'worm':'water');play(challenge.challenge_type==='worm'?'worm':'wind');}}
}
async function liveWeather(){try{const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude=24.229&longitude=120.653&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FTaipei',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error();const d=await r.json();weather.code=d.current.weather_code;weather.temp=Math.round(d.current.temperature_2m);weather.wind=d.current.wind_speed_10m;weather.updated=new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Taipei'}).format(new Date(d.current.time));const c=weather.code;weather.mood=[95,96,99].includes(c)?'storm':[51,53,55,56,57,61,63,65,66,67,80,81,82,71,73,75,77,85,86].includes(c)?'rain':[45,48,3].includes(c)?'cloudy':[1,2].includes(c)?'partly-cloudy':weather.wind>=30?'windy':'sunny';if(state.participant&&!state.writeBusy)renderView();}catch{weather.updated='即時資料暫時無法連線';}}
async function signIn(){if(!window.liff?.isLoggedIn()){$('#line-login-gate').hidden=false;showStatus('LINE 驗證尚未完成，請回到 LINE 群組重新開啟專用連結。','#login-status');return;}state.idToken=window.liff.getIDToken()||'';if(!state.idToken){$('#line-login-gate').hidden=false;$('#login-member').disabled=true;showStatus('LINE 登入資訊不完整，請重新從同工群組的測試連結開啟。','#login-status');return;}try{await refresh();}catch(e){$('#line-login-gate').hidden=false;if(e.code==='join_required'){$('#login-member').disabled=false;$('#login-member-id').textContent='LINE 身分已確認';showStatus('已確認 LINE 身分，輸入同工邀請碼加入測試。','#login-status');}else{$('#login-member').disabled=true;showStatus(`${e.message} 請確認網路後重新整理。`,'#login-status');}}}
async function join(){const b=$('#login-member');b.disabled=true;try{const result=await api('join',{inviteCode:$('#invite-code').value.trim()});state.participant=result.participant;await refresh();}catch(e){showStatus(e.message,'#login-status');}finally{b.disabled=false;}}
function setup(){
  document.querySelectorAll('[data-guide-icon]').forEach(node=>node.replaceChildren(createAppIcon(node.dataset.guideIcon,'guide-icon')));
  window.addEventListener('pageshow',async event=>{if(!event.persisted)return;let changed=false;try{changed=sessionStorage.getItem('october-journal-updated')==='1';}catch{}if(!changed||!state.participant||state.writeBusy)return;state.writeBusy=true;try{await refresh();try{sessionStorage.removeItem('october-journal-updated');}catch{}}catch{showStatus('手札已儲存，樹的收藏數尚未更新，請按重新整理進度。','#progress-status');}finally{state.writeBusy=false;renderView();}});
  updateMusicButton();$('#music-status').textContent='';
  let guideReturnFocus=null;
  const showGuide=()=>{guideReturnFocus=document.activeElement;$('#journey-guide-audio').checked=guideSeen()?state.sound:true;$('#journey-guide').showModal();$('#journey-guide-title').focus();};
  $('#show-journey-guide').onclick=showGuide;
  $('#journey-guide-form').onsubmit=event=>{event.preventDefault();if(!$('#journey-guide').open)return;state.sound=$('#journey-guide-audio').checked;rememberMusic();try{localStorage.setItem('october-life-tree-guide-v1','1');}catch{}$('#journey-guide').close();if(state.sound)void startBackgroundMusic(true);else{stopBackgroundMusic();$('#music-status').textContent='';}const target=guideReturnFocus?.matches('button,a')?guideReturnFocus:state.participant?$('#read-today'):$('#show-journey-guide');target.focus({preventScroll:true});};
  $('#journey-guide').addEventListener('cancel',event=>{if(!guideSeen())event.preventDefault();});
  if(!guideSeen())showGuide();
  const resumeMusic=event=>{if(!event.isTrusted||$('#journey-guide').open||event.target?.closest?.('#sound-toggle,#show-journey-guide'))return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;if(state.sound)void startBackgroundMusic(true);};
  ['touchend','click','keydown'].forEach(name=>document.addEventListener(name,resumeMusic,{capture:true,passive:true}));
  const pauseForBackground=()=>{stopBackgroundMusic();if(state.sound)$('#music-status').textContent='聲音已暫停，點一下頁面即可恢復。';};
  const resumeRememberedMusic=()=>{if(state.sound&&!$('#journey-guide').open)void startBackgroundMusic();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseForBackground();else resumeRememberedMusic();});
  window.addEventListener('pagehide',pauseForBackground);
  window.addEventListener('pageshow',()=>{restoreTreeScroll();resumeRememberedMusic();});
  resumeRememberedMusic();
  $('#sound-toggle').onclick=()=>{if(musicPlaying()&&!effectsFailed){state.sound=false;stopBackgroundMusic();$('#music-status').textContent='';}else{state.sound=true;void startBackgroundMusic(true);}rememberMusic();};
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
  $('#read-today').onclick=async()=>{if(state.writeBusy)return;if(record()&&!record().watered_at){returnToTree(today());return;}scrollToSection($('.reading-card'));if($('#scripture-text').hidden||state.loadedScriptureDate!==today())await loadScripture(today());};
  document.querySelectorAll('.devotional-entry').forEach(link=>link.addEventListener('click',event=>{if(state.writeBusy){event.preventDefault();showStatus('請等目前的儲存完成，再進入靈修。');return;}try{sessionStorage.setItem('october-tree-return-scroll',String(window.scrollY));}catch{}dismissDevotionalDock();}));
  $('#dismiss-devotional-dock').onclick=()=>{dismissDevotionalDock();const tree=$('.tree-card');tree.tabIndex=-1;tree.focus({preventScroll:true});};
  document.addEventListener('focusin',syncDevotionalDock);document.addEventListener('focusout',()=>requestAnimationFrame(syncDevotionalDock));
  new ResizeObserver(measureDevotionalDock).observe($('#devotional-dock'));
  $('#go-care-challenges').onclick=goCareTools;$('#go-tree-care').onclick=goCareTools;$('#go-makeup').onclick=()=>scrollToSection($('#makeup-section'));$('#resume-watering').onclick=()=>{if(state.writeBusy)return;const pending=waterTarget();if(pending)returnToTree(pending.reading_date);};
  $('#login-member').onclick=join;$('#mark-read').onclick=()=>markRead();$('#care-tree').onclick=water;
  $('#toggle-scripture').onclick=()=>{if(state.writeBusy)return;return $('#scripture-text').hidden?loadScripture(state.loadedScriptureDate||''):(()=>{++scriptureRequest;scriptureEndObserver?.disconnect();$('#scripture-text').hidden=true;$('#complete-reading-actions').hidden=true;$('#audio-controls').hidden=true;$('#toggle-scripture').setAttribute('aria-expanded','false');$('#toggle-scripture').textContent='📖 展開完整經文';window.speechSynthesis?.cancel();})();};
  $('#read-aloud').onclick=sayScripture;$('#stop-reading').onclick=()=>{window.speechSynthesis?.cancel();showStatus('已停止朗讀。');};
  $('#late-date').addEventListener('change',()=>{const date=$('#late-date').value;$('#mark-late').disabled=true;if(!date){++scriptureRequest;state.loadedScriptureDate='';return;}void chooseMakeup(date);});
  $('#mark-late').onclick=()=>{const date=state.loadedScriptureDate;if(!date||date===today()){showStatus('請先選擇並載入補讀日期。');return;}void markRead(date);};

}
async function start(){if(new URLSearchParams(location.search).get('view')==='devotional'&&new URLSearchParams(location.search).get('from')==='october-tree'&&new URLSearchParams(location.search).get('preview')==='1'){await import('./october-devotional-shell.mjs?v=20261010-tree-guide1').then(module=>module.openOctoberDevotional());return;}setReadingContext(today());setup();void liveWeather();window.setInterval(()=>{if(!document.hidden)void liveWeather();},15*60*1000);if(!OCTOBER_TEST_LIFF_ID||!OCTOBER_TEST_API){$('#line-login-gate').hidden=false;showStatus('測試頁尚未完成設定。','#login-status');return;}try{await window.liff.init({liffId:OCTOBER_TEST_LIFF_ID});if(!window.liff.isInClient()){$('#line-login-gate').hidden=false;showStatus('請從 LINE 聊天室的 LIFF 專用連結開啟，才能在 LINE 內完成登入。','#login-status');return;}if(!window.liff.isLoggedIn()){$('#line-login-gate').hidden=false;$('#login-member-id').textContent='LINE 驗證尚未完成';showStatus('LINE 內登入尚未完成，請關閉視窗，再從 LINE 群組的 LIFF 專用連結開啟。','#login-status');return;}await signIn();restoreTreeScroll();}catch(e){$('#line-login-gate').hidden=false;showStatus('LINE 登入暫時無法使用，請重新整理。','#login-status');}}
start();
