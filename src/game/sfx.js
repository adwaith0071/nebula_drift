// Tiny WebAudio synth — every sound is generated, no audio files needed.
const VOLUME = 0.4;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Must be called from a user gesture (browsers block audio otherwise).
  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : VOLUME;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, len);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : VOLUME;
  }

  tone(f0, f1, dur, type = 'sine', vol = 0.1, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  burst(dur, vol, cutoff) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  shoot() {
    this.tone(900, 300, 0.08, 'square', 0.035);
  }

  hit() {
    this.tone(260, 120, 0.06, 'triangle', 0.09);
  }

  boom(big = false) {
    this.burst(big ? 0.8 : 0.3, big ? 0.55 : 0.25, big ? 1000 : 1700);
    this.tone(big ? 130 : 190, 40, big ? 0.55 : 0.25, 'sine', 0.3);
  }

  hurt() {
    this.tone(170, 50, 0.4, 'sawtooth', 0.2);
    this.burst(0.25, 0.3, 900);
  }

  dash() {
    this.burst(0.2, 0.18, 3200);
    this.tone(300, 900, 0.15, 'sine', 0.06);
  }

  pickup() {
    [660, 880, 1320].forEach((f, i) => this.tone(f, f, 0.1, 'sine', 0.12, i * 0.06));
  }

  wave(boss = false) {
    if (boss) {
      this.tone(110, 55, 0.9, 'sawtooth', 0.16);
      this.tone(165, 82, 0.9, 'sawtooth', 0.1, 0.15);
    } else {
      this.tone(330, 660, 0.3, 'triangle', 0.12);
      this.tone(495, 990, 0.3, 'triangle', 0.09, 0.12);
    }
  }
}
