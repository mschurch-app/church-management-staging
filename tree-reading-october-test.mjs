import { loadScheduledChapters } from './bible-scripture-loader.mjs';
import { OCTOBER_TEST_API, OCTOBER_TEST_LIFF_ID, OCTOBER_TEST_WINDOW } from './tree-reading-october-test-config.mjs?v=20260929-2';

const $ = (selector) => document.querySelector(selector);
const state = { idToken: '', participant: null, records: [], challenges: [], activeDate: null, admin: false };
const dayNumber = (date) => Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse('2026-10-01T12:00:00Z')) / 86400000) + 1;
const dayAt = (number) => new Date(Date.parse('2026-10-01T12:00:00Z') + (number - 1) * 86400000).toISOString().slice(0, 10);
const taipeiDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
const inTestMonth = (date) => date >= OCTOBER_TEST_WINDOW.start && date <= OCTOBER_TEST_WINDOW.end;
const formatDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const chapterPassage = (day) => `🌳 根｜箴言 ${day}　🌿 枝｜—　🍎 果｜—`;

function showSetup(message) {
  $('#setup-message').textContent = message;
  $('#setup-notice').hidden = false;
  $('#login-panel').hidden = true;
  $('#progress-panel').hidden = true;
  $('#month-panel').hidden = true;
}

async function loadLiffSdk() {
  if (window.liff) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('LINE 登入元件載入失敗，請稍後重試。'));
    document.head.append(script);
  });
}

async function request(action, body = {}) {
  const response = await fetch(OCTOBER_TEST_API, {
    method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.idToken}` },
    body: JSON.stringify({ action, ...body }), signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = { invite_invalid: '邀請碼不正確，請回同工群組確認。', not_authorized: '目前這個 LINE 帳號沒有測試權限，請聯絡教會管理同工。', test_closed: '十月測試目前未開放。', staff_required: '只有授權管理同工可以查看整體進度。', join_required: '還沒加入十月同工測試，輸入邀請碼即可開始。', read_first: '請先讀完今天的箴言，再回來澆水。', challenge_not_found: '這個挑戰已經處理完成，請更新畫面。', resolution_invalid: '請使用這個挑戰提供的處理方式。' };
    const error = new Error(messages[data.error] || '暫時無法連線，請稍後再試。'); error.code = data.error; throw error;
  }
  return data;
}

function getRecord(date) { return state.records.find((item) => item.reading_date === date); }

function missedStreak() {
  const today = taipeiDate();
  if (today < OCTOBER_TEST_WINDOW.start) return 0;
  let day = Math.min(31, dayNumber(today) - 1), count = 0;
  while (day >= dayNumber(state.participant.reading_start_date)) {
    if (getRecord(dayAt(day))) break;
    count++; day--;
  }
  return count;
}

function renderTree() {
  const streak = missedStreak();
  const dataHealth = streak === 0 ? 'healthy' : streak === 1 ? 'yellow' : 'wilted';
  const stage = Math.max(0, state.records.length - Math.floor(streak / 3));
  const activeChallenge = state.challenges.find((item) => item.status === 'active' && item.challenge_date <= taipeiDate());
  $('#tree-scene').dataset.health = dataHealth;
  $('#tree-scene').dataset.challenge = activeChallenge?.challenge_type || 'none';
  $('#tree-age').textContent = `🌱 第 ${stage} 天`;
  $('#tree-health').textContent = activeChallenge ? `${challengeDetails[activeChallenge.challenge_type]?.title || '生命中的挑戰'} · 按下方按鈕幫助小樹` : streak === 0 ? (state.records.length ? '葉片翠綠，正在成長' : '小樹正在等候第一道活水') : streak === 1 ? '葉片開始泛黃，回來讀經就能恢復' : streak === 2 ? '枝葉有些低垂，補讀經文來守護它' : `連續漏讀 ${streak} 天，成長退後 ${Math.floor(streak / 3)} 天；補讀就能恢復`;
  const todayRecord = getRecord(taipeiDate());
  const water = $('#water-tree');
  water.hidden = !todayRecord || Boolean(todayRecord.watered_at);
  water.disabled = !todayRecord || Boolean(todayRecord.watered_at);
}

const challengeDetails = {
  worm: {icon:'🪲',title:'樹蟲來了',text:'小小害蟲正在啃咬嫩葉。及時除蟲，保護新芽。',label:'🪲 立即除蟲',action:'pest'},
  wind: {icon:'🌬️',title:'一陣強風吹來',text:'枝條被風吹歪了，扶正枝幹、陪它站穩。',label:'🌿 扶起枝條',action:'support'},
  typhoon: {icon:'🌧️',title:'風雨考驗',text:'風雨搖晃著樹根。先安穩根部，樹會重新站起來。',label:'🛡️ 守護樹根',action:'guard'},
  trouble: {icon:'🪵',title:'樹枝需要整理',text:'掉落的枝條需要清理，整理後就能再次生長。',label:'🌱 照顧樹苗',action:'repair'}
};

function renderChallenges() {
  const box = $('#challenge-box'), list = $('#challenge-list'); list.replaceChildren();
  const visible = state.challenges.filter((item) => item.challenge_date <= taipeiDate());
  box.hidden = visible.length === 0;
  for (const challenge of visible.slice(-5).reverse()) {
    const details = challengeDetails[challenge.challenge_type]; if (!details) continue;
    const item = document.createElement('article'); item.className = `challenge-item${challenge.status === 'resolved' ? ' resolved' : ''}`;
    const title = document.createElement('strong'); title.textContent = `${details.icon} ${details.title} · ${formatDate(challenge.challenge_date)}`;
    const description = document.createElement('p'); description.textContent = challenge.status === 'resolved' ? `已處理：${details.label.replace(/^\S+\s/u,'')}` : details.text;
    item.append(title, description);
    if (challenge.status !== 'resolved') {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = details.label;
      button.addEventListener('click', () => resolveChallenge(challenge.id, details.action, button)); item.append(button);
    } else {
      const resolved = document.createElement('small'); resolved.textContent = '✓ 樹木正在恢復'; item.append(resolved);
    }
    list.append(item);
  }
}

function renderMonth() {
  const today = taipeiDate();
  const joinDate = state.participant.reading_start_date;
  const lastAvailable = inTestMonth(today) ? today : today < OCTOBER_TEST_WINDOW.start ? '' : OCTOBER_TEST_WINDOW.end;
  const endDate = lastAvailable || OCTOBER_TEST_WINDOW.start;
  const readCount = state.records.length;
  const totalCount = lastAvailable && endDate >= joinDate ? Math.max(0, dayNumber(endDate) - dayNumber(joinDate) + 1) : 0;
  const passedCount = Math.max(0, Math.min(31, dayNumber(joinDate) - 1));
  $('#member-name').textContent = state.participant.display_name || '同工';
  $('#read-count').textContent = String(readCount);
  $('#total-count').textContent = String(totalCount);
  $('#join-date').textContent = formatDate(joinDate);
  $('#progress-bar').style.width = `${totalCount ? Math.min(100, Math.round(readCount / totalCount * 100)) : 0}%`;
  $('#pass-message').textContent = passedCount ? `加入前的 ${passedCount} 天已全部保送，這些日期不列入漏讀或補讀。從 ${formatDate(joinDate)} 起開始計算。` : `你從 ${formatDate(joinDate)} 開始同行，每天一章，慢慢讀完箴言。`;
  $('#month-completion').textContent = `${readCount} / ${totalCount}`;
  renderTree(); renderChallenges();
  const list = $('#day-list'); list.replaceChildren();
  for (let day = 1; day <= 31; day++) {
    const date = dayAt(day), record = getRecord(date), beforeJoin = date < joinDate;
    const future = today < date;
    const status = beforeJoin ? '已保送' : record?.completion_type === 'on_time' ? '已讀' : record?.completion_type === 'makeup' ? '補讀' : future ? '未開始' : '待讀';
    const card = document.createElement('button'); card.type = 'button';
    card.className = `day-card${beforeJoin ? ' pass' : record?.completion_type === 'on_time' ? ' completed' : record?.completion_type === 'makeup' ? ' makeup' : ''}${date === today ? ' today' : ''}`;
    card.disabled = beforeJoin || future || Boolean(record) || !inTestMonth(today);
    card.setAttribute('aria-label', `${formatDate(date)}，箴言第 ${day} 章，${status}`);
    const dateText = document.createElement('strong'); dateText.textContent = formatDate(date);
    const detail = document.createElement('small'); detail.textContent = `箴言 ${day} · ${status}`;
    card.append(dateText, detail);
    if (!card.disabled) card.addEventListener('click', () => openReading(date));
    list.append(card);
  }
  const todayIndex = inTestMonth(today) ? dayNumber(today) : today < OCTOBER_TEST_WINDOW.start ? 1 : 31;
  $('#today-label').textContent = inTestMonth(today) ? `TODAY · ${formatDate(today)}` : today < OCTOBER_TEST_WINDOW.start ? 'COMING SOON · OCT 01' : 'OCTOBER JOURNEY COMPLETE';
  $('#today-title').textContent = `箴言 ${todayIndex} 章`;
  $('#today-detail').textContent = today < OCTOBER_TEST_WINDOW.start ? '10 月 1 日開始；加入前日期已保送。' : today > OCTOBER_TEST_WINDOW.end ? '十月測試旅程已結束。' : '讀完完整章節後，回來記錄今天的進度。';
  $('#open-scripture').hidden = !inTestMonth(today) || Boolean(getRecord(today)) || today < joinDate;
  $('#complete-today').hidden = true;
}

async function openReading(date) {
  state.activeDate = date;
  const chapter = dayNumber(date);
  const box = $('#scripture');
  box.hidden = false; box.replaceChildren();
  const loading = document.createElement('p'); loading.textContent = `正在載入箴言第 ${chapter} 章…`; box.append(loading);
  $('#progress-message').textContent = '';
  $('#open-scripture').disabled = true;
  try {
    const [loaded] = await loadScheduledChapters(chapterPassage(chapter));
    const title = document.createElement('h3'); title.textContent = loaded.title; box.replaceChildren(title);
    loaded.verses.forEach((verse) => { const paragraph = document.createElement('p'); paragraph.textContent = verse; box.append(paragraph); });
    $('#complete-today').hidden = false;
    $('#complete-today').textContent = date === taipeiDate() ? '讀完了，記錄今天' : `補讀完成，記錄 ${formatDate(date)}`;
  } catch (error) { box.replaceChildren(); const message = document.createElement('p'); message.textContent = `${error.message} 請確認網路後再試。`; box.append(message); }
  finally { $('#open-scripture').disabled = false; }
}

async function markRead() {
  const button = $('#complete-today'); button.disabled = true;
  try {
    const result = await request('mark_read', { readingDate: state.activeDate });
    state.records = result.records || state.records;
    $('#scripture').hidden = true;
    renderMonth();
    $('#progress-message').textContent = result.completion_type === 'on_time' ? '✓ 今天已記錄，願神的話陪伴你。' : '✓ 補讀已記錄，謝謝你回到經文裡。';
  } catch (error) { $('#progress-message').textContent = error.message; }
  finally { button.disabled = false; }
}

async function resolveChallenge(challengeId, resolutionAction, button) {
  button.disabled = true;
  try {
    const result = await request('resolve_challenge', { challengeId, resolutionAction });
    state.challenges = result.challenges || state.challenges;
    renderChallenges(); renderTree();
    $('#progress-message').textContent = '🌱 小樹得到照顧了，正在慢慢恢復。';
    $('#tree-scene').classList.add('watered'); setTimeout(() => $('#tree-scene').classList.remove('watered'), 800);
  } catch (error) { $('#progress-message').textContent = error.message; button.disabled = false; }
}

async function waterTree() {
  const button = $('#water-tree'); button.disabled = true;
  try {
    const result = await request('water_tree'); state.records = result.records || state.records;
    renderTree(); $('#tree-scene').classList.add('watered'); setTimeout(() => $('#tree-scene').classList.remove('watered'), 800);
    $('#progress-message').textContent = '💧 澆水完成！小樹喝飽水了，今天的照顧已記錄。';
  } catch (error) { $('#progress-message').textContent = error.message; button.disabled = false; }
}

function renderAdmin(rows) {
  const list = $('#admin-list'); list.replaceChildren();
  if (!rows.length) { $('#admin-message').textContent = '目前還沒有同工加入測試。'; return; }
  for (const member of rows) {
    const row = document.createElement('div'); row.className = 'admin-row';
    const name = document.createElement('strong'); name.textContent = member.display_name || '同工';
    const count = document.createElement('span'); count.textContent = `${member.completed_count} / ${member.expected_count} 章`;
    const start = document.createElement('span'); start.textContent = `加入 ${formatDate(member.reading_start_date)}`;
    row.append(name, count, start); list.append(row);
  }
}

async function showSignedIn() {
  let result;
  try { result = await request('me'); }
  catch (error) { if (error.code === 'join_required') { $('#login-panel').hidden = false; return; } throw error; }
  if (!result.participant) { $('#login-panel').hidden = false; return; }
  state.participant = result.participant;
  state.records = result.records || [];
  state.challenges = result.challenges || [];
  state.admin = Boolean(result.is_admin);
  $('#login-panel').hidden = true; $('#progress-panel').hidden = false; $('#month-panel').hidden = false;
  renderMonth();
  if (state.admin) { $('#admin-panel').hidden = false; await refreshAdmin(); }
}

async function refreshAdmin() {
  try { const result = await request('overview'); renderAdmin(result.members || []); $('#admin-challenges').hidden = false; $('#admin-challenges').textContent = `🌦️ 隨機挑戰 ${result.challenge_count || 0} 次 · 同工已處理 ${result.resolved_challenges || 0} 次`; }
  catch (error) { $('#admin-message').textContent = error.message; }
}

async function start() {
  $('#join-test').addEventListener('click', joinTest);
  $('#open-scripture').addEventListener('click', () => openReading(taipeiDate()));
  $('#complete-today').addEventListener('click', markRead);
  $('#water-tree').addEventListener('click', waterTree);
  $('#refresh-admin').addEventListener('click', refreshAdmin);
  $('#logout').addEventListener('click', () => { window.liff?.logout(); location.reload(); });
  if (!OCTOBER_TEST_LIFF_ID || !OCTOBER_TEST_API) {
    showSetup(!OCTOBER_TEST_LIFF_ID ? '隔離測試資料庫已準備完成，還差專用 LINE LIFF App ID。接上後同工即可用 LINE 登入；此頁不會連到正式會員資料。' : '測試服務尚未設定完成，請稍後重試。');
    return;
  }
  try {
    await loadLiffSdk();
    await window.liff.init({ liffId: OCTOBER_TEST_LIFF_ID });
    if (!window.liff.isLoggedIn()) { window.liff.login({ redirectUri: location.href }); return; }
    state.idToken = window.liff.getIDToken() || '';
    if (!state.idToken) throw new Error('LINE 登入資訊不完整，請重新開啟測試連結。');
    try { await showSignedIn(); }
    catch (error) { showSetup(error.message); }
  } catch (error) { showSetup(error.message || 'LINE 登入暫時無法使用，請稍後重試。'); }
}

async function joinTest() {
  const button = $('#join-test'); button.disabled = true;
  try {
    const inviteCode = $('#invite-code').value.trim();
    if (!inviteCode) { $('#login-message').textContent = '請輸入同工群組公告的邀請碼。'; return; }
    const result = await request('join', { inviteCode });
    state.participant = result.participant; state.records = result.records || []; state.challenges = result.challenges || []; state.admin = Boolean(result.is_admin);
    $('#login-panel').hidden = true; $('#progress-panel').hidden = false; $('#month-panel').hidden = false;
    renderMonth();
    if (state.admin) { $('#admin-panel').hidden = false; await refreshAdmin(); }
  } catch (error) { $('#login-message').textContent = error.message; }
  finally { button.disabled = false; }
}

start();
