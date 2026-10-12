import {initMember,memberAPI,memberData,preferences,savePreferences,renderMember,prepareReading,themeAudio,setupMemberControls,itemName,cancelReading,duckTheme} from './tree-game-member.mjs?v=20261012-october-game1';
import {FESTIVAL_ITEMS,collectibleArt} from './tree-game-collectibles.mjs';
import { LEVELS, readingProgress, dateAtOffset } from './tree-game-progress.mjs?v=20261012-member1';
import { GARDEN_EVENTS, eventById, eventDeck, shuffled } from './tree-game-events.mjs';
import { GardenAudio } from './tree-game-audio.mjs?v=20261012-october-game1';
import {createOctoberCombat} from './tree-game-october-combat.mjs?v=20261012-october-game1';

const $ = selector => document.querySelector(selector);
function taipeiDay() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
let today = taipeiDay();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const ATLAS = 'assets/garden-atlas.png';
const AVATAR_ATLAS = 'assets/garden-avatars-v2.png';
const AVATARS = ['male', 'female'].flatMap((gender, row) => Array.from({ length: 3 }, (_, column) => ({
  id: `${gender}-${column + 1}`, gender, name: `${gender === 'male' ? '男生' : '女生'}・${['森林綠', '晴空藍', '暖莓紅'][column]}`,
  rect: [column * 408, row * 642.5, 408, 642.5],
})));
function avatarSprite(id) {
  const avatar = AVATARS.find(item => item.id === id);
  if (!avatar) return `<span class="guardian-placeholder">${icon('friend')}</span>`;
  const rect = avatar.rect, clip = `garden-avatar-${++spriteSequence}`;
  return `<svg class="game-sprite" viewBox="${rect.join(' ')}" aria-hidden="true"><defs><clipPath id="${clip}"><rect x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}"/></clipPath></defs><image href="${AVATAR_ATLAS}" width="1224" height="1285" clip-path="url(#${clip})"/></svg>`;
}
const rects = {
  sapling: [50, 50, 262, 310], tree: [380, 0, 320, 360], bloom: [703, 0, 420, 360],
  guardian: [1132, 0, 245, 367], bag: [28, 395, 300, 313], openBag: [389, 372, 304, 338],
  sword: [820, 355, 170, 375], shield: [1130, 370, 265, 352], belt: [22, 820, 320, 185],
  breastplate: [370, 720, 325, 360], boots: [728, 758, 351, 284], helmet: [1123, 720, 278, 359],
};
const equipment = [
  { id: 'belt', name: '真理腰帶', days: 3, copy: '把真理繫在心上。練習辨認謊言，選擇誠實的行動。', title: '把真理繫在心上', scenario: '做錯事時，我很怕被責備，想把事情藏起來。', reminder: '今天，讓真理幫助我站穩。', action: '扣上真理腰帶', options: ['誠實承認，尋求幫助', '用另一個謊言藏起來'], correct: 0 },
  { id: 'breastplate', name: '公義護心鏡', days: 5, copy: '擦亮護心鏡，在生活裡選擇誠實、公平與憐憫。', title: '擦亮護心鏡，守護我的心', scenario: '用手指慢慢擦開灰霧，讓護心鏡重新發光。也可以點下方按鈕。', reminder: '今天，我願意公平對待身邊的人。', action: '擦亮一部分', options: [] },
  { id: 'boots', name: '平安福音的鞋', days: 7, copy: '沿著祝福的小徑，走向需要關心的人。', title: '走一條祝福的路', scenario: '有人今天感到孤單。讓我們帶著一句祝福，走近他。', reminder: '今天，我願意主動關心一個人。', action: '往前一步', options: [] },
  { id: 'shield', name: '信心盾牌', days: 10, copy: '倚靠神站穩，舉起盾牌抵擋試探的火箭。', title: '站穩，別怕', scenario: '火箭正在靠近。點按盾牌，或按下「舉起盾牌」守護花園。', reminder: '遇到困難，我可以倚靠神，也可以尋求幫助。', action: '舉起盾牌', options: [] },
  { id: 'helmet', name: '救恩頭盔', days: 14, copy: '一片一片拼出盼望，記得神的拯救。', title: '記得我的盼望', scenario: '依序點選三片盼望拼圖，讓救恩頭盔亮起。', reminder: '今天，帶著神所賜的盼望出發。', action: '點亮下一片', options: ['神的拯救', '神的慈愛', '在主裡有盼望'] },
  { id: 'sword', name: '聖靈寶劍', days: 21, copy: '拿起神的話。揮出經文之光，驅散花園裡的黑霧。', title: '讓真理點亮前路', scenario: '花園裡出現小黑影。從裝備包取出寶劍，讓經文之光照亮前路。', reminder: '寶劍所指的是神的話。把今天的話，帶進生活裡。', action: '揮出經文之光', options: [] },
];
const decorations = [
  { id: 'flower', name: '祝福小花', copy: '種在小樹旁，讓花園多一份美好。', days: 1 },
  { id: 'lamp', name: '暖光小燈', copy: '把一盞溫暖的小燈，放在小樹旁。', days: 3 },
  { id: 'bird', name: '同行小鳥', copy: '讓小鳥停在樹旁，陪你慢慢長大。', days: 7 },
  { id: 'fountain', name: '活水噴泉', copy: '讓花園多一處活水，收藏每天的滋養。', days: 14 },
  { id: 'fruit', name: '祝福果實', copy: '把祝福果實掛在樹上，記得一路的恩典。', days: 30 },
  ...FESTIVAL_ITEMS,
];
const graceEffects={flower:'補充信心 HP +20',lamp:'補充盼望 MP +20',bird:'下一次讀經 20 → 40 XP',fountain:document.body.dataset.octoberTest==='true'?'下次澆水，HP、MP 各額外補充 10':'下次收到關懷，HP、MP 各額外補充 10',fruit:'接下來 3 次讀經 20 → 40 XP'};
const iconPaths = {
  leaf: '<path d="M20 3C9 2 3 6 4 13c1 7 10 7 13 1 2-4 2-8 3-11Z"/><path d="m3 21 11-12"/>',
  book: '<path d="M12 5C8 3 4 3 2 5v15c3-2 6-2 10 0 4-2 7-2 10 0V5c-3-2-7-2-10 0Zm0 0v15"/>',
  water: '<path d="M12 2c-3 5-7 9-7 13a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  journal: '<path d="M5 3h13v18H5ZM8 3v18m3-13h4m-4 4h4m-4 4h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  bag: '<path d="M6 8V6a6 6 0 0 1 12 0v2M6 8h12l2 12H4Zm2 5h8v7M9 8v2m6-2v2"/>',
  gift: '<path d="M3 8h18v5H3Zm2 5v9h14v-9M12 8v14"/><path d="M12 8C3 8 6-2 12 8Zm0 0c9 0 6-10 0 0Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart: '<path d="M12 21C-4 11 3 0 12 7c9-7 16 4 0 14Z"/><path d="m13 7-3 5 4 2-3 5"/>',
  whisper: '<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 9h8m-8 3h5"/>',
  friend: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  arrows: '<path d="m3 21 18-18m-7 0h7v7M3 13l8-8m-5 0h5v5m2 11 8-8m-5 0h5v5"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  sound: '<path d="m11 4-5 4H3v8h3l5 4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-5 4H3v8h3l5 4Zm5 5 6 6m0-6-6 6"/>',
  flower: '<path d="M12 10C3-4-3 10 8 12-3 17 8 27 12 16c4 11 15 1 4-4 11-2 5-16-4-2Z" fill="#e5b09d" stroke="#d18c77"/><circle cx="12" cy="12" r="3" fill="#f3d688"/><path d="M12 17v7" stroke="#6e8c50"/>',
  lamp: '<path d="M8 6h8l2 12H6Zm4-5v5m-4 15h8M12 18v3" fill="#e9c873" stroke="#8f793f"/><path d="M11 10h2v5h-2" stroke="#fff9d8"/>',
  fountain: '<path d="M3 18h18l-3 4H6Zm9 0V6m0 8C5-1 3 9 4 12m8 2C19-1 21 9 20 12" stroke="#9ad4d5"/><path d="M9 6h6M6 18h12" stroke="#b5af86"/>',
  fruit: '<path d="M12 7C1 2 1 20 10 22c2-1 2-1 4 0 9-2 9-20-2-15Z" fill="#ddb36c" stroke="#ad8a46"/><path d="M12 8V2c5-1 6 2 0 3" stroke="#688b51"/><path d="M7 11v4" stroke="#fff1bd"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.leaf}</svg>`;
let spriteSequence = 0;
function sprite(id) {
  const rect = rects[id] || rects.sword;
  const clip = `garden-sprite-${++spriteSequence}`;
  return `<svg class="game-sprite" viewBox="${rect.join(' ')}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><clipPath id="${clip}"><rect x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}"/></clipPath></defs><image href="${ATLAS}" width="1448" height="1086" clip-path="url(#${clip})"/></svg>`;
}
const decorationArt = id => collectibleArt(id) || (id === 'bird' ? '<img class="bird-art" src="assets/garden-bird.svg" alt="" width="120" height="120">' : icon(id));
const itemArt = item => rects[item.id] ? sprite(item.id) : `<span class="decoration-icon">${decorationArt(item.id)}</span>`;
const hasBattle = date => state.battles.some(battle => (typeof battle === 'string' ? battle : battle?.reading_date) === date);
const battleReward = () => state.encounters[today]?.boss ? 30 : 10;
let state = {...await initMember(),...preferences()}, category = 'armor', selected = 'sword', busy = false, quest = null, questEpoch = 0, eventContext = null, eventSelection = null, toastTimer, sceneTimer;
let previousXP = null, avatarGender = null, avatarChoice = null, victoryTimer;
today=memberData.today;
const audio = new GardenAudio(message => { $('#audio-status').textContent = message; });
const dialogOpeners = new Map();
let remoteBusy=false,readingDay=today;
const pendingCommands=new Map();
const octoberCombat=createOctoberCombat({getState:()=>state,getQuest:()=>quest,send:change,isSaving:()=>remoteBusy,renderAvatar:()=>avatarSprite(state.avatarId),sound});
function persist(){savePreferences(state);}
async function change(action,payload={}){
 if(remoteBusy)throw Error('上一個操作正在保存，請稍候。');
 remoteBusy=true;document.body.setAttribute('aria-busy','true');
 const key=JSON.stringify([action,payload]),requestId=pendingCommands.get(key)||crypto.randomUUID();pendingCommands.set(key,requestId);
 try{const result=await memberAPI(action,{...payload,requestId});const prefs=preferences();state={...memberData.state,...prefs};today=memberData.today;pendingCommands.delete(key);updateProgress();renderGuardian();renderDecorations();renderMember(state);return result;}
 catch(e){announce(e.message);throw e;}
 finally{remoteBusy=false;document.body.setAttribute('aria-busy','false');}
}
async function attempt(work){try{await work();}catch(e){announce(e.message);}}
async function refreshMember(){try{await change('me');announce('雲端進度已重新整理。');}catch{}}
function announce(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300); }
function saveMessage(message) { announce(message); }
function sound(kind) { audio.effect(kind); }
function setAudioMode(mode) {
  audio.setMode(mode); themeAudio(mode,state,audio);
  $('#audio-mode').textContent = { garden: '花園晨光', event: '事件出現 · 懸疑節奏', battle: '守護花園 · 戰鬥', boss: 'Boss 挑戰 · 加速戰鬥', victory: '勝利的光' }[mode];
  document.body.dataset.audioMode = mode;
}
function syncAudioScene() {
  clearTimeout(victoryTimer);
  setAudioMode($('#quest-dialog').open ? quest?.complete ? 'garden' : quest?.boss ? 'boss' : 'battle' : $('#event-dialog').open ? eventContext?.boss ? 'boss' : 'event' : 'garden');
}
function celebrateAudio() {
  setAudioMode('victory'); clearTimeout(victoryTimer);
  victoryTimer = setTimeout(syncAudioScene, 3200);
}
function openDialog(id, opener = document.activeElement) {
  const dialog = document.getElementById(id);
  dialogOpeners.set(id, opener);
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('body-dialog-open');
  dialog.querySelector('button:not(:disabled), textarea')?.focus({ preventScroll: true });
}
function closeDialog(id) {
  if (id === 'avatar-dialog' && !state.avatarId) { $('#avatar-status').textContent = '先選一位喜歡的角色，再一起出發。'; return; }
  const dialog = document.getElementById(id);
  if (id === 'quest-dialog') { octoberCombat.stop(false);questEpoch++; quest = null; }
  if (id === 'event-dialog') { eventContext = null; eventSelection = null; }
  if (id === 'reading-dialog') { cancelReading();window.speechSynthesis?.cancel(); audio.duck(false);duckTheme(false); }
  dialog.close();
  if (!document.querySelector('dialog[open]')) document.body.classList.remove('body-dialog-open');
  if (['quest-dialog', 'event-dialog'].includes(id)) syncAudioScene();
  const opener = dialogOpeners.get(id);
  if (opener?.isConnected && !opener.disabled) opener.focus({ preventScroll: true });
}
function progress() { return readingProgress({ ...state, today }); }
function updateProgress() {
  const p = progress(), old = previousXP === null ? null : LEVELS.filter(level => level.xp <= previousXP).at(-1);
  $('#growth-title').textContent = `Lv.${p.current.level} ${p.current.name}`;
  $('#xp-total').textContent = p.xp.toLocaleString('zh-TW');
  $('#xp-fill').style.width = `${Math.round(p.fraction * 100)}%`;
  $('#xp-track').setAttribute('aria-valuenow', String(Math.round(p.fraction * 100)));
  $('#xp-track').setAttribute('aria-valuetext', p.next ? `累積 ${p.xp} XP，距離${p.next.name}還差 ${p.remaining} XP` : '已達目前最高階段，經驗持續累積');
  $('#xp-percent').textContent = `${Math.round(p.fraction * 100)}%`;
  $('#xp-stage').textContent = p.next ? `本級 ${p.xp - p.current.xp}／${p.next.xp - p.current.xp} XP` : '已達目前最高階段';
  $('#next-growth').textContent = p.next ? `再累積 ${p.remaining} XP，就會長成「${p.next.name}」。` : '經驗持續累積，與小樹一起同行。';
  $('#reading-days').textContent = `已同行 ${p.days} 天`; $('#reading-streak').textContent = `連續 ${p.streak} 天`;
  const tree = $('#tree-object');
  if (tree.dataset.art !== p.current.art) { tree.innerHTML = sprite(p.current.art); tree.dataset.art = p.current.art; }
  tree.dataset.level = String(p.current.level); tree.setAttribute('aria-label', `Lv.${p.current.level} ${p.current.name}，累積 ${p.xp} XP 的生命樹`);
  $('#water').disabled = !p.todayRecord || !!p.todayRecord.watered_at || busy;
  $('#journal-open').disabled = !p.todayRecord || busy;
  $('#read-open').querySelector('span:nth-child(2)').innerHTML = `${p.todayRecord ? '再讀一次今日經文' : '開始今日讀經'}<small>試讀 · 以弗所書 6:17</small>`;
  $('#read-open').querySelector('strong').textContent = p.todayRecord ? '已完成' : '+20 XP';
  $('#water').querySelector('span:nth-child(2)').innerHTML = p.todayRecord?.watered_at ? '已澆水<small>今天的活水已送達</small>' : '澆水 <small>+5 XP</small>';
  $('#daily-status').textContent = p.todayRecord?.watered_at ? '讀經與澆水已完成，謝謝你今天的陪伴。' : p.todayRecord ? '讀經已保存，現在可以為小樹澆水。' : '打開今日箴言，讓神的話陪伴你；也能自由參加花園挑戰。';
  renderEncounter(); renderMember(state);
  $('#journey-list').replaceChildren(...LEVELS.map(level => {
    const row = document.createElement('li'); row.classList.toggle('is-current', level.level === p.current.level);
    row.innerHTML = `<span>${level.level}</span><div><strong>${level.name}</strong><small>累積 ${level.xp.toLocaleString()} XP</small></div><em>${level.level === p.current.level ? '目前階段' : level.xp <= p.xp ? '已達成' : '等待成長'}</em>`;
    return row;
  }));
  if (old && p.current.level > old.level) {
    tree.classList.remove('is-growing'); requestAnimationFrame(() => tree.classList.add('is-growing'));
    const celebration = document.createElement('div'); celebration.className = 'growth-celebration';
    celebration.innerHTML = `<div><strong>小樹長大了！</strong><span>Lv.${p.current.level} ${p.current.name} · 累積 ${p.xp} XP</span></div>`;
    document.body.append(celebration); sound('level'); setTimeout(() => celebration.remove(), motion.matches ? 1800 : 2800);
  }
  previousXP = p.xp;
}
function ensureEncounter(){return state.encounters[today];}
function dailyEvent() {
  const encounter = state.encounters[today];
  if (encounter.stage >= encounter.events.length || hasBattle(today)) return null;
  return { date: today, id: encounter.events[encounter.stage], index: encounter.stage, practice: false, boss: encounter.boss && encounter.stage >= 3 };
}
function eventArt(event, boss = false) {
  if (boss || event.art === 'shadow') return `<span class="event-shadow shadow-art" style="--shadow-index:${boss ? 1 : 0}"></span>`;
  return `<span class="event-symbol event-symbol-${event.art}">${icon(event.art)}</span>`;
}
function renderEncounter() {
  const encounter = state.encounters[today], context = dailyEvent(), container = $('#garden-enemies');
  container.replaceChildren();
  if (context) {
    const event = eventById(context.id), button = document.createElement('button');
    button.type = 'button'; button.className = `garden-event-marker${context.boss ? ' marker-boss' : ''}`;
    button.setAttribute('aria-label', `${context.boss ? 'Boss 挑戰：' : '花園事件：'}${event.title}，打開裝備包選擇軍裝`);
    button.innerHTML = `${eventArt(event, context.boss)}<strong>${context.boss ? '稀有 Boss · 3 倍 XP' : event.title}</strong>${context.boss ? `<i class="boss-hp"><span style="width:${(6 - context.index) / 3 * 100}%"></span></i>` : ''}`;
    button.onclick = () => openEvent(context); container.append(button);
  }
  $('#defend-garden').hidden = !context;
  $('#defend-garden').textContent = context?.boss ? '判斷事件，選擇軍裝' : `處理花園事件 · ${Math.min(encounter.stage + 1, 6)}／6`;
  $('#scene-caption').textContent = context ? `${context.boss ? 'Boss 挑戰：' : ''}${eventById(context.id).title}` : '六件軍裝都派上用場，花園重新明亮。';
  $('#battle-status').textContent = hasBattle(today) ? `今日守護已完成 · +${battleReward()} XP 已收藏` : `今日事件 ${encounter.stage}／6 · 全部完成 +${battleReward()} XP${encounter.boss ? ' · 稀有 Boss 日' : ''}`;
}
function openEvent(context = dailyEvent()) {
  if (!context || !eventById(context.id)) { announce('今日守護已完成，可以體驗其他事件，或開始讀經。'); return; }
  eventContext = { ...context }; eventSelection = null;
  const event = eventById(context.id);
  $('#event-title').textContent = event.title;
  $('#event-story').textContent = event.story;
  $('#event-kicker').textContent = context.practice ? context.boss ? `Boss 三階段體驗 · ${context.index + 1}／3 · 不加分` : '事件體驗 · 不加分' : `今日事件 ${context.index + 1}／6${context.boss ? ' · Boss 挑戰' : ''}`;
  $('#event-art').innerHTML = eventArt(event, context.boss) + (context.boss ? `<i class="boss-hp" aria-hidden="true"><span style="width:${(context.practice ? 3 - context.index : 6 - context.index) / 3 * 100}%"></span></i>` : '');
  $('#event-art').dataset.kind = context.boss ? 'boss' : event.art;
  $('#event-bag').innerHTML = sprite('openBag');
  $('#event-feedback').dataset.result = 'ready'; $('#event-feedback').innerHTML = '<span class="event-result-mark" aria-hidden="true">?</span><span>打開裝備包，選一件適合這個事件的軍裝。</span>';
  $('#event-use').disabled = true; $('#event-use').textContent = '先選擇裝備';
  $('#event-choices').replaceChildren(...shuffled(equipment).map(item => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.gear = item.id; button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="item-sprite">${sprite(item.id)}</span><strong>${item.name}</strong>`;
    button.onclick = () => selectEventGear(item, button);
    return button;
  }));
  openDialog('event-dialog'); syncAudioScene(); sound('bag');
}
function selectEventGear(item, button) {
  if (!eventContext) return;
  const event = eventById(eventContext.id), correct = item.id === event.gear;
  eventSelection = correct ? item.id : null;
  $('#event-choices').querySelectorAll('button').forEach(choice => { choice.setAttribute('aria-pressed', String(choice === button)); choice.removeAttribute('data-result'); });
  button.dataset.result = correct ? 'correct' : 'wrong';
  $('#event-feedback').dataset.result = correct ? 'correct' : 'wrong';
  $('#event-feedback').innerHTML = `<span class="event-result-mark" aria-hidden="true">${icon(correct ? 'check' : 'close')}</span><span>${correct ? `選對了！取出${item.name}，用行動回應這個事件。` : `這件裝備不適合這個事件。${event.hint}`}</span>`;
  $('#event-use').disabled = !correct;
  $('#event-use').textContent = correct ? `取出${item.name}，開始使用` : '換一件裝備，再試一次';
  sound(correct ? 'pick' : 'wrong');
}
function beginEventQuest() {
  const context = eventContext;
  if (!context || eventSelection !== eventById(context.id)?.gear) return;
  if (!context.practice && (context.date !== today || context.index !== state.encounters[today].stage || hasBattle(today))) {
    closeDialog('event-dialog'); renderEncounter(); announce('這個事件已完成，請從花園開啟目前的事件。'); return;
  }
  openQuest(equipment.find(item => item.id === eventSelection), context);
}
function renderEventLibrary() {
  $('#event-library-list').replaceChildren(...GARDEN_EVENTS.map(event => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'event-library-card';
    button.innerHTML = `${eventArt(event)}<span><strong>${event.title}</strong><small>判斷事件 → 選擇軍裝 → 使用</small></span>`;
    button.onclick = () => openEvent({ id: event.id, index: 0, practice: true, boss: false }); return button;
  }));
}
function renderGuardian() {
  $('#guardian-base').innerHTML = avatarSprite(state.avatarId);
  $('#guardian-gear').innerHTML = state.equipped.map(id => `<span class="guardian-slot slot-${id}">${sprite(id)}</span>`).join('');
  $('#guardian').setAttribute('aria-label', `${AVATARS.find(avatar => avatar.id === state.avatarId)?.name || '尚未選擇角色'}，花園守護者${state.equipped.length ? '，已穿戴' + state.equipped.map(id => equipment.find(item => item.id === id).name).join('、') : '，尚未穿戴軍裝'}`);
}
function renderAvatarChoices() {
  document.querySelectorAll('[data-gender]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.gender === avatarGender)));
  $('#avatar-instruction').textContent = avatarGender ? '選擇喜歡的外型；角色更換不影響成長與裝備。' : '先選擇男生或女生，再挑選三種外型中的一款。';
  $('#avatar-choices').replaceChildren(...AVATARS.filter(avatar => avatar.gender === avatarGender).map(avatar => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-pressed', String(avatar.id === avatarChoice));
    button.innerHTML = `${avatarSprite(avatar.id)}<strong>${avatar.name}</strong><span aria-hidden="true">${icon('check')}</span>`;
    button.onclick = () => { avatarChoice = avatar.id; renderAvatarChoices(); $('#avatar-choices').children[AVATARS.filter(a => a.gender === avatarGender).findIndex(a => a.id === avatar.id)]?.focus({ preventScroll: true }); sound('pick'); };
    return button;
  }));
  $('#avatar-confirm').disabled = !avatarChoice;
}
function openAvatar() {
  avatarChoice = state.avatarId; avatarGender = AVATARS.find(avatar => avatar.id === avatarChoice)?.gender || null;
  $('#avatar-dialog [data-close]').hidden = !state.avatarId;
  $('#avatar-dialog [data-close]').setAttribute('aria-label', '關閉角色選擇');
  $('#avatar-status').textContent = state.avatarId ? '可以更換角色，讀經與成長紀錄會保留。' : '第一次來，選一位陪你讀經成長的角色。';
  $('#avatar-audio-label').hidden = !!state.avatarId; renderAvatarChoices(); openDialog('avatar-dialog');
}
function renderDecorations(){
 const groups=new Map();state.placed.forEach((item,index)=>{const old=groups.get(item.id);groups.set(item.id,{...item,index,count:(old?.count||0)+1});});
 $('#garden-decoration').innerHTML=[...groups.values()].map(item=>`<span class="placed-decoration placed-${item.id}" style="left:${item.x}%;top:${item.y}%">${decorationArt(item.id)}${item.count>1?`<small>×${item.count}</small>`:''}</span>`).join('');
}
function renderInventory() {
  const items = category === 'armor' ? equipment : decorations.filter(item=>state.inventory[item.id]?.count);
  $('#armor-tab').setAttribute('aria-pressed', String(category === 'armor')); $('#garden-tab').setAttribute('aria-pressed', String(category === 'garden'));
  if (!items.length){$('#inventory').innerHTML='<p class="muted">完成今天讀經，隨機獲得一件恩典小物。已放入花園的小物會留在收藏冊，不退回背包。</p>';$('#detail-art').innerHTML='';$('#item-type').textContent='從一點一滴開始';$('#item-name').textContent='下一份恩典，正在路上';$('#item-copy').textContent='每天完成當天讀經就有一份驚喜，明天再回來收集。';$('#item-reference').textContent='';$('#item-unlock').textContent='';$('#item-actions').replaceChildren();return;}
  if (!items.some(item => item.id === selected)) selected = items[0].id;
  $('#inventory').replaceChildren(...items.map(item => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.item = item.id;
    button.setAttribute('aria-pressed', String(selected === item.id)); button.classList.toggle('is-equipped', state.equipped.includes(item.id));
    button.innerHTML = `<span class="item-sprite">${itemArt(item)}</span><strong>${item.name}</strong><small>${category==='garden'?`背包 ${state.inventory[item.id]?.count||0} 份`:state.equipped.includes(item.id)?'已穿戴':progress().days>=item.days?'已收藏':'訓練借用'}</small>`;
    button.onclick = () => { selected = item.id; renderInventory(); $('#inventory').querySelector(`[data-item="${item.id}"]`)?.focus({ preventScroll: true }); sound('pick'); };
    return button;
  }));
  const item = items.find(item => item.id === selected), p = progress();
  $('#detail-art').innerHTML = itemArt(item); $('#detail-art').classList.remove('is-taking'); requestAnimationFrame(() => $('#detail-art').classList.add('is-taking'));
  $('#item-type').textContent = category === 'armor' ? '全副軍裝 · 隨時練習使用' : '恩典小物 · 使用一份，收藏一份';
  $('#item-name').textContent = item.name; $('#item-copy').textContent = item.copy;
  $('#item-reference').textContent = category === 'armor' ? '以弗所書 6:10–18' : '讓每一份陪伴，都留在花園裡。';
  const effects=graceEffects;
  $('#item-unlock').textContent=category==='armor'?`累積 ${item.days} 個讀經日期可正式收藏；收藏前可借用訓練，六件軍裝都能實際操作。`:effects[item.id]||'節期讀經收藏的紀念；放進花園，盼望 MP +10。';
  $('#item-actions').replaceChildren();
  if (category === 'armor') {
    const equip = document.createElement('button'); equip.type = 'button'; equip.className = 'secondary';
    equip.textContent = state.equipped.includes(item.id) ? '收回這件軍裝' : '穿戴到守護者';
    equip.onclick=()=>void attempt(async()=>{equip.disabled=true;try{await change('equip',{item:item.id});renderInventory();saveMessage('軍裝穿戴已保存。');}finally{if(equip.isConnected)equip.disabled=false;}});
    const use = document.createElement('button'); use.type = 'button'; use.className = 'primary';
    use.textContent = '練習這件裝備的對應事件';
    use.onclick = () => openEvent({ id: GARDEN_EVENTS.find(event => event.gear === item.id).id, index: 0, practice: true, boss: false });
    $('#item-actions').append(equip, use);
  } else {
    const place=document.createElement('button');place.type='button';place.className='primary';place.textContent='放進花園，領受祝福';
    place.onclick=()=>void attempt(async()=>{place.disabled=true;try{await change('place',{item:item.id});renderInventory();closeDialog('bag-dialog');$('#garden').focus({preventScroll:true});$('#garden').scrollIntoView({behavior:motion.matches?'auto':'smooth',block:'center'});const decoration=$(`.placed-${item.id}`);decoration?.classList.add('just-placed');setTimeout(()=>decoration?.classList.remove('just-placed'),1600);sound(item.id==='bird'?'bird':'pick');saveMessage(`${item.name}已留在花園。新的收集旅程開始了。`);}finally{if(place.isConnected)place.disabled=false;}});
    $('#item-actions').append(place);
  }
}
function openBag(item = selected) {
  category = equipment.some(gear => gear.id === item) ? 'armor' : 'garden'; selected = item;
  $('#bag-opening').innerHTML = sprite('bag'); $('#bag-opening').classList.remove('is-opening');
  renderInventory(); openDialog('bag-dialog'); sound('bag');
  requestAnimationFrame(() => { $('#bag-opening').classList.add('is-opening'); });
  setTimeout(() => { if ($('#bag-dialog').open) $('#bag-opening').innerHTML = sprite('openBag'); }, motion.matches ? 0 : 220);
}
function openQuest(item, context) {
  // Event selection is required for both daily challenges and practice.
  if (!context || eventById(context.id)?.gear !== item.id) return;
  const encounter = !context.practice;
  quest = { item, event: { ...context }, encounter, boss: context.boss, hits: encounter ? state.encounters[today].stageHits : 0,
    total: item.id === 'belt' ? 1 : 3, selected: false, busy: false, complete: false, epoch: ++questEpoch };
  $('#quest-title').textContent = item.title; $('#quest-scenario').textContent = item.scenario;
  $('#quest-verse').textContent = item.id === 'sword' ? '聖靈的寶劍，就是神的道。——以弗所書 6:17' : item.reminder;
  $('#quest-gear').innerHTML = sprite(item.id); $('#quest-stage').dataset.item = item.id; $('#quest-stage').dataset.phase = 'entering';
  $('#quest-special').innerHTML = item.id === 'breastplate' ? '<div class="armor-mist"></div>' : item.id === 'shield' ? '<div class="quest-arrow"></div>' : item.id === 'helmet' ? '<div class="puzzle-glow"></div>' : item.id === 'boots' ? [0, 1, 2].map(i => `<span class="trail-flower" style="left:${20 + i * 23}%;top:${76 - i * 20}%">${icon('flower')}</span>`).join('') : '';
  $('#quest-boss-presence').innerHTML = quest.boss && item.id !== 'sword' ? eventArt(eventById(context.id), true) : '';
  $('#quest-options').replaceChildren();
  item.options.forEach((label, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    const completed = item.id === 'helmet' && index < quest.hits;
    button.setAttribute('aria-pressed', String(completed)); button.disabled = completed;
    button.onclick = () => {
      if (!quest || quest.item.id !== item.id || quest.busy || quest.complete) return;
      if (item.id === 'helmet') {
        if (index !== quest.hits) { $('#quest-hint').textContent = '✕ 從左邊第一片開始，依序點亮三份盼望。'; sound('wrong'); return; }
        void actQuest(); return;
      }
      if (index !== item.correct) { $('#quest-hint').textContent = '✕ 再想一想：什麼行動能幫助我們誠實面對？'; sound('wrong'); return; }
      quest.selected = true; button.setAttribute('aria-pressed', 'true'); $('#quest-hint').textContent = '願意誠實面對，現在把真理繫在心上。'; $('#quest-action').disabled = false;
    };
    $('#quest-options').append(button);
  });
  if (item.id === 'breastplate') $('#quest-special .armor-mist').style.opacity = String(1 - quest.hits / quest.total);
  if (item.id === 'boots') [...$('#quest-special').children].slice(0, quest.hits).forEach(node => node.classList.add('visible'));
  $('#quest-action').textContent = item.action;
  $('#quest-return').disabled = false; $('#quest-gear').style.filter = '';
  $('#quest-action').disabled = item.id === 'belt'; $('#quest-action').hidden = item.id === 'helmet';
  $('#quest-return').hidden = document.body.dataset.octoberTest!=='true'; $('#quest-return').textContent = document.body.dataset.octoberTest==='true'?'先回花園讀經 · 保留進度':'收回裝備，回到花園 →';
  $('#quest-counter').textContent = quest.boss ? `Boss 挑戰 ${context.index - (context.practice ? 0 : 3) + 1}／3 · 操作 ${quest.hits}／${quest.total}` : `裝備使用 · ${quest.hits}／${quest.total}`;
  $('#quest-hint').textContent = context.practice ? '事件練習不加分；選對裝備後，用行動完成挑戰。' : `今天六種事件全部完成，即可獲得 ${battleReward()} XP；中途離開會保留進度。`;
  if (item.id === 'belt') $('#quest-hint').textContent += ' 先選擇一個願意實踐的行動。';
  if (item.id === 'helmet') $('#quest-hint').textContent += ' 依序點亮三片盼望。';
  $('#quest-stage').classList.toggle('boss-quest', !!quest.boss);
  if (item.id === 'sword') renderQuestEnemies();
  openDialog('quest-dialog'); syncAudioScene(); sound('enter'); sound('draw');
  void octoberCombat.start();
  const epoch = quest.epoch; setTimeout(() => { if (quest?.epoch === epoch && !quest.busy && !quest.complete) $('#quest-stage').dataset.phase = 'ready'; }, motion.matches ? 0 : 750);
}
function renderQuestEnemies() {
  if (!quest || quest.item.id !== 'sword') return;
  const left = quest.total - quest.hits;
  $('#quest-special').innerHTML = left ? `<div class="quest-enemy${quest.boss ? ' quest-boss' : ''}"><span class="shadow-art" style="--shadow-index:${quest.boss ? 1 : quest.hits % 3}"></span>${quest.boss ? '<strong>稀有黑影 Boss</strong>' : ''}</div>` : '';
}
const pause = ms => new Promise(resolve => setTimeout(resolve, motion.matches ? Math.min(120, ms) : ms));
async function actQuest() {
  const current = quest;
  if (!current || current.busy || current.complete || (current.item.id === 'belt' && !current.selected)) return;
  if(current.attackPreparing||octoberCombat.busy){$('#quest-hint').textContent='正在確認這一回合，稍候就能使用軍裝。';return;}
  if (current.encounter && (current.event.date !== today || current.event.index !== state.encounters[today].stage)) return;
  current.busy = true; $('#quest-hint').textContent='正在使用軍裝，迎接這一回合…'; $('#quest-action').disabled = true; $('#quest-stage').dataset.phase = 'acting'; sound(current.item.id);
  await pause(current.item.id === 'sword' ? 950 : 650);
  if (quest?.epoch !== current.epoch) return;
  if(current.encounter){try{await change('hit',{day:current.event.date,stage:current.event.index,hits:current.hits,gear:current.item.id,choice:current.selected?0:null});}catch(e){current.busy=false;if(quest?.epoch===current.epoch){$('#quest-action').disabled=false;$('#quest-stage').dataset.phase='ready';$('#quest-hint').textContent=e.message;}return;}if(quest?.epoch!==current.epoch)return;}
  current.hits++;if(current.encounter&&document.body.dataset.octoberTest!=='true'){$('#quest-stage').classList.remove('counter-attack');requestAnimationFrame(()=>$('#quest-stage').classList.add('counter-attack'));}
  if (current.item.id === 'sword') renderQuestEnemies();
  if (current.item.id === 'breastplate') $('#quest-special .armor-mist').style.opacity = String(1 - current.hits / current.total);
  if (current.item.id === 'boots') $('#quest-special').children[current.hits - 1]?.classList.add('visible');
  if (current.item.id === 'helmet') {
    const piece = $('#quest-options').children[current.hits - 1]; piece?.setAttribute('aria-pressed', 'true'); if (piece) piece.disabled = true;
    $('#quest-gear').style.filter = `drop-shadow(0 0 ${current.hits * 10}px #fff1a8)`;
    $('#quest-options').children[current.hits]?.focus({ preventScroll: true });
  }
  $('#quest-counter').textContent = `${current.boss ? `Boss 挑戰 ${current.event.index - (current.event.practice ? 0 : 3) + 1}／3 · ` : ''}已完成操作 ${current.hits}／${current.total}`;
  if (current.hits >= current.total) {
    current.complete = true; $('#quest-stage').dataset.phase = 'complete'; $('#quest-action').hidden = true; $('#quest-return').hidden = false;
    octoberCombat.finish();
    const event = eventById(current.event.id);
    if (current.encounter) {
      // The server has advanced this stage atomically with damage and resource cost.
      if (state.encounters[today].stage >= 6) {
        updateProgress();
        $('#quest-hint').textContent = `${event.result} 今日守護完成！+${battleReward()} XP 已加入小樹經驗。接著讀經，再回來澆水。`;
        saveMessage(`六種事件完成！每日守護 +${battleReward()} XP`);
      } else {
        persist(); renderEncounter();
        $('#quest-hint').textContent = `${event.result} 已完成 ${state.encounters[today].stage}／6 個事件，收回裝備再迎接下一個挑戰。`;
        $('#quest-return').textContent = '收回裝備，查看下一個事件 →';
      }
    } else {
      const next = current.event.sequence && current.event.index + 1 < current.event.sequence.length;
      $('#quest-hint').textContent = `${event.result} ${next ? 'Boss 還有下一個挑戰，需要重新選擇裝備。' : '事件體驗完成，不發放 XP。'}`;
      if (next) $('#quest-return').textContent = '收回裝備，迎接 Boss 下一階段 →';
    }
    $('#quest-return').focus({ preventScroll: true }); celebrateAudio(); sound('xp');
  } else {
    $('#quest-stage').dataset.phase = 'ready'; $('#quest-action').disabled = false;
    $('#quest-hint').textContent = `完成 ${current.hits} 次，再 ${current.total - current.hits} 次就完成這個事件。`;
  }
  if(current.encounter&&(state.life.hp<=0||state.life.mp<(current.boss?5:2))&&!current.complete){$('#quest-action').disabled=true;$('#quest-return').hidden=false;$('#quest-return').textContent='先回花園補充力量';$('#quest-hint').textContent=document.body.dataset.octoberTest==='true'?'進度已保存。讀經補充 HP、MP；澆水與手札補充 MP，小花與小燈也能幫助你。':'這一段進度已保存。讀經、澆水、寫手札或收到關懷後，就能繼續。';}
  current.busy = false;
}
async function returnEquipment() {
  const current = quest;
  if (!current || current.busy) return;
  current.busy = true; $('#quest-return').disabled = true; $('#quest-stage').dataset.phase = 'returning'; sound('bag');
  await pause(550);
  if (quest?.epoch !== current.epoch) return;
  closeDialog('quest-dialog');
  ['event-dialog', 'bag-dialog', 'event-library-dialog'].forEach(id => { if (document.getElementById(id).open) closeDialog(id); });
  $('#quest-return').disabled = false;
  if (current.complete && current.encounter && dailyEvent()) { openEvent(dailyEvent()); return; }
  if (current.complete && current.event.sequence && current.event.index + 1 < current.event.sequence.length) {
    const index = current.event.index + 1;
    openEvent({ ...current.event, index, id: current.event.sequence[index] }); return;
  }
  $('#garden').scrollIntoView({ behavior: motion.matches ? 'auto' : 'smooth', block: 'center' });
  $(current.encounter ? '#read-open' : '#scene-bag').focus({ preventScroll: true });
}
async function markRead(){
 if($('#read-complete').disabled)return;
 const alreadyRead=state.records.some(r=>r.reading_date===readingDay);$('#read-complete').disabled=true;
 try{await change('read',{day:readingDay});closeDialog('reading-dialog');saveMessage(alreadyRead?'這一天的讀經已保存；重讀不重複加分或補充。':'讀經已保存，信心 HP +40、盼望 MP +20。');sound('pick');if(readingDay!==today){openDialog('makeup-dialog');$('#makeup-status').textContent='補讀已保存，可以為這一天補澆水。';}else if(!alreadyRead&&state.dailyGrace?.[today]){const item=state.dailyGrace[today];$('#daily-grace-art').innerHTML=decorationArt(item);$('#daily-grace-name').textContent=itemName(item);$('#daily-grace-count').textContent=`${graceEffects[item]}。已收進裝備包，目前有 ${state.inventory[item]?.count||0} 份；使用後扣除一份。明天讀經完成，再收集一件。`;openDialog('daily-grace-dialog');sound('xp');}else $('#water').focus({preventScroll:true});}
 catch(e){$('#reading-load-status').textContent=e.message;$('#read-complete').disabled=false;}
}
async function water(day=today){
 const record=state.records.find(r=>r.reading_date===day);if(!record||record.watered_at||remoteBusy)return;
 const waterBoost=document.body.dataset.octoberTest==='true'&&state.buffs.care>0;
 busy=true;try{await change('water',{day});sound('water');$('#garden').dataset.phase='watering';saveMessage(waterBoost?'活水送達 · +5 XP，MP +10；噴泉祝福額外補充 HP、MP 各 10。':'活水送達 · +5 XP，盼望 MP +10');setTimeout(()=>{$('#garden').dataset.phase='idle';},motion.matches?200:2300);}catch{}finally{busy=false;updateProgress();}
}
async function saveJournal(event){
 event.preventDefault();if(!progress().todayRecord)return;const note=$('#journal-note').value.trim();if(!note){$('#journal-status').textContent='寫下一句想收藏的亮光，再按下珍藏。';return;}
 const button=$('#journal-form button[type="submit"]');button.disabled=true;
 try{await change('journal',{day:today,note});closeDialog('journal-dialog');saveMessage('拾光已保存，今天的陪伴不會重複加分。');sound('pick');}catch(e){$('#journal-status').textContent=e.message;}finally{button.disabled=false;}
}
function openReading(day=today){readingDay=day;openDialog('reading-dialog');void prepareReading(day,()=>{});}
async function loadAssets() {
  const assets = ['assets/garden-dawn.png', ATLAS, AVATAR_ATLAS, 'assets/garden-shadows.png', 'assets/garden-bird.svg'];
  const results = await Promise.allSettled(assets.map(src => new Promise((resolve, reject) => {
    const image = new Image(), timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error(src)); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(src); }; image.onerror = () => { clearTimeout(timer); reject(new Error(src)); }; image.src = src;
  })));
  $('#asset-error').hidden = results.every(result => result.status === 'fulfilled');
}
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
$('#bag-object').innerHTML = sprite('bag'); $('#teaser-sword').innerHTML = sprite('sword');
$('#scene-day').textContent = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric' }).format(new Date());
for (let i = 0; i < 16; i++) { const dot = document.createElement('i'); dot.style.cssText = `left:${12 + Math.random() * 75}%;top:${25 + Math.random() * 55}%;animation-delay:${-Math.random() * 7}s`; $('#fireflies').append(dot); }
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeDialog(button.dataset.close));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog.id); });
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog.id); });
});
['scene-bag', 'equipment-open', 'nav-bag'].forEach(id => { document.getElementById(id).onclick = () => openBag('sword'); });
$('#defend-garden').onclick = () => openEvent();
$('#quick-sword').onclick = () => openDialog('event-library-dialog');
$('#event-use').onclick = beginEventQuest;
$('#boss-preview').onclick = () => { const sequence = shuffled(['faith', 'hope', 'word']); openEvent({ id: sequence[0], index: 0, practice: true, boss: true, sequence }); };
$('#armor-tab').onclick = () => { category = 'armor'; selected = 'sword'; renderInventory(); };
$('#garden-tab').onclick = () => { category = 'garden'; selected = 'flower'; renderInventory(); };
$('#quest-action').onclick = () => void actQuest(); $('#quest-return').onclick = () => void returnEquipment();
$('#read-open').onclick=()=>openReading(today);
$('#read-complete').onclick=()=>void markRead();$('#water').onclick=()=>void water();
$('#makeup-read').onclick=()=>{const day=$('#makeup-date').value;if(day<$('#makeup-date').min||day>today){$('#makeup-status').textContent='請選擇可補讀的日期。';return;}closeDialog('makeup-dialog');openReading(day);};
$('#makeup-water').onclick=()=>void water($('#makeup-date').value);
$('#journal-open').onclick = () => { $('#journal-note').value = state.notes.find(note => note.reading_date === today)?.note || ''; $('#journal-status').textContent = ''; openDialog('journal-dialog'); $('#journal-note').focus(); };
$('#journal-form').onsubmit = saveJournal; $('#journey-open').onclick = () => openDialog('journey-dialog'); $('#gift-open').onclick = () => openDialog('gift-dialog');
$('#daily-grace-garden').onclick=()=>{closeDialog('daily-grace-dialog');$('#garden').scrollIntoView({behavior:motion.matches?'auto':'smooth',block:'center'});$('#water').focus({preventScroll:true});};
$('#daily-grace-bag').onclick=()=>{selected=state.dailyGrace?.[today]||'flower';category='garden';closeDialog('daily-grace-dialog');openBag();};
$('#read-aloud').onclick = () => {
  if (!window.speechSynthesis) { announce('這個瀏覽器目前無法朗讀，仍可以閱讀經文。'); return; }
  speechSynthesis.cancel(); audio.duck(true);duckTheme(true); const text = new SpeechSynthesisUtterance($('.scripture').textContent); text.lang = 'zh-TW'; text.rate = .85;
  text.onend = () => {audio.duck(false);duckTheme(false);}; text.onerror = () => { audio.duck(false);duckTheme(false); announce('朗讀暫時無法播放，可以稍後再試。'); }; speechSynthesis.speak(text);
};
function renderSound() {
  $('#sound').innerHTML = icon(state.music || state.sound ? 'sound' : 'mute');
  $('#sound').setAttribute('aria-label', `音樂與音效設定，音樂${state.music ? '開' : '關'}、音效${state.sound ? '開' : '關'}`);
  $('#music-enabled').checked = state.music; $('#effects-enabled').checked = state.sound;
  $('#music-volume').value = String(Math.round(state.musicVolume * 100)); $('#effects-volume').value = String(Math.round(state.effectsVolume * 100));
  $('#music-output').value = `${Math.round(state.musicVolume * 100)}%`; $('#effects-output').value = `${Math.round(state.effectsVolume * 100)}%`;
  $('#music-volume').disabled = !state.music; $('#effects-volume').disabled = !state.sound; $('#effects-preview').disabled = !state.sound;
  audio.configure({ music: state.music, effects: state.sound, musicVolume: state.musicVolume, effectsVolume: state.effectsVolume });themeAudio(document.body.dataset.audioMode||'garden',state,audio);
}
$('#sound').onclick = () => { renderSound(); openDialog('audio-dialog'); };
for (const id of ['music-enabled', 'effects-enabled', 'music-volume', 'effects-volume']) {
  document.getElementById(id).addEventListener(id.endsWith('volume') ? 'input' : 'change', () => {
    state.music = $('#music-enabled').checked; state.sound = $('#effects-enabled').checked;
    state.musicVolume = Number($('#music-volume').value) / 100; state.effectsVolume = Number($('#effects-volume').value) / 100;
    persist(); renderSound(); void audio.unlock();
  });
}
$('#audio-start').onclick = () => { if (!state.music && !state.sound) { state.music = true; state.sound = true; persist(); renderSound(); } void audio.unlock(); };
$('#effects-preview').onclick = async () => { if (await audio.unlock()) sound('shield'); };
$('#avatar-open').onclick = openAvatar;
document.querySelectorAll('[data-gender]').forEach(button => { button.onclick = () => { avatarGender = button.dataset.gender; avatarChoice = null; renderAvatarChoices(); sound('pick'); }; });
$('#avatar-confirm').onclick=()=>void attempt(async()=>{
 if(!AVATARS.some(avatar=>avatar.id===avatarChoice))return;
 if(!state.avatarId){state.music=$('#avatar-audio').checked;state.sound=$('#avatar-audio').checked;persist();}
 const button=$('#avatar-confirm');button.disabled=true;$('#avatar-status').textContent='正在保存你的角色…';try{await change('avatar',{avatar:avatarChoice});renderSound();void audio.unlock().then(()=>sound('pick'));closeDialog('avatar-dialog');saveMessage('角色已保存，一起照顧這座花園吧。');}catch(e){$('#avatar-status').textContent=e.message;}finally{button.disabled=false;}
});
// A saved preference still requires a gesture on a freshly opened iPhone page.
document.addEventListener('click', event => {
  if (event.isTrusted && (state.music || state.sound) && audio.context?.state !== 'running') void audio.unlock();
}, { capture: true });
$('#retry-assets').onclick = () => { $('#retry-assets').disabled = true; void loadAssets().finally(() => { $('#retry-assets').disabled = false; }); };
let gesture = null;
$('#quest-stage').addEventListener('pointerdown', event => {
  if (!quest || quest.busy || quest.complete) return;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
  if (['breastplate', 'sword'].includes(quest.item.id)) $('#quest-stage').setPointerCapture(event.pointerId);
});
$('#quest-stage').addEventListener('pointermove', event => {
  if (!gesture || gesture.id !== event.pointerId || !quest || quest.busy) return;
  gesture.distance += Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y); gesture.x = event.clientX; gesture.y = event.clientY;
  if (quest.item.id === 'breastplate' && gesture.distance > 70) { gesture.distance = 0; void actQuest(); }
});
$('#quest-stage').addEventListener('pointerup', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const distance = gesture.distance; gesture = null;
  if (quest && (quest.item.id === 'sword' || quest.item.id === 'shield') && distance < 2000) void actQuest();
});
$('#quest-stage').addEventListener('pointercancel', () => { gesture = null; });
function refreshDay() {
  const nextDay = taipeiDay();
  if (nextDay === today || document.querySelector('dialog[open]') || busy) return;
  void refreshMember();return;
  $('#scene-day').textContent = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric' }).format(new Date());
  announce('新的一天開始了，一起照顧小樹吧。');
}
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('game-paused', document.hidden); audio.setHidden(document.hidden);
  if (document.hidden) { window.speechSynthesis?.cancel(); audio.duck(false); } else refreshDay();
});
setInterval(refreshDay, 60000);
ensureEncounter(); persist(); renderGuardian(); renderDecorations(); renderEncounter(); renderEventLibrary(); renderSound(); updateProgress(); void loadAssets();
setAudioMode('garden');
setupMemberControls({send:change,getState:()=>state,openDialog,announce,refresh:refreshMember});
if (!state.avatarId) openAvatar();

$('#garden-arrange').onclick=()=>{
 const select=$('#arrange-item');select.replaceChildren();const latest=new Map();state.placed.forEach((item,index)=>latest.set(item.id,index));
 for(const [id,index] of latest){const option=document.createElement('option');option.value=String(index);option.textContent=itemName(id);select.append(option);}
 const choose=()=>{const item=state.placed[Number(select.value)];if(item){$('#arrange-x').value=item.x;$('#arrange-y').value=item.y;}$('#arrange-save').disabled=!item;};select.onchange=choose;choose();renderMember(state);openDialog('arrange-dialog');
};
$('#arrange-save').onclick=()=>void attempt(async()=>{const button=$('#arrange-save');button.disabled=true;try{await change('move',{index:Number($('#arrange-item').value),x:Number($('#arrange-x').value),y:Number($('#arrange-y').value)});closeDialog('arrange-dialog');saveMessage('花園位置已保存。');}finally{button.disabled=false;}});

let polling=false;
async function refreshQuietly(){
 if(polling||document.hidden||remoteBusy||document.querySelector('dialog[open]')||taipeiDay()!==today)return;
 polling=true;try{await memberAPI('me');if(!remoteBusy&&!document.querySelector('dialog[open]')){state={...memberData.state,...preferences()};today=memberData.today;updateProgress();renderGuardian();renderDecorations();}}catch{/* Keep the last confirmed view; the refresh button remains available. */}finally{polling=false;}
}
setInterval(()=>void refreshQuietly(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshQuietly();});
window.addEventListener('beforeunload',event=>{const note=$('#journal-note').value.trim(),saved=state.notes.find(n=>n.reading_date===today)?.note||'';if(note&&note!==saved){event.preventDefault();event.returnValue='';}});
