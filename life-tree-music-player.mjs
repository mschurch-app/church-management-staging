// One reusable streaming element, with visible loading and cancellable playback.
// GainNode controls the fade on iPhone, where media.volume is not reliable.
export class SceneMusicPlayer {
  constructor() {
    this.media = new Audio();
    this.media.loop = true;
    this.media.preload = 'metadata';
    this.media.setAttribute('playsinline', '');
    this.source = ''; this.wanted = false; this.failed = false;
    this.pending = false; this.serial = 0; this.level = .27; this.ducked = false;
    this.media.addEventListener('playing', () => {
      if (!this.wanted || this.failed || document.hidden) { this.silence(); this.media.pause(); return; }
      const restarting = this.pending;
      clearTimeout(this.deadline); this.pending = false;
      this.setLevel(restarting ? 1.6 : .15);
      this.report('playing', '音樂已開始，正輕柔淡入。');
    });
    for (const event of ['waiting', 'stalled']) this.media.addEventListener(event, () => {
      if (this.wanted && !this.failed && !document.hidden && !this.media.paused) this.loading();
    });
    this.media.addEventListener('error', () => {
      if (this.wanted) this.fail('音樂暫時無法載入，可以繼續玩，稍後再試。');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.stop(); void this.context?.suspend().catch(() => {}); }
      else if (this.wanted) this.sync(this.source, true, this.level);
    });
    window.addEventListener('pagehide', () => { this.stop(); void this.context?.suspend().catch(() => {}); });
  }
  get paused() { return this.media.paused; }
  sync(source, enabled, volume = .27) {
    if (source !== this.source) {
      this.stop(); this.failed = false; this.source = source;
      if (source) this.media.src = source;
      else { this.media.removeAttribute('src'); this.media.load(); }
    }
    this.wanted = !!source && enabled;
    this.level = Math.min(1, Math.max(0, Number(volume) || 0));
    if (!this.wanted || document.hidden) { this.stop(); return; }
    if (this.failed) { this.report('error', this.failureMessage); return; }
    if (!this.context || this.context.state !== 'running') {
      this.report('ready', '點一下開始音樂，花園也可以先玩。'); return;
    }
    if (this.pending) return;
    if (!this.media.paused) { this.setLevel(.15); return; }
    this.start();
  }
  gesture(retry = false) {
    if (!this.wanted || document.hidden || (this.failed && !retry)) return;
    if (retry) { this.stop(); this.failed = false; if (this.media.error) this.media.load(); }
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw Error('audio_unavailable');
        this.context = new AudioContext();
        this.gain = this.context.createGain(); this.gain.gain.value = 0;
        this.node = this.context.createMediaElementSource(this.media);
        this.node.connect(this.gain); this.gain.connect(this.context.destination);
      }
      void this.context.resume().catch(() => this.fail('聲音尚未開啟，請點「重試音樂」。'));
      // Call play within the gesture; do not wait for a network or resume promise.
      this.start();
    } catch { this.fail('聲音尚未開啟，請點「重試音樂」。'); }
  }
  start() {
    if (this.pending || !this.media.paused || !this.wanted || this.failed || document.hidden) return;
    const serial = ++this.serial;
    this.silence(); this.loading();
    try {
      void this.media.play().catch(error => {
        if (serial !== this.serial || !this.wanted) return;
        this.fail(error.name === 'NotAllowedError' ? '請點「重試音樂」，允許這次播放。' : '音樂暫時無法載入，可以繼續玩，稍後再試。');
      });
    } catch { this.fail('音樂暫時無法載入，可以繼續玩，稍後再試。'); }
  }
  loading() {
    if (this.pending) return;
    this.pending = true; this.silence();
    this.report('loading', '音樂載入中…你可以先照顧花園。');
    this.deadline = setTimeout(() => this.fail('音樂載入較久，已先暫停；準備好再重試。'), 12000);
  }
  fail(message) {
    this.stop(); this.failed = true; this.failureMessage = message;
    if (this.wanted && !document.hidden) this.report('error', message);
  }
  stop() {
    ++this.serial; clearTimeout(this.deadline); this.pending = false;
    this.silence(); this.media.pause(); this.report('idle', '');
  }
  pause() { this.wanted = false; this.stop(); }
  duck(value) { this.ducked = value; if (!this.pending && !this.media.paused) this.setLevel(.2); }
  silence() {
    if (!this.gain) return;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(0, this.context.currentTime);
  }
  setLevel(seconds) {
    if (!this.gain) return;
    const parameter = this.gain.gain, at = this.context.currentTime;
    const current = parameter.value;
    parameter.cancelScheduledValues(at); parameter.setValueAtTime(current, at);
    parameter.linearRampToValueAtTime(this.level * (this.ducked ? .13 : 1), at + seconds);
  }
  report(state, message) {
    if (!this.notice) {
      const anchor = document.querySelector('.page-heading') || document.querySelector('#festival-audio-status');
      if (!anchor) return;
      this.notice = document.createElement('div'); this.notice.className = 'scene-music-notice'; this.notice.hidden = true;
      this.label = document.createElement('span'); this.label.setAttribute('role', 'status'); this.label.setAttribute('aria-live', 'polite');
      this.retry = document.createElement('button'); this.retry.type = 'button'; this.retry.textContent = '重試音樂';
      this.retry.onclick = () => this.gesture(true);
      this.notice.append(this.label, this.retry); anchor.after(this.notice);
      const detailAnchor = document.querySelector('#audio-status');
      if (detailAnchor) { this.detail = document.createElement('p'); this.detail.className = 'scene-music-detail'; this.detail.setAttribute('role', 'status'); detailAnchor.before(this.detail); }
    }
    if (this.state === state && this.label.textContent === message) return;
    this.state = state; this.notice.dataset.state = state;
    this.notice.hidden = !['loading', 'ready', 'error'].includes(state);
    this.label.textContent = message; this.retry.hidden = !['ready', 'error'].includes(state);
    this.retry.textContent = state === 'ready' ? '開始音樂' : '重試音樂';
    const button = document.querySelector('#sound') || document.querySelector('#festival-sound');
    if (button) { button.dataset.musicState = state; button.setAttribute('aria-busy', String(state === 'loading')); }
    if (this.detail) { this.detail.textContent = message; this.detail.dataset.state = state; this.detail.hidden = state === 'idle'; }
  }
}
