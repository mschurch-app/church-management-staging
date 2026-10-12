// Original adaptive score: warm garden, suspense, combat, Boss and victory.
// Synthesized locally; no external audio downloads or autoplay dependency.
export class GardenAudio {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus; this.mode = 'garden'; this.prefs = {}; this.nodes = new Set();
    this.victoryPlayed = false; this.victoryUntil = 0;
    this.hidden = false; this.ducked = false; this.timer = null; this.step = 0; this.nextAt = 0;
  }
  configure(prefs) {
    this.prefs = prefs;
    if (!prefs.music) this.stopScore();
    this.updateLevels(); this.startScore(); this.report();
  }
  async unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { this.onStatus('此瀏覽器暫不支援遊戲音訊。'); return false; }
      if (!this.context) {
        this.context = new Audio();
        this.musicBus = this.context.createGain(); this.fxBus = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -16; limiter.knee.value = 12; limiter.ratio.value = 5;
        this.musicBus.connect(limiter); this.fxBus.connect(limiter); limiter.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 2), this.context.sampleRate);
        const data = this.noise.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.context.onstatechange = () => {
          if (this.context.state === 'running') this.startScore(); else this.stopScore();
          this.report();
        };
      }
      await this.context.resume(); this.updateLevels(); this.startScore(); this.report();
      return this.context.state === 'running';
    } catch { this.onStatus('聲音尚未開始，請點「開始播放」再試一次。'); return false; }
  }
  report() {
    this.onStatus(this.hidden ? '切到背景時，音樂會暫停。' : !this.prefs.music && !this.prefs.effects ? '音樂與音效已關閉。' : this.context?.state === 'running' ? '聲音已就緒，會隨花園與戰鬥切換。' : '點「開始播放」，或點一下花園，即可開啟聲音。');
  }
  updateLevels() {
    if (!this.context) return;
    const at = this.context.currentTime;
    this.musicBus.gain.setTargetAtTime(this.prefs.music ? (this.prefs.musicVolume ?? .45) * (this.ducked ? .12 : .55) : 0, at, .12);
    this.fxBus.gain.setTargetAtTime(this.prefs.effects ? (this.prefs.effectsVolume ?? .65) * .65 : 0, at, .025);
  }
  duck(value) { this.ducked = value; this.updateLevels(); }
  setHidden(value) {
    this.hidden = value;
    if (value) {
      this.stopScore();
      for (const entry of [...this.nodes]) this.retire(entry);
      void this.context?.suspend().catch(() => {});
    } else if (this.context) { void this.unlock(); }
    this.report();
  }
  setMode(mode) {
    if (mode === this.mode) { this.startScore(); return; }
    this.mode = mode; this.stopScore(); this.step = 0;
    this.victoryPlayed = false;
    this.victoryUntil = mode === 'victory' ? performance.now() + 3000 : 0;
    this.startScore();
  }
  playVictory() {
    if (this.mode !== 'victory' || this.victoryPlayed || this.hidden || !this.prefs.music || this.context?.state !== 'running') return;
    const remaining = (this.victoryUntil - performance.now()) / 1000;
    if (remaining < .25) return;
    this.victoryPlayed = true;
    const at = this.context.currentTime + .03, scale = Math.min(1, remaining / 2.85);
    // A clear major-key fanfare, kept within the three-second celebration.
    [60, 64, 67, 72, 76, 79, 84].forEach((note, i) => this.tone(note, at + i * .16 * scale, .85 * scale, 'bell', .24, this.musicBus));
    [48, 55, 60, 64].forEach(note => this.tone(note, at + .85 * scale, 1.9 * scale, 'pad', .11, this.musicBus));
    [72, 76, 79].forEach(note => this.tone(note, at + 1.35 * scale, 1.1 * scale, 'string', .1, this.musicBus));
  }
  retire(entry) {
    this.nodes.delete(entry);
    try {
      entry.gain.gain.cancelScheduledValues(this.context.currentTime);
      entry.gain.gain.setTargetAtTime(.0001, this.context.currentTime, .025);
      entry.source.stop(this.context.currentTime + .12);
    } catch { /* A finished voice is already disconnected. */ }
  }
  stopScore() {
    clearInterval(this.timer); this.timer = null;
    for (const entry of [...this.nodes]) if (entry.bus === this.musicBus) this.retire(entry);
  }
  startScore() {
    if (this.mode === 'victory') { this.playVictory(); return; }
    if (this.timer || this.hidden || !this.prefs.music || this.context?.state !== 'running' || this.mode === 'victory') return;
    this.nextAt = this.context.currentTime + .05;
    this.schedule(); this.timer = setInterval(() => this.schedule(), 90);
  }
  schedule() {
    if (this.context?.state !== 'running' || this.hidden) return;
    const bpm = { garden: 76, event: 100, battle: 124, boss: 146 }[this.mode] || 76;
    const length = 60 / bpm / 2;
    if (this.nextAt < this.context.currentTime) this.nextAt = this.context.currentTime + .03;
    while (this.nextAt < this.context.currentTime + .25) {
      this.scoreStep(this.step++, this.nextAt, length); this.nextAt += length;
    }
  }
  scoreStep(step, at, length) {
    const beat = step % 8, bar = Math.floor(step / 8) % 16, bus = this.musicBus;
    const peaceful = this.mode === 'garden', combat = ['battle', 'boss'].includes(this.mode), boss = this.mode === 'boss';
    const harmony = peaceful ? [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 55]] : [[45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55], [40, 44, 47, 52]];
    const chord = harmony[Math.floor(bar / 2) % 4];
    if (beat === 0) {
      chord.forEach(note => this.tone(note, at, length * 7.8, 'pad', peaceful ? .035 : .045, bus));
      this.tone(chord[0] - 12, at, length * (peaceful ? 4 : 1.7), 'bass', .14, bus);
    }
    if (peaceful) {
      const melody = [7, null, 4, 2, 0, null, 4, 7, 9, 7, 4, null, 2, 4, 0, null];
      const pitch = melody[(step + Math.floor(bar / 4) * 4) % melody.length];
      if (pitch !== null) this.tone(chord[0] + 24 + pitch, at, length * 2.3, 'bell', .065, bus);
      if (beat % 2 === 0) this.tone(chord[(beat / 2 + bar) % 4] + 12, at, length * 2.5, 'pluck', .065, bus);
      if (bar % 4 === 0 && beat === 6) this.chirp(at, bus, .018);
      return;
    }
    // Minor ostinato and a rising phrase make the transition into battle audible.
    const arp = [0, 2, 1, 3, 0, 2, 3, 1];
    this.tone(chord[arp[beat]] + (boss ? 12 : 0), at, length * .8, 'pluck', combat ? .13 : .07, bus);
    if (combat && beat % 2 === 0) this.tone(chord[0] - 12, at, length * .85, 'bass', .15, bus);
    if (combat && bar % 2 && beat >= 4) this.tone(chord[beat % 4] + 24, at, length * .7, 'string', .07, bus);
    if (beat === 0 || beat === 4 || (boss && beat === 7)) this.drum(at, boss ? .21 : combat ? .15 : .075, bus);
    if (combat && (beat === 2 || beat === 6)) this.hiss(at, .1, 1600, .06, bus);
    if (combat || beat % 2 === 0) this.hiss(at, .025, 6000, boss ? .032 : .018, bus);
  }
  voice(source, gain, bus, at, duration) {
    const entry = { source, gain, bus }; this.nodes.add(entry);
    source.connect(gain); gain.connect(bus); source.start(at); source.stop(at + duration);
    source.onended = () => { this.nodes.delete(entry); source.disconnect(); gain.disconnect(); };
  }
  tone(note, at, duration, instrument, volume, bus = this.fxBus) {
    if (!this.context || this.nodes.size > 160) return;
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    const frequency = 440 * 2 ** ((note - 69) / 12);
    osc.type = instrument === 'bass' || instrument === 'pluck' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(frequency, at);
    if (instrument === 'string') { osc.type = 'triangle'; osc.detune.setValueAtTime(-5, at); osc.detune.linearRampToValueAtTime(5, at + duration); }
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), at + Math.min(duration / 3, instrument === 'pad' ? .25 : .012));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    this.voice(osc, gain, bus, at, duration + .02);
    if (instrument === 'bell') this.tone(note + 19, at, duration * .6, 'sine', volume * .17, bus);
  }
  hiss(at, duration, frequency, volume, bus = this.fxBus) {
    if (!this.context || this.nodes.size > 160) return;
    const noise = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    noise.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = frequency;
    const entry = { source: noise, gain, bus }; this.nodes.add(entry);
    noise.connect(filter); filter.connect(gain); gain.connect(bus);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    noise.start(at); noise.stop(at + duration + .02);
    noise.onended = () => { this.nodes.delete(entry); noise.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  drum(at, volume, bus = this.fxBus) {
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.frequency.setValueAtTime(130, at); osc.frequency.exponentialRampToValueAtTime(43, at + .16);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .24);
    this.voice(osc, gain, bus, at, .27);
  }
  chirp(at, bus = this.fxBus, volume = .08) {
    const osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.frequency.setValueAtTime(1700, at); osc.frequency.exponentialRampToValueAtTime(2900, at + .07); osc.frequency.exponentialRampToValueAtTime(1900, at + .15);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .02); gain.gain.exponentialRampToValueAtTime(.0001, at + .17);
    this.voice(osc, gain, bus, at, .2);
  }
  effect(kind) {
    if (!this.prefs.effects || this.hidden || this.context?.state !== 'running') return;
    const at = this.context.currentTime + .005;
    const phrase = (notes, instrument = 'bell', duration = .3, volume = .13) => notes.forEach((n, i) => this.tone(n, at + i * .09, duration, instrument, volume));
    switch (kind) {
      case 'bag': this.hiss(at, .15, 850, .09); phrase([48, 55], 'pluck', .16); break;
      case 'draw': this.hiss(at, .27, 1700, .13); phrase([64, 71, 76], 'bell', .3); break;
      case 'wrong': phrase([52, 46], 'triangle', .17, .12); break;
      case 'incoming': this.hiss(at,.3,600,.1);this.drum(at+.22,.22);phrase([43,38],'triangle',.2,.08);break;
      case 'sword': this.hiss(at, .27, 1100, .25); phrase([76, 88], 'bell', .17, .12); break;
      case 'shield': this.drum(at, .22); phrase([45, 57, 69], 'bell', .45, .17); break;
      case 'belt': this.hiss(at, .05, 2500, .2); phrase([60, 67], 'pluck', .16); break;
      case 'breastplate': this.hiss(at, .26, 2300, .09); phrase([72, 79], 'bell', .35); break;
      case 'boots': this.drum(at, .1); this.drum(at + .19, .075); this.chirp(at + .28); break;
      case 'bird': this.chirp(at); this.chirp(at + .24, this.fxBus, .06); break;
      case 'helmet': phrase([72, 76, 79], 'bell', .6); break;
      case 'water': [0, 1, 2, 3, 4, 5].forEach(i => this.tone(80 + i % 3 * 5, at + i * .09, .24, 'sine', .1)); this.hiss(at, .65, 3500, .045); break;
      case 'xp': phrase([72, 79, 84], 'bell', .45); break;
      case 'level': phrase([60, 64, 67, 72, 79, 84], 'bell', .8); break;
      case 'enter': this.drum(at, .2); this.hiss(at + .08, .45, 900, .12); phrase([45, 52, 57], 'string', .45); break;
      default: phrase([67, 74], 'pluck', .2, .095);
    }
  }
}
