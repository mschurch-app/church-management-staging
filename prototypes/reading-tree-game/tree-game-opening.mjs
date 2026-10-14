// Original dialogue based on Matthew 13:31–32, Psalm 1:2–3 and Ephesians 6:10–17.
// The story is an illustration; game XP is not a measure of spiritual growth.
const STORY = [
  { speaker: '主角', line: '這座花園這麼大，為什麼只有一粒小小的種子？', hero: 'seed', moment: 'seed', sound: 'storySeed' },
  { speaker: '園丁', line: '耶穌曾用一粒芥菜種，講過一個關於天國的比喻。', hero: 'seed', moment: 'seed', reference: '馬太福音 13:31–32' },
  { speaker: '主角', line: '那麼小的種子，真的能長成讓飛鳥停留的樹嗎？', hero: 'seed', moment: 'grow' },
  { speaker: '園丁', line: '故事裡，它長出枝子，成了飛鳥可以停留的地方。小小的開始，也能帶來祝福。', hero: 'normal', moment: 'grow', sound: 'storyGrow' },
  { speaker: '主角', line: '那我是不是要趕快讓它長大？', hero: 'seed', moment: 'seed' },
  { speaker: '園丁', line: '不用趕。詩篇說，喜愛並思想神話語的人，像栽在溪水旁的樹，按時結果子。', hero: 'normal', moment: 'stream', reference: '詩篇 1:2–3' },
  { speaker: '主角', line: '所以，我可以從今天讀一段聖經開始？', hero: 'seed', moment: 'stream' },
  { speaker: '園丁', line: '對。每天靠近神，讓祂的話陪你慢慢扎根。', hero: 'normal', moment: 'stream' },
  { speaker: '主角', line: '好！今天，就從這一粒種子開始。', hero: 'reach', moment: 'sprout', sound: 'storyGrow' },
  { speaker: '園丁', line: '出發前，我想送你一個裝備包。以弗所書提到神所賜的全副軍裝；遇到不同的事，記得取出合適的裝備。', hero: 'reach', gardener: 'gift', moment: 'gift', reference: '以弗所書 6:10–17', sound: 'storyGift' },
  { speaker: '園丁', line: '真理腰帶：聽見謊言，或想隱瞞時，先停下來，選擇說真話。', hero: 'normal', gardener: 'gift', moment: 'gear', gear: 'belt' },
  { speaker: '園丁', line: '公義護心鏡：被傷害又想反擊時，記得以公平和憐憫守護自己的心。', hero: 'normal', gardener: 'gift', moment: 'gear', gear: 'breastplate' },
  { speaker: '園丁', line: '平安福音的鞋：看見孤單的朋友，就穿上它，主動帶著平安走近他。', hero: 'normal', gardener: 'gift', moment: 'gear', gear: 'boots' },
  { speaker: '園丁', line: '信心盾牌：害怕或受試探時，舉起盾牌，提醒自己可以倚靠神，也能向人求助。', hero: 'normal', gardener: 'gift', moment: 'gear', gear: 'shield' },
  { speaker: '園丁', line: '救恩頭盔：覺得沒有盼望時，戴上它，記得神的拯救和慈愛。', hero: 'normal', gardener: 'gift', moment: 'gear', gear: 'helmet' },
  { speaker: '園丁', line: '聖靈寶劍就是神的道。讀完經文，把今天讀到的真理帶進生活；這把劍不是拿來傷害人。', hero: 'reach', gardener: 'gift', moment: 'gear', gear: 'sword' },
];

export function openingVoiceSource(storyIndex, avatarId) {
  const beat = STORY[storyIndex];
  if (!beat) throw new RangeError('Unknown opening-story line');
  const role = beat.speaker === '園丁' ? 'gardener' : avatarId?.startsWith('male-') ? 'hero-male-youth-v2' : 'hero-female-youth-v2';
  return `assets/story-voice/${role}-${String(storyIndex + 1).padStart(2, '0')}.m4a`;
}

export function setupOpeningStory({ getAvatar, avatarSprite, gearSprite, audio, sound, enableStoryAudio, markSeen, openDialog, closeDialog, openReading, openBag, isRequired = () => false }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#opening-dialog');
  let index = 0;
  let saving = false;
  let voiceOn = false;
  let speaking = false;
  let activeClip = null;
  let loadingTimer = null;
  let previewing = false;
  const clips = new Map();
  let closeIntent = false;
  let visibleHero = '';
  let remainingArtRequested = false;

  function clipFor(storyIndex) {
    const source = openingVoiceSource(storyIndex, getAvatar());
    if (!clips.has(source)) {
      const clip = new Audio(source);
      clip.preload = 'auto';
      clips.set(source, clip);
    }
    return clips.get(source);
  }
  function setVoiceStatus(message, loading = false, isPreview = previewing) {
    const button = isPreview ? $('#gardener-voice-preview') : $('#opening-speak');
    button.textContent = message;
    button.classList.toggle('is-loading', loading);
    button.setAttribute('aria-busy', String(loading));
    if (isPreview) $('#gardener-voice-status').textContent = loading ? '園丁配音載入中…' : message;
    else $('#opening-audio-status').textContent = loading ? '故事配音載入中' : message;
  }
  function stopVoice() {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = null;
    if (activeClip) { activeClip.pause(); activeClip.currentTime = 0; }
    activeClip = null;
    speaking = false;
    audio.duck(false);
    $('#opening-speak').textContent = '重聽本句';
    $('#opening-speak').classList.remove('is-loading');
    $('#opening-speak').setAttribute('aria-busy', 'false');
    $('#gardener-voice-preview').textContent = '試聽園丁說話';
    $('#gardener-voice-preview').classList.remove('is-loading');
    $('#gardener-voice-preview').setAttribute('aria-busy', 'false');
    $('#gardener-voice-status').textContent = '可試聽園丁的故事配音。';
    $('#opening-audio-status').textContent = '';
    previewing = false;
  }
  function readAloud(storyIndex, preview = false) {
    stopVoice();
    const clip = clipFor(storyIndex);
    activeClip = clip; speaking = true; previewing = preview;
    audio.duck(true);
    setVoiceStatus('配音載入中…', true);
    let started = false;
    clip.onplaying = () => {
      if (activeClip !== clip) return;
      started = true;
      if (loadingTimer) clearTimeout(loadingTimer);
      loadingTimer = null;
      setVoiceStatus(preview ? '停止試聽' : '停止朗讀');
    };
    clip.onended = () => { if (activeClip === clip) stopVoice(); };
    clip.onerror = () => {
      if (activeClip !== clip) return;
      const wasPreview = previewing;
      stopVoice();
      for (const [source, cached] of clips) if (cached === clip) clips.delete(source);
      setVoiceStatus('配音載入失敗，點此重試', false, wasPreview);
      if (wasPreview) $('#gardener-voice-status').textContent = '配音載入失敗；請重試。';
    };
    loadingTimer = setTimeout(() => {
      if (activeClip !== clip || started) return;
      const wasPreview = previewing;
      clip.pause();
      stopVoice();
      setVoiceStatus('配音載入較久，點此播放', false, wasPreview);
    }, 3500);
    clip.currentTime = 0;
    void clip.play().catch(() => {
      if (activeClip !== clip) return;
      const wasPreview = previewing;
      stopVoice();
      setVoiceStatus('點此播放配音', false, wasPreview);
    });
  }
  function speak() { readAloud(index); }
  function render() {
    const beat = STORY[index];
    $('#opening-counter').textContent = `故事 ${index + 1}／${STORY.length}`;
    $('#opening-speaker').textContent = beat.speaker;
    $('#opening-line').textContent = beat.line;
    $('#opening-reference').textContent = beat.reference || '';
    $('#opening-reference').hidden = !beat.reference;
    $('#opening-stage').dataset.moment = beat.moment;
    $('#opening-stage').dataset.speaker = beat.speaker;
    const heroKey = `${getAvatar()}:${beat.hero}`;
    if (heroKey !== visibleHero) { $('#opening-hero').innerHTML = avatarSprite(getAvatar(), beat.hero); visibleHero = heroKey; }
    const gardenerImage = beat.gear ? 'assets/gardener-teaching.webp' : beat.gardener === 'gift' ? 'assets/gardener-gift.webp' : 'assets/gardener-speaking.webp';
    if ($('#opening-gardener').getAttribute('src') !== gardenerImage) $('#opening-gardener').src = gardenerImage;
    $('#opening-stage-word').textContent = beat.moment === 'grow' ? '一粒種子，長成可以停留的枝子' : beat.moment === 'stream' ? '栽在溪水旁 · 按時結果子' : beat.moment === 'gift' ? '領受旅途裝備' : '';
    $('#opening-gear').hidden = !beat.gear;
    if (beat.gear) {
      $('#opening-gear').innerHTML = `${gearSprite(beat.gear)}<span>從裝備包取出：<strong>${{belt:'真理腰帶',breastplate:'公義護心鏡',boots:'平安福音的鞋',shield:'信心盾牌',helmet:'救恩頭盔',sword:'聖靈寶劍'}[beat.gear]}</strong></span>`;
    }
    $('#opening-next').textContent = index === STORY.length - 1 ? '接回原來的進度 →' : '下一段 →';
    $('#opening-skip').hidden = isRequired();
    $('#opening-skip').textContent = index === STORY.length - 1 ? '打開裝備包' : '略過故事';
    $('#opening-speak').textContent = '重聽本句';
    if (voiceOn) sound(beat.sound || 'storyPage');
    if (voiceOn) { speak(); if (index + 1 < STORY.length) clipFor(index + 1); }
  }
  function open({ start = false } = {}) {
    if (!getAvatar()) return;
    clipFor(0);
    if (!remainingArtRequested) {
      ['assets/garden-avatars-reach.webp', 'assets/gardener-gift.webp', 'assets/gardener-teaching.webp'].forEach(source => { const picture = new Image(); picture.src = source; });
      remainingArtRequested = true;
    }
    stopVoice(); index = 0; voiceOn = false; closeIntent = false;
    $('#opening-cover').hidden = false;
    $('#opening-flow').hidden = true;
    $('#opening-description').textContent = '從一粒小小的種子開始，聽園丁講一個從聖經而來的故事，然後帶著神所賜的全副軍裝走進花園。';
    $('#opening-dialog [data-close]').hidden = isRequired();
    openDialog('opening-dialog');
    if (start) begin();
  }
  function begin() {
    voiceOn = true;
    $('#opening-cover').hidden = true;
    $('#opening-flow').hidden = false;
    const audioWasReady = audio.context?.state === 'running';
    audio.setMode('story'); enableStoryAudio();
    void audio.unlock().then(ready => {
      if (ready && !audioWasReady && dialog.open && index === 0) sound('storySeed');
    });
    render();
    $('#opening-next').focus({ preventScroll: true });
  }
  async function finish() {
    if (saving) return;
    saving = true; stopVoice();
    const controls = ['#opening-next', '#opening-skip', '#opening-speak'];
    controls.forEach(id => $(id).disabled = true);
    $('#opening-audio-status').textContent = '正在保存開場完成紀錄…';
    try {
      await markSeen(); closeIntent = true; closeDialog('opening-dialog');
    } catch (error) {
      $('#opening-audio-status').textContent = `${(error.message || '暫時無法保存').replace(/[。；]+$/, '')}；請按「接回原來的進度」重試。原有紀錄仍保留。`;
    } finally { saving = false; controls.forEach(id => $(id).disabled = false); }
  }
  $('#opening-start').addEventListener('click', begin);
  $('#opening-speak').addEventListener('click', () => speaking ? stopVoice() : speak());
  $('#gardener-voice-preview').addEventListener('click', () => previewing && speaking ? stopVoice() : readAloud(1, true));
  $('#opening-next').addEventListener('click', () => {
    if (saving) return;
    stopVoice();
    if (index === STORY.length - 1) { finish('read'); return; }
    index++; render();
  });
  $('#opening-skip').addEventListener('click', () => { if (!isRequired() && !saving) { stopVoice(); closeDialog('opening-dialog'); } });
  $('#story-replay').addEventListener('click', () => open({ start: true }));
  dialog.addEventListener('close', () => { stopVoice(); audio.setMode('garden'); if (!closeIntent) $('#story-replay').focus({ preventScroll: true }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); });
  return { open };
}
